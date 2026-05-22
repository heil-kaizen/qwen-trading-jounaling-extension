/**
 * Background Service Worker
 * 
 * Responsibilities:
 * - Poll wallet activity using SolanaTracker API
 * - Normalize transactions
 * - Detect swaps and update token positions
 * - Detect trade completion
 * - Trigger reflection popup events
 */

import { getSolanaTrackerService } from '~services/solanaTracker';
import { getHeliusService } from '~services/helius';
import { getTradeEngine } from '~trade-engine';
import {
  savePosition,
  getAllPositions,
  saveTransaction,
  getActiveSession,
  saveSession,
  getSettings,
  getCachedData,
  setCachedData,
  bulkSavePositions,
} from '~storage';
import type { TokenPosition, Transaction, TradingSession } from '~types';
import { CONSTANTS } from '~constants';
import { logger } from '~utils/logger';
import { v4 as uuidv4 } from 'uuid';

// State
let pollingIntervalId: number | null = null;
let isPolling = false;
let lastProcessedSignature: string | null = null;

// Services (initialized on start)
let solanaTracker = getSolanaTrackerService();
let heliusService = getHeliusService();
let tradeEngine = getTradeEngine();

/**
 * Initialize background service
 */
async function initialize() {
  logger.info('Background', 'Initializing TradeReflect background service');

  // Load settings
  const settings = await getSettings();
  if (settings) {
    tradeEngine = getTradeEngine(settings.dustThresholdUsd);
    
    if (settings.enableHeliusEnrichment && process.env.HELIUS_API_KEY) {
      heliusService = getHeliusService(process.env.HELIUS_API_KEY);
    }
  }

  // Start polling
  startPolling();

  logger.info('Background', 'Initialization complete');
}

/**
 * Start polling for wallet activity
 */
function startPolling() {
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
  }

  pollingIntervalId = setInterval(async () => {
    await pollWalletActivity();
  }, CONSTANTS.DEFAULT_POLLING_INTERVAL_MS) as unknown as number;

  logger.info('Background', `Polling started with interval ${CONSTANTS.DEFAULT_POLLING_INTERVAL_MS}ms`);
}

/**
 * Stop polling
 */
function stopPolling() {
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
  logger.info('Background', 'Polling stopped');
}

/**
 * Main polling function
 */
async function pollWalletActivity() {
  if (isPolling) {
    logger.debug('Background', 'Skipping poll - already in progress');
    return;
  }

  isPolling = true;

  try {
    // Get active wallet from storage
    const walletAddress = await getActiveWalletAddress();
    
    if (!walletAddress) {
      logger.debug('Background', 'No active wallet configured');
      return;
    }

    logger.debug('Background', 'Polling wallet activity', { wallet: walletAddress });

    // Fetch new transactions
    const transactions = await fetchNewTransactions(walletAddress);
    
    if (transactions.length === 0) {
      logger.debug('Background', 'No new transactions');
      return;
    }

    logger.info('Background', `Found ${transactions.length} new transactions`);

    // Process transactions through trade engine
    await processTransactions(transactions, walletAddress);

    // Check and update session
    await updateSession();

  } catch (error) {
    logger.error('Background', 'Error during polling', error);
  } finally {
    isPolling = false;
  }
}

/**
 * Get active wallet address from storage
 */
async function getActiveWalletAddress(): Promise<string | null> {
  try {
    // In production, this would use chrome.storage or IndexedDB
    // For now, we'll use a placeholder
    const response = await chrome.storage.local.get(['activeWallet']);
    return response.activeWallet || null;
  } catch (error) {
    logger.error('Background', 'Error getting wallet address', error);
    return null;
  }
}

/**
 * Fetch new transactions since last processed signature
 */
async function fetchNewTransactions(walletAddress: string): Promise<Transaction[]> {
  try {
    // Try Helius first if enabled
    if (heliusService) {
      const result = await heliusService.getEnrichedTransactions(
        walletAddress,
        CONSTANTS.MAX_TRANSACTIONS_PER_FETCH,
        lastProcessedSignature || undefined
      );

      if (result.success && result.data.length > 0) {
        lastProcessedSignature = result.data[0].signature;
        return result.data;
      }
    }

    // Fallback to SolanaTracker
    const result = await solanaTracker.getWalletTransactions(
      walletAddress,
      CONSTANTS.MAX_TRANSACTIONS_PER_FETCH,
      lastProcessedSignature || undefined
    );

    if (result.success && result.data.length > 0) {
      lastProcessedSignature = result.data[0].signature;
    }

    return result.data;
  } catch (error) {
    logger.error('Background', 'Error fetching transactions', error);
    return [];
  }
}

/**
 * Process transactions through trade engine
 */
async function processTransactions(
  transactions: Transaction[],
  walletAddress: string
): Promise<void> {
  // Get current positions
  const positions = await getAllPositions();

  // Get token prices for all mints involved
  const allMints = new Set<string>();
  transactions.forEach(tx => {
    if (tx.inputToken.mint) allMints.add(tx.inputToken.mint);
    if (tx.outputToken.mint) allMints.add(tx.outputToken.mint);
  });

  const tokenPrices = await getTokenPrices(Array.from(allMints));

  // Process each transaction
  const updatedPositions = new Map<string, TokenPosition>();
  const closedPositions: TokenPosition[] = [];

  for (const tx of transactions) {
    // Save transaction to storage
    await saveTransaction({ ...tx, walletAddress });

    // Find or create position in our working set
    const workingPositions = Array.from(updatedPositions.values());
    const existingForTx = positions.find(p => 
      !updatedPositions.has(p.id) && 
      (p.tokenMint === tx.inputToken.mint || p.tokenMint === tx.outputToken.mint)
    );

    const positionsToUse = existingForTx 
      ? [...workingPositions, existingForTx]
      : workingPositions;

    // Process through trade engine
    const results = tradeEngine.processTransaction(tx, positionsToUse, tokenPrices);

    for (const result of results) {
      updatedPositions.set(result.position.id, result.position);

      if (result.tradeClosed) {
        const closedPosition = tradeEngine.closePosition(result.position);
        closedPositions.push(closedPosition);
        updatedPositions.set(closedPosition.id, closedPosition);

        // Trigger reflection popup
        triggerReflectionPopup(closedPosition);
      }
    }
  }

  // Save updated positions
  if (updatedPositions.size > 0) {
    await bulkSavePositions(Array.from(updatedPositions.values()));
    logger.info('Background', `Saved ${updatedPositions.size} updated positions`);
  }

  // Notify popup of updates
  notifyPopupOfUpdates({
    type: 'POSITIONS_UPDATED',
    positions: Array.from(updatedPositions.values()),
    closedPositions,
  });
}

/**
 * Get token prices with caching
 */
async function getTokenPrices(mints: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  const mintsToFetch: string[] = [];

  // Check cache first
  for (const mint of mints) {
    const cached = await getCachedData<{ price: number }>(
      `price:${mint}`,
      CONSTANTS.PRICE_CACHE_TTL_MS
    );

    if (cached) {
      prices[mint] = cached.price;
    } else {
      mintsToFetch.push(mint);
    }
  }

  // Fetch missing prices
  if (mintsToFetch.length > 0) {
    const result = await solanaTracker.getTokenPrices(mintsToFetch);
    
    if (result.success) {
      for (const [mint, price] of Object.entries(result.data)) {
        prices[mint] = price;
        await setCachedData(`price:${mint}`, { price }, CONSTANTS.PRICE_CACHE_TTL_MS);
      }
    }
  }

  return prices;
}

/**
 * Update trading session
 */
async function updateSession(): Promise<void> {
  let session = await getActiveSession();

  if (!session) {
    // Start new session
    session = {
      id: uuidv4(),
      startedAt: Date.now(),
      isActive: true,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalRealizedPnl: 0,
      overtradingDetected: false,
      repeatedMistakes: [],
    };

    await saveSession(session);
    logger.info('Background', 'New trading session started', { sessionId: session.id });
  } else {
    // Check if session expired
    const sessionDurationHours = (Date.now() - session.startedAt) / (1000 * 60 * 60);
    
    if (sessionDurationHours >= CONSTANTS.SESSION_DURATION_HOURS) {
      // End session and show summary
      await endSession(session);
      
      // Start new session
      session = {
        id: uuidv4(),
        startedAt: Date.now(),
        isActive: true,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalRealizedPnl: 0,
        overtradingDetected: false,
        repeatedMistakes: [],
      };
      
      await saveSession(session);
      logger.info('Background', 'Previous session ended, new session started');
    }
  }
}

/**
 * End trading session and show summary
 */
async function endSession(session: TradingSession): Promise<void> {
  const updatedSession = {
    ...session,
    endedAt: Date.now(),
    isActive: false,
  };

  await saveSession(updatedSession);

  // Show session summary modal
  notifyPopupOfUpdates({
    type: 'SESSION_ENDED',
    session: updatedSession,
  });

  logger.info('Background', 'Session ended', { 
    sessionId: session.id,
    duration: updatedSession.endedAt - session.startedAt,
  });
}

/**
 * Trigger reflection popup for closed position
 */
function triggerReflectionPopup(position: TokenPosition): void {
  logger.info('Background', 'Triggering reflection popup', { 
    positionId: position.id,
    realizedPnl: position.realizedPnlUsd,
  });

  notifyPopupOfUpdates({
    type: 'POSITION_CLOSED',
    position,
  });
}

/**
 * Notify popup of updates via Chrome runtime message
 */
function notifyPopupOfUpdates(data: unknown): void {
  chrome.runtime.sendMessage(data).catch(() => {
    // Popup might not be open, which is fine
    logger.debug('Background', 'Could not send message to popup (not open)');
  });
}

/**
 * Handle messages from popup/content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logger.debug('Background', 'Received message', { message, sender });

  switch (message.type) {
    case 'GET_STATUS':
      sendResponse({
        isPolling,
        lastProcessedSignature,
        timestamp: Date.now(),
      });
      break;

    case 'START_POLLING':
      startPolling();
      sendResponse({ success: true });
      break;

    case 'STOP_POLLING':
      stopPolling();
      sendResponse({ success: true });
      break;

    case 'FORCE_POLL':
      pollWalletActivity().then(() => {
        sendResponse({ success: true });
      });
      return true; // Keep channel open for async response

    case 'SET_WALLET':
      chrome.storage.local.set({ activeWallet: message.wallet }).then(() => {
        sendResponse({ success: true });
      });
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return false;
});

// Initialize on startup
initialize();

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  logger.info('Background', 'Extension installed', { reason: details.reason });
  
  if (details.reason === 'install') {
    // Open welcome page or popup
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  }
});

// Cleanup on service worker termination
self.addEventListener('unload', () => {
  stopPolling();
  logger.info('Background', 'Service worker unloading');
});

export {};
