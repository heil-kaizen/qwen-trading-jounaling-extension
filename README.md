# TradeReflect

**Behavioral Trading Journal for Solana**

TradeReflect is a Chrome extension that tracks your Solana wallet activity, reconstructs trades from swaps, calculates PNL, and forces behavioral reflection after each completed trade.

## Core Philosophy

> "Every trade becomes a structured psychological record."

This is NOT a trading dashboard. This is a **behavioral trading journal system**.

## Features

### 1. Wallet Tracking
- Enter your Solana wallet address
- Automatic polling for new transactions (every 30 seconds)
- Filters out non-trade transactions (airdrops, transfers, spam)
- Tracks only DEX swaps (Jupiter, Raydium, Orca)

### 2. Trade Reconstruction Engine
- Groups multiple buys/sells into single token positions
- Calculates weighted average entry price
- Tracks realized and unrealized PNL
- Handles partial exits
- Dust threshold detection (positions below $0.01 marked as closed)

### 3. Post-Trade Reflection System
When a trade closes, a fullscreen modal appears requiring you to answer:

**Entry Questions:**
- Why did you enter this trade?
- What attracted you to this token?
- Was this planned or emotional?

**If Profit:**
- Why did this trade work?
- What signals were correct?
- Would you repeat this setup?

**If Loss:**
- What mistake caused the loss?
- Was it FOMO?
- Was entry too late?
- Was risk management ignored?
- What should you improve?

### 4. Session System
- 12-hour trading sessions
- Session summary shows:
  - Total trades
  - Win rate
  - Total realized PNL
  - Best/worst trades
  - Repeated mistakes
  - Overtrading detection

### 5. Dashboard Pages
- **Portfolio**: Active positions with unrealized PNL
- **Trades**: Completed trade history with reflections
- **Journal**: All user reflections, searchable
- **Analytics**: Text-only behavioral insights (NO charts)

## Tech Stack

- **Framework**: Plasmo (Chrome Extension Manifest V3)
- **Frontend**: React, TypeScript, TailwindCSS
- **State Management**: Zustand
- **Storage**: IndexedDB (local-first)
- **APIs**: 
  - Primary: SolanaTracker API
  - Fallback: Helius API (optional enrichment)

## Installation

### Prerequisites
- Node.js 18+
- npm or pnpm

### Development Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `build/chrome-mv3-dev` folder
5. The extension icon should appear in your toolbar

## Configuration

### Settings (in extension popup)
- **Dust Threshold**: Minimum USD value to consider a position open (default: $0.01)
- **Polling Interval**: How often to check for new transactions (default: 30s)
- **Session Duration**: Length of trading session (default: 12 hours)
- **Helius Enrichment**: Enable enhanced transaction parsing (requires API key)

### Environment Variables

Create a `.env` file for optional features:

```
HELIUS_API_KEY=your_helius_api_key_here
SOLANA_TRACKER_API_KEY=your_solanatracker_api_key_here
```

## Project Structure

```
src/
├── background/          # Service worker (wallet polling, trade processing)
├── content/             # Content scripts (if needed)
├── popup/               # Extension popup UI
├── dashboard/           # Full dashboard pages
├── components/          # Reusable React components
│   ├── PositionRow.tsx
│   └── ReflectionModal.tsx
├── services/            # API clients
│   ├── solanaTracker.ts
│   └── helius.ts
├── trade-engine/        # Core business logic
│   └── index.ts
├── storage/             # IndexedDB layer
│   └── index.ts
├── types/               # TypeScript type definitions
│   └── index.ts
├── constants/           # App constants
│   └── index.ts
├── utils/               # Utility functions
│   └── logger.ts
└── hooks/               # Custom React hooks
```

## Data Models

### TokenPosition
Represents a single token position (can have multiple buys/sells):
- `tokenMint`: Token contract address
- `totalBought`: Cumulative amount bought
- `totalSold`: Cumulative amount sold
- `remainingBalance`: Current balance
- `averageEntryPrice`: Weighted average buy price
- `realizedPnlUsd`: Realized profit/loss
- `unrealizedPnlUsd`: Unrealized profit/loss
- `tradeStatus`: 'open' | 'closed' | 'dust'

### TradeReflection
Psychological record of a completed trade:
- Entry reasoning
- Emotional state
- Outcome analysis
- Lessons learned

## API Integration

### SolanaTracker (Primary)
- Wallet transaction history
- Token prices
- Portfolio data

### Helius (Optional)
- Enhanced transaction parsing
- Better DEX identification
- NFT filtering

## Error Handling

- All API calls have explicit error handling
- Rate limiting built into API clients
- Graceful fallback if primary API fails
- Structured logging for debugging

## Performance Optimizations

- Token price caching (1 minute TTL)
- Transaction deduplication
- Batched IndexedDB writes
- Debounced polling

## Privacy & Security

- All data stored locally in IndexedDB
- No cloud storage
- No tracking
- API keys never leave your browser

## Future Enhancements

1. Multiple wallet support
2. Export reflections to CSV/Notion
3. Pattern detection algorithms
4. Custom reflection templates
5. Mobile companion app

## Troubleshooting

### Extension not polling
- Check if wallet address is set in popup
- Verify network connectivity
- Check browser console for errors

### Missing transactions
- Some DEXs may not be recognized
- Try enabling Helius enrichment
- Manually refresh via popup

### Database issues
- Clear extension data via `chrome://extensions/`
- Reload extension

## Contributing

This is an open-source project. Contributions welcome!

## License

MIT License

---

**Remember**: The goal is not just to track trades, but to understand your trading psychology and improve over time. Every reflection makes you a better trader.
