import React from 'react';
import type { TokenPosition } from '~types';

interface PositionRowProps {
  position: TokenPosition;
}

export function PositionRow({ position }: PositionRowProps) {
  const isProfit = position.unrealizedPnlUsd >= 0;
  const pnlClass = isProfit ? 'pnl-positive' : 'pnl-negative';
  const pnlSign = isProfit ? '+' : '';

  return (
    <tr className="hover:bg-white/5 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{position.tokenSymbol}</span>
          <span className="text-xs text-gray-500">{position.tokenMint.slice(0, 8)}...</span>
        </div>
      </td>
      <td className="py-3 px-4">
        {position.remainingBalance.toFixed(4)}
      </td>
      <td className="py-3 px-4">
        ${position.averageEntryPrice.toFixed(6)}
      </td>
      <td className="py-3 px-4">
        ${position.currentPrice.toFixed(6)}
      </td>
      <td className={`py-3 px-4 font-medium ${pnlClass}`}>
        {pnlSign}${position.unrealizedPnlUsd.toFixed(2)}
      </td>
      <td className="py-3 px-4">
        <span className={`badge ${position.tradeStatus === 'open' ? 'badge-open' : 'badge-closed'}`}>
          {position.tradeStatus.toUpperCase()}
        </span>
      </td>
    </tr>
  );
}
