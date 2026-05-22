/**
 * Core type definitions for TradeReflect
 */

export type WalletAddress = string;

export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export interface Transaction {
  signature: string;
  timestamp: number;
  type: 'swap' | 'buy' | 'sell' | 'transfer' | 'airdrop';
  source: 'jupiter' | 'raydium' | 'orca' | 'unknown';
  inputToken: TokenAmount;
  outputToken: TokenAmount;
  fee: number;
  status: 'confirmed' | 'failed' | 'pending';
}

export interface TokenAmount {
  mint: string;
  amount: string;
  usdValue?: number;
}

export interface TokenPosition {
  id: string;
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  
  // Position tracking
  totalBought: number;
  totalSold: number;
  remainingBalance: number;
  
  // Price tracking
  averageEntryPrice: number;
  weightedBuyCost: number;
  totalSellRevenue: number;
  
  // PNL tracking
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  currentPrice: number;
  
  // Timestamps
  openedAt: number;
  closedAt?: number;
  lastUpdatedAt: number;
  
  // Status
  tradeStatus: 'open' | 'closed' | 'dust';
  
  // Transaction history for this position
  transactionIds: string[];
}

export interface TradeReflection {
  id: string;
  positionId: string;
  tokenSymbol: string;
  
  // Trade outcomes
  realizedPnl: number;
  pnlPercentage: number;
  durationHours: number;
  
  // Entry questions
  entryReason: string;
  attraction: string;
  wasPlanned: boolean;
  
  // Outcome-specific questions
  ifProfit?: {
    whyItWorked: string;
    correctSignals: string;
    wouldRepeat: boolean;
  };
  
  ifLoss?: {
    mistakeCause: string;
    wasFomo: boolean;
    wasLateEntry: boolean;
    riskManagementIgnored: boolean;
    improvement: string;
  };
  
  // Metadata
  createdAt: number;
  sessionId?: string;
}

export interface TradingSession {
  id: string;
  startedAt: number;
  endedAt?: number;
  
  // Stats
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalRealizedPnl: number;
  
  // Behavioral tracking
  overtradingDetected: boolean;
  repeatedMistakes: string[];
  
  isActive: boolean;
}

export interface WalletConfig {
  address: WalletAddress;
  label?: string;
  addedAt: number;
  isActive: boolean;
}

export interface AppSettings {
  dustThresholdUsd: number;
  pollingIntervalMs: number;
  sessionDurationHours: number;
  enableHeliusEnrichment: boolean;
}

export interface PortfolioSnapshot {
  totalValueUsd: number;
  totalCostBasisUsd: number;
  totalUnrealizedPnlUsd: number;
  totalRealizedPnlUsd: number;
  positions: TokenPosition[];
  timestamp: number;
}

export type TradeEventType = 
  | 'POSITION_OPENED'
  | 'POSITION_UPDATED'
  | 'POSITION_CLOSED'
  | 'REFLECTION_SUBMITTED'
  | 'SESSION_STARTED'
  | 'SESSION_ENDED';

export interface TradeEvent {
  type: TradeEventType;
  payload: unknown;
  timestamp: number;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
  success: boolean;
}
