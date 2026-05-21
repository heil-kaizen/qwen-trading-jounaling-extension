import React, { useState } from 'react';
import type { TokenPosition, TradeReflection } from '~types';

interface ReflectionModalProps {
  position: TokenPosition;
  onSubmit: (reflection: Omit<TradeReflection, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}

export function ReflectionModal({ position, onSubmit, onClose }: ReflectionModalProps) {
  const isProfit = position.realizedPnlUsd >= 0;
  
  const [formData, setFormData] = useState({
    entryReason: '',
    attraction: '',
    wasPlanned: true,
    // Profit fields
    whyItWorked: '',
    correctSignals: '',
    wouldRepeat: true,
    // Loss fields
    mistakeCause: '',
    wasFomo: false,
    wasLateEntry: false,
    riskManagementIgnored: false,
    improvement: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const reflection: Omit<TradeReflection, 'id' | 'createdAt'> = {
      positionId: position.id,
      tokenSymbol: position.tokenSymbol,
      realizedPnl: position.realizedPnlUsd,
      pnlPercentage: ((position.realizedPnlUsd / position.weightedBuyCost) * 100) || 0,
      durationHours: (Date.now() - position.openedAt) / (1000 * 60 * 60),
      entryReason: formData.entryReason,
      attraction: formData.attraction,
      wasPlanned: formData.wasPlanned,
      ifProfit: isProfit ? {
        whyItWorked: formData.whyItWorked,
        correctSignals: formData.correctSignals,
        wouldRepeat: formData.wouldRepeat,
      } : undefined,
      ifLoss: !isProfit ? {
        mistakeCause: formData.mistakeCause,
        wasFomo: formData.wasFomo,
        wasLateEntry: formData.wasLateEntry,
        riskManagementIgnored: formData.riskManagementIgnored,
        improvement: formData.improvement,
      } : undefined,
    };

    onSubmit(reflection);
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div 
        className="modal-content animate-slide-up" 
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-2">Trade Reflection Required</h2>
        <p className="text-gray-400 mb-6">
          Complete this reflection before continuing to trade.
        </p>

        {/* Trade Summary */}
        <div className="card mb-6 bg-dark-900">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold">{position.tokenSymbol}</span>
            <span className={`font-bold ${isProfit ? 'pnl-positive' : 'pnl-negative'}`}>
              {isProfit ? '+' : ''}${position.realizedPnlUsd.toFixed(2)}
            </span>
          </div>
          <div className="text-sm text-gray-400">
            <div>Duration: {((Date.now() - position.openedAt) / (1000 * 60 * 60)).toFixed(1)} hours</div>
            <div>Total Buy: ${position.weightedBuyCost.toFixed(2)}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Entry Questions */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Why did you enter this trade?
            </label>
            <textarea
              className="input-field min-h-[80px]"
              value={formData.entryReason}
              onChange={(e) => setFormData({ ...formData, entryReason: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              What attracted you to this token?
            </label>
            <textarea
              className="input-field min-h-[80px]"
              value={formData.attraction}
              onChange={(e) => setFormData({ ...formData, attraction: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.wasPlanned}
                onChange={(e) => setFormData({ ...formData, wasPlanned: e.target.checked })}
                className="w-5 h-5 rounded"
              />
              <span className="text-sm">This trade was planned (not impulsive)</span>
            </label>
          </div>

          {/* Outcome-specific questions */}
          {isProfit ? (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Why did this trade work?
                </label>
                <textarea
                  className="input-field min-h-[80px]"
                  value={formData.whyItWorked}
                  onChange={(e) => setFormData({ ...formData, whyItWorked: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  What signals were correct?
                </label>
                <textarea
                  className="input-field min-h-[80px]"
                  value={formData.correctSignals}
                  onChange={(e) => setFormData({ ...formData, correctSignals: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.wouldRepeat}
                    onChange={(e) => setFormData({ ...formData, wouldRepeat: e.target.checked })}
                    className="w-5 h-5 rounded"
                  />
                  <span className="text-sm">I would repeat this setup</span>
                </label>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">
                  What mistake caused the loss?
                </label>
                <textarea
                  className="input-field min-h-[80px]"
                  value={formData.mistakeCause}
                  onChange={(e) => setFormData({ ...formData, mistakeCause: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.wasFomo}
                    onChange={(e) => setFormData({ ...formData, wasFomo: e.target.checked })}
                    className="w-5 h-5 rounded"
                  />
                  <span className="text-sm">This was FOMO</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.wasLateEntry}
                    onChange={(e) => setFormData({ ...formData, wasLateEntry: e.target.checked })}
                    className="w-5 h-5 rounded"
                  />
                  <span className="text-sm">Entry was too late</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.riskManagementIgnored}
                    onChange={(e) => setFormData({ ...formData, riskManagementIgnored: e.target.checked })}
                    className="w-5 h-5 rounded"
                  />
                  <span className="text-sm">Risk management was ignored</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  What should you improve?
                </label>
                <textarea
                  className="input-field min-h-[80px]"
                  value={formData.improvement}
                  onChange={(e) => setFormData({ ...formData, improvement: e.target.value })}
                  required
                />
              </div>
            </>
          )}

          <div className="flex gap-3 pt-4">
            <button type="submit" className="btn-primary flex-1">
              Submit Reflection
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
