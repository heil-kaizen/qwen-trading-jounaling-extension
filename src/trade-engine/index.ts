/**
 * Trade Engine - Core business logic for position tracking and PNL calculation
 * 
 * This module is responsible for:
 * - Grouping transactions into token-level positions
 * - Tracking weighted average entry price
 * - Calculating realized and unrealized PNL
 * - Handling partial buys and sells
 * - Detecting trade completion (position closed)
 */

import type { TokenPosition, Transaction, TokenInfo } from '../types';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../constants';
import { v4 as uuidv4 } from 'uuid';

interface PositionUpdateResult {
  position: TokenPosition;
  tradeClosed: boolean;
  pnlChange: number;
}

export class TradeEngine {
  private dustThresholdUsd: number;

  constructor(dustThresholdUsd: number = CONSTANTS.DEFAULT_DUST_THRESHOLD_USD) {
    this.dustThresholdUsd = dustThresholdUsd;
  }

  /**
   * Update dust threshold
   */
  setDustThreshold(threshold: number): void {
    this.dustThresholdUsd = threshold;
  }

  /**
   * Process a new transaction and update/create positions
   * Returns array of updated positions
   */
  processTransaction(
    tx: Transaction,
    existingPositions: TokenPosition[],
    tokenPrices: Record<string, number>
  ): PositionUpdateResult[] {
    const results: PositionUpdateResult[] = [];

    // Skip non-trade transactions
    if (!this.isTradeTransaction(tx)) {
      logger.debug('TradeEngine', 'Skipping non-trade transaction', { 
        signature: tx.signature, 
        type: tx.type 
      });
      return results;
    }

    // Process output token (what was bought/received)
    if (tx.outputToken.mint && parseFloat(tx.outputToken.amount) > 0) {
      const outputResult = this.processBuySide(tx, existingPositions, tokenPrices);
      if (outputResult) {
        results.push(outputResult);
      }
    }

    // Process input token (what was sold/spent)
    if (tx.inputToken.mint && parseFloat(tx.inputToken.amount) > 0) {
      const inputResult = this.processSellSide(tx, existingPositions, tokenPrices);
      if (inputResult) {
        results.push(inputResult);
      }
    }

    return results;
  }

  /**
   * Check if transaction is a real trade (not transfer/airdrop)
   */
  private isTradeTransaction(tx: Transaction): boolean {
    // Ignore airdrops and transfers
    if (tx.type === 'airdrop' || tx.type === 'transfer') {
      return false;
    }

    // Must have both input and output tokens for a swap
    if (!tx.inputToken.mint || !tx.outputToken.mint) {
      return false;
    }

    // Must be from known DEX or marked as swap/buy/sell
    const validSources = ['jupiter', 'raydium', 'orca', 'unknown'];
    if (!validSources.includes(tx.source)) {
      return false;
    }

    return true;
  }

  /**
   * Process the buy side of a transaction (receiving tokens)
   */
  private processBuySide(
    tx: Transaction,
    existingPositions: TokenPosition[],
    tokenPrices: Record<string, number>
  ): PositionUpdateResult | null {
    const outputMint = tx.outputToken.mint;
    const outputAmount = parseFloat(tx.outputToken.amount);
    
    if (outputAmount <= 0) return null;

    // Get current price for the output token
    const currentPrice = tokenPrices[outputMint] || 0;
    const usdValue = outputAmount * currentPrice;

    // Find existing position or create new one
    let position = existingPositions.find(p => p.tokenMint === outputMint);
    
    if (!position) {
      // Create new position
      position = this.createNewPosition(tx, outputMint, outputAmount, currentPrice);
      logger.info('TradeEngine', 'Created new position', { 
        tokenMint: outputMint, 
        amount: outputAmount 
      });
    } else {
      // Update existing position (adding to it)
      position = this.addToPosition(position, tx, outputAmount, currentPrice, usdValue);
    }

    const tradeClosed = this.checkIfTradeClosed(position);
    const pnlChange = this.calculatePnlChange(position, currentPrice);

    return {
      position,
      tradeClosed,
      pnlChange,
    };
  }

  /**
   * Process the sell side of a transaction (spending tokens)
   */
  private processSellSide(
    tx: Transaction,
    existingPositions: TokenPosition[],
    tokenPrices: Record<string, number>
  ): PositionUpdateResult | null {
    const inputMint = tx.inputToken.mint;
    const inputAmount = parseFloat(tx.inputToken.amount);
    
    if (inputAmount <= 0) return null;

    // Find existing position for the input token
    const position = existingPositions.find(p => p.tokenMint === inputMint);
    
    if (!position) {
      // Selling something we don't have a position for
      // This could be a token we got via airdrop or transfer
      logger.warn('TradeEngine', 'Sell without existing position', { 
        tokenMint: inputMint,
        signature: tx.signature 
      });
      return null;
    }

    // Get current price for valuation
    const currentPrice = tokenPrices[inputMint] || position.averageEntryPrice;
    const usdValue = inputAmount * currentPrice;

    // Update position with sale
    const updatedPosition = this.reducePosition(position, tx, inputAmount, currentPrice, usdValue);
    
    const tradeClosed = this.checkIfTradeClosed(updatedPosition);
    const pnlChange = this.calculatePnlChange(updatedPosition, currentPrice);

    return {
      position: updatedPosition,
      tradeClosed,
      pnlChange,
    };
  }

  /**
   * Create a new token position
   */
  private createNewPosition(
    tx: Transaction,
    tokenMint: string,
    amount: number,
    pricePerToken: number
  ): TokenPosition {
    const totalCost = amount * pricePerToken;

    return {
      id: uuidv4(),
      tokenMint,
      tokenSymbol: this.extractTokenSymbol(tx.outputToken),
      tokenName: '',
      totalBought: amount,
      totalSold: 0,
      remainingBalance: amount,
      averageEntryPrice: pricePerToken,
      weightedBuyCost: totalCost,
      totalSellRevenue: 0,
      realizedPnlUsd: 0,
      unrealizedPnlUsd: 0,
      currentPrice: pricePerToken,
      openedAt: tx.timestamp,
      lastUpdatedAt: tx.timestamp,
      tradeStatus: 'open',
      transactionIds: [tx.signature],
    };
  }

  /**
   * Add to an existing position (buy more)
   */
  private addToPosition(
    position: TokenPosition,
    tx: Transaction,
    amount: number,
    pricePerToken: number,
    usdValue: number
  ): TokenPosition {
    const previousTotalCost = position.weightedBuyCost;
    const newTotalCost = previousTotalCost + usdValue;
    const newTotalBought = position.totalBought + amount;
    
    // Calculate new weighted average entry price
    const newAverageEntryPrice = newTotalCost / newTotalBought;

    return {
      ...position,
      totalBought: newTotalBought,
      remainingBalance: position.remainingBalance + amount,
      weightedBuyCost: newTotalCost,
      averageEntryPrice: newAverageEntryPrice,
      currentPrice: pricePerToken,
      lastUpdatedAt: tx.timestamp,
      transactionIds: [...position.transactionIds, tx.signature],
    };
  }

  /**
   * Reduce a position (sell some tokens)
   */
  private reducePosition(
    position: TokenPosition,
    tx: Transaction,
    amount: number,
    pricePerToken: number,
    usdValue: number
  ): TokenPosition {
    const costBasisForSale = amount * position.averageEntryPrice;
    const revenueFromSale = usdValue;
    const realizedPnlFromThisSale = revenueFromSale - costBasisForSale;

    const newTotalSold = position.totalSold + amount;
    const newRemainingBalance = position.remainingBalance - amount;
    const newRealizedPnl = position.realizedPnlUsd + realizedPnlFromThisSale;

    return {
      ...position,
      totalSold: newTotalSold,
      remainingBalance: newRemainingBalance,
      totalSellRevenue: position.totalSellRevenue + revenueFromSale,
      realizedPnlUsd: newRealizedPnl,
      currentPrice: pricePerToken,
      lastUpdatedAt: tx.timestamp,
      transactionIds: [...position.transactionIds, tx.signature],
    };
  }

  /**
   * Check if a trade should be considered closed
   */
  checkIfTradeClosed(position: TokenPosition): boolean {
    const currentValue = position.remainingBalance * position.currentPrice;
    
    // Check if below dust threshold
    if (currentValue < this.dustThresholdUsd) {
      logger.info('TradeEngine', 'Position closed (dust)', { 
        tokenMint: position.tokenMint,
        remainingValue: currentValue 
      });
      
      return true;
    }

    // Check if all tokens sold
    if (position.remainingBalance <= 0) {
      logger.info('TradeEngine', 'Position closed (fully sold)', { 
        tokenMint: position.tokenMint 
      });
      
      return true;
    }

    return false;
  }

  /**
   * Mark a position as closed
   */
  closePosition(position: TokenPosition): TokenPosition {
    return {
      ...position,
      tradeStatus: 'closed',
      closedAt: Date.now(),
      unrealizedPnlUsd: 0, // No unrealized PNL on closed positions
    };
  }

  /**
   * Calculate PNL change for a position
   */
  private calculatePnlChange(position: TokenPosition, currentPrice: number): number {
    const previousUnrealizedPnl = position.unrealizedPnlUsd;
    const newUnrealizedPnl = this.calculateUnrealizedPnl(position, currentPrice);
    return newUnrealizedPnl - previousUnrealizedPnl;
  }

  /**
   * Calculate unrealized PNL for a position
   */
  calculateUnrealizedPnl(position: TokenPosition, currentPrice: number): number {
    if (position.remainingBalance <= 0) {
      return 0;
    }

    const currentValue = position.remainingBalance * currentPrice;
    const costBasis = position.remainingBalance * position.averageEntryPrice;
    
    return currentValue - costBasis;
  }

  /**
   * Update position prices and recalculate PNL
   */
  updatePositionPrices(
    positions: TokenPosition[],
    tokenPrices: Record<string, number>
  ): TokenPosition[] {
    return positions.map(position => {
      const currentPrice = tokenPrices[position.tokenMint] || position.currentPrice;
      const unrealizedPnl = this.calculateUnrealizedPnl(position, currentPrice);
      
      return {
        ...position,
        currentPrice,
        unrealizedPnlUsd: unrealizedPnl,
        lastUpdatedAt: Date.now(),
      };
    });
  }

  /**
   * Calculate trade duration in hours
   */
  calculateTradeDuration(position: TokenPosition): number {
    const endTime = position.closedAt || Date.now();
    const durationMs = endTime - position.openedAt;
    return durationMs / (1000 * 60 * 60); // Convert to hours
  }

  /**
   * Calculate PNL percentage
   */
  calculatePnlPercentage(position: TokenPosition): number {
    if (position.weightedBuyCost === 0) {
      return 0;
    }

    const totalPnl = position.realizedPnlUsd + position.unrealizedPnlUsd;
    return (totalPnl / position.weightedBuyCost) * 100;
  }

  /**
   * Extract token symbol from transaction
   */
  private extractTokenSymbol(token: { mint: string; amount: string }): string {
    // In production, this would look up token metadata
    // For now, use a placeholder or short mint address
    return token.mint.slice(0, 4).toUpperCase();
  }

  /**
   * Get portfolio summary
   */
  getPortfolioSummary(positions: TokenPosition[]): {
    totalValueUsd: number;
    totalCostBasisUsd: number;
    totalUnrealizedPnlUsd: number;
    totalRealizedPnlUsd: number;
  } {
    const summary = positions.reduce(
      (acc, position) => {
        const positionValue = position.remainingBalance * position.currentPrice;
        const positionCostBasis = position.remainingBalance * position.averageEntryPrice;
        
        acc.totalValueUsd += positionValue;
        acc.totalCostBasisUsd += positionCostBasis;
        acc.totalUnrealizedPnlUsd += position.unrealizedPnlUsd;
        acc.totalRealizedPnlUsd += position.realizedPnlUsd;
        
        return acc;
      },
      {
        totalValueUsd: 0,
        totalCostBasisUsd: 0,
        totalUnrealizedPnlUsd: 0,
        totalRealizedPnlUsd: 0,
      }
    );

    return summary;
  }
}

// Singleton instance
let tradeEngineInstance: TradeEngine | null = null;

export function getTradeEngine(dustThreshold?: number): TradeEngine {
  if (!tradeEngineInstance) {
    tradeEngineInstance = new TradeEngine(dustThreshold);
  } else if (dustThreshold !== undefined) {
    tradeEngineInstance.setDustThreshold(dustThreshold);
  }
  return tradeEngineInstance;
}
