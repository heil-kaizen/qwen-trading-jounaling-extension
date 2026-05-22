/**
 * SolanaTracker API service
 * Primary API for wallet trades, token prices, and portfolio data
 */

import type { Transaction, TokenInfo, ApiResponse } from '../types';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../constants';

const BASE_URL = 'https://api.solanatracker.io';

interface SolanaTrackerWalletResponse {
  address: string;
  transactions: Array<{
    signature: string;
    timestamp: number;
    type: string;
    source: string;
    inputToken: {
      mint: string;
      amount: string;
      symbol: string;
    };
    outputToken: {
      mint: string;
      amount: string;
      symbol: string;
    };
    fee: number;
    status: string;
  }>;
}

interface SolanaTrackerTokenResponse {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  priceUsd: number;
  logoURI?: string;
}

export class SolanaTrackerService {
  private apiKey?: string;
  private rateLimitDelay: number = CONSTANTS.API_RATE_LIMIT_DELAY_MS;
  private lastRequestTime: number = 0;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve => 
        setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest)
      );
    }
    
    this.lastRequestTime = Date.now();
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    await this.rateLimit();

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        logger.error('SolanaTrackerAPI', `Request failed: ${response.status}`, { 
          endpoint, 
          status: response.status,
          error: errorText 
        });
        
        return {
          data: null as unknown as T,
          error: `HTTP ${response.status}: ${errorText}`,
          success: false,
        };
      }

      const data = await response.json();
      return { data, success: true };
    } catch (error) {
      logger.error('SolanaTrackerAPI', 'Network error', { endpoint, error });
      return {
        data: null as unknown as T,
        error: error instanceof Error ? error.message : 'Network error',
        success: false,
      };
    }
  }

  /**
   * Fetch wallet transaction history
   */
  async getWalletTransactions(
    walletAddress: string,
    limit: number = CONSTANTS.MAX_TRANSACTIONS_PER_FETCH,
    beforeSignature?: string
  ): Promise<ApiResponse<Transaction[]>> {
    const params = new URLSearchParams({
      address: walletAddress,
      limit: limit.toString(),
    });

    if (beforeSignature) {
      params.append('before', beforeSignature);
    }

    const result = await this.request<SolanaTrackerWalletResponse>(
      `/wallet/${walletAddress}/transactions?${params}`
    );

    if (!result.success || !result.data) {
      return { data: [], error: result.error, success: result.success };
    }

    const transactions: Transaction[] = result.data.transactions.map(tx => ({
      signature: tx.signature,
      timestamp: tx.timestamp,
      type: this.normalizeTransactionType(tx.type),
      source: this.normalizeSource(tx.source),
      inputToken: {
        mint: tx.inputToken.mint,
        amount: tx.inputToken.amount,
        usdValue: undefined, // Will be enriched later
      },
      outputToken: {
        mint: tx.outputToken.mint,
        amount: tx.outputToken.amount,
        usdValue: undefined,
      },
      fee: tx.fee,
      status: tx.status as 'confirmed' | 'failed' | 'pending',
    }));

    return { data: transactions, success: true };
  }

  /**
   * Get token information by mint address
   */
  async getTokenInfo(mint: string): Promise<ApiResponse<TokenInfo>> {
    const result = await this.request<SolanaTrackerTokenResponse>(`/token/${mint}`);

    if (!result.success || !result.data) {
      return { 
        data: null as unknown as TokenInfo, 
        error: result.error, 
        success: result.success 
      };
    }

    const token: TokenInfo = {
      mint: result.data.mint,
      symbol: result.data.symbol,
      name: result.data.name,
      decimals: result.data.decimals,
      logoURI: result.data.logoURI,
    };

    return { data: token, success: true };
  }

  /**
   * Get current token price in USD
   */
  async getTokenPrice(mint: string): Promise<ApiResponse<number>> {
    const result = await this.request<{ priceUsd: number }>(`/token/${mint}/price`);

    if (!result.success || !result.data) {
      return { data: 0, error: result.error, success: result.success };
    }

    return { data: result.data.priceUsd, success: true };
  }

  /**
   * Get multiple token prices at once
   */
  async getTokenPrices(mints: string[]): Promise<ApiResponse<Record<string, number>>> {
    const result = await this.request<Record<string, { priceUsd: number }>>(
      '/tokens/prices',
      {
        method: 'POST',
        body: JSON.stringify({ mints }),
      }
    );

    if (!result.success || !result.data) {
      return { data: {}, error: result.error, success: result.success };
    }

    const prices: Record<string, number> = {};
    for (const [mint, info] of Object.entries(result.data)) {
      prices[mint] = info.priceUsd;
    }

    return { data: prices, success: true };
  }

  /**
   * Get wallet portfolio summary
   */
  async getWalletPortfolio(walletAddress: string): Promise<ApiResponse<{
    totalValueUsd: number;
    tokens: Array<{
      mint: string;
      symbol: string;
      balance: string;
      valueUsd: number;
    }>;
  }>> {
    const result = await this.request(`/wallet/${walletAddress}/portfolio`);

    if (!result.success || !result.data) {
      return { 
        data: { totalValueUsd: 0, tokens: [] }, 
        error: result.error, 
        success: result.success 
      };
    }

    return { data: result.data, success: true };
  }

  /**
   * Normalize transaction type from API to our internal format
   */
  private normalizeTransactionType(type: string): Transaction['type'] {
    const lowerType = type.toLowerCase();
    
    if (lowerType.includes('swap')) return 'swap';
    if (lowerType.includes('buy')) return 'buy';
    if (lowerType.includes('sell')) return 'sell';
    if (lowerType.includes('airdrop')) return 'airdrop';
    if (lowerType.includes('transfer')) return 'transfer';
    
    return 'swap'; // Default to swap for DEX interactions
  }

  /**
   * Normalize source from API to our internal format
   */
  private normalizeSource(source: string): Transaction['source'] {
    const lowerSource = source.toLowerCase();
    
    if (lowerSource.includes('jupiter') || lowerSource.includes('jup')) return 'jupiter';
    if (lowerSource.includes('raydium') || lowerSource.includes('ray')) return 'raydium';
    if (lowerSource.includes('orca')) return 'orca';
    
    return 'unknown';
  }
}

// Singleton instance
let solanaTrackerInstance: SolanaTrackerService | null = null;

export function getSolanaTrackerService(apiKey?: string): SolanaTrackerService {
  if (!solanaTrackerInstance) {
    solanaTrackerInstance = new SolanaTrackerService(apiKey);
  }
  return solanaTrackerInstance;
}
