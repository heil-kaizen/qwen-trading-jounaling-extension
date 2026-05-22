/**
 * Helius API service (optional enrichment)
 * Enhanced transaction parsing and wallet history
 */

import type { Transaction, ApiResponse } from '../types';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../constants';

const HELIUS_BASE_URL = 'https://api.helius.xyz/v0';

interface HeliusTransaction {
  signature: string;
  timestamp: number;
  tokenTransfers: Array<{
    fromTokenAccount: string;
    toTokenAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard: string;
  }>;
  nativeTransfers: Array<{
    accountAddress: string;
    amount: number;
  }>;
  transactionError: string | null;
  instructions: Array<{
    programId: string;
    accounts: string[];
    data: string;
  }>;
}

export class HeliusService {
  private apiKey: string;
  private rateLimitDelay: number = CONSTANTS.API_RATE_LIMIT_DELAY_MS;
  private lastRequestTime: number = 0;

  constructor(apiKey: string) {
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
      const url = new URL(`${HELIUS_BASE_URL}${endpoint}`);
      url.searchParams.append('api-key', this.apiKey);

      const response = await fetch(url.toString(), {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        logger.error('HeliusAPI', `Request failed: ${response.status}`, { 
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
      logger.error('HeliusAPI', 'Network error', { endpoint, error });
      return {
        data: null as unknown as T,
        error: error instanceof Error ? error.message : 'Network error',
        success: false,
      };
    }
  }

  /**
   * Get enriched transaction history for a wallet
   */
  async getEnrichedTransactions(
    walletAddress: string,
    limit: number = 50,
    beforeSignature?: string
  ): Promise<ApiResponse<Transaction[]>> {
    const params: Record<string, string | number> = {
      address: walletAddress,
      limit,
    };

    if (beforeSignature) {
      params.before = beforeSignature;
    }

    const result = await this.request<HeliusTransaction[]>(
      `/transactions`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );

    if (!result.success || !result.data) {
      return { data: [], error: result.error, success: result.success };
    }

    const transactions: Transaction[] = result.data
      .filter(tx => !tx.transactionError) // Only successful transactions
      .map(tx => this.parseHeliusTransaction(tx));

    return { data: transactions, success: true };
  }

  /**
   * Parse Helius transaction into our internal format
   */
  private parseHeliusTransaction(heliusTx: HeliusTransaction): Transaction {
    // Determine transaction type based on token transfers
    const inputTransfer = heliusTx.tokenTransfers[0];
    const outputTransfer = heliusTx.tokenTransfers[1];

    let type: Transaction['type'] = 'swap';
    let source: Transaction['source'] = 'unknown';

    // Check for DEX programs in instructions
    for (const instruction of heliusTx.instructions) {
      if (instruction.programId === CONSTANTS.DEX_PROGRAMS.JUPITER) {
        source = 'jupiter';
        break;
      } else if (instruction.programId === CONSTANTS.DEX_PROGRAMS.RAYDIUM) {
        source = 'raydium';
        break;
      } else if (instruction.programId === CONSTANTS.DEX_PROGRAMS.ORCA) {
        source = 'orca';
        break;
      }
    }

    return {
      signature: heliusTx.signature,
      timestamp: heliusTx.timestamp,
      type,
      source,
      inputToken: inputTransfer
        ? {
            mint: inputTransfer.mint,
            amount: inputTransfer.tokenAmount.toString(),
            usdValue: undefined,
          }
        : { mint: '', amount: '0' },
      outputToken: outputTransfer
        ? {
            mint: outputTransfer.mint,
            amount: outputTransfer.tokenAmount.toString(),
            usdValue: undefined,
          }
        : { mint: '', amount: '0' },
      fee: heliusTx.nativeTransfers.reduce((sum, t) => sum + t.amount, 0) / 1e9, // Convert lamports to SOL
      status: heliusTx.transactionError ? 'failed' : 'confirmed',
    };
  }

  /**
   * Get webhook events for real-time monitoring (future feature)
   */
  async createWebhook(
    walletAddress: string,
    webhookUrl: string
  ): Promise<ApiResponse<{ webhookId: string }>> {
    const result = await this.request<{ webhookId: string }>(
      '/webhooks',
      {
        method: 'POST',
        body: JSON.stringify({
          webhookURL: webhookUrl,
          transactionTypes: ['ALL'],
          accountAddresses: [walletAddress],
        }),
      }
    );

    return result;
  }

  /**
   * Get NFT holdings (for filtering spam tokens)
   */
  async getNFTs(walletAddress: string): Promise<ApiResponse<string[]>> {
    const result = await this.request<Array<{ mint: string }>>(
      `/nfts/${walletAddress}`
    );

    if (!result.success || !result.data) {
      return { data: [], error: result.error, success: result.success };
    }

    return { 
      data: result.data.map(nft => nft.mint), 
      success: true 
    };
  }
}

// Singleton instance (created only when API key is provided)
let heliusInstance: HeliusService | null = null;

export function getHeliusService(apiKey?: string): HeliusService | null {
  if (!apiKey) {
    return null;
  }
  
  if (!heliusInstance) {
    heliusInstance = new HeliusService(apiKey);
  }
  
  return heliusInstance;
}
