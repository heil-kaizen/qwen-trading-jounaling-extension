# TradeReflect Architecture Design

## System Overview

TradeReflect follows a modular, event-driven architecture designed for Chrome Extension Manifest V3.

```
┌─────────────────────────────────────────────────────────────────┐
│                     CHROME EXTENSION                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Popup     │  │  Dashboard  │  │   Background Worker     │  │
│  │   (React)   │  │   (React)   │  │   (Service Worker)      │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                      │                │
│         └────────────────┼──────────────────────┘                │
│                          │                                       │
│              ┌───────────▼───────────┐                          │
│              │   Chrome Runtime      │                          │
│              │   Message Passing     │                          │
│              └───────────┬───────────┘                          │
└──────────────────────────┼──────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
┌────────▼────────┐ ┌──────▼──────┐ ┌───────▼────────┐
│  Trade Engine   │ │   Storage   │ │    Services    │
│  (Business      │ │   Layer     │ │    Layer       │
│   Logic)        │ │  (IndexedDB)│ │  (API Clients) │
└─────────────────┘ └─────────────┘ └────────────────┘
```

## Core Modules

### 1. Background Service Worker (`src/background/`)

**Responsibilities:**
- Poll wallet activity every 30 seconds
- Fetch transactions from SolanaTracker/Helius APIs
- Process transactions through Trade Engine
- Detect trade completion events
- Trigger reflection popup notifications
- Manage trading sessions

**Key Functions:**
```typescript
- initialize(): Setup services and start polling
- pollWalletActivity(): Main polling loop
- processTransactions(): Run transactions through trade engine
- triggerReflectionPopup(): Notify UI of closed trades
- updateSession(): Manage 12-hour trading sessions
```

### 2. Trade Engine (`src/trade-engine/`)

**Responsibilities:**
- Group transactions into token positions
- Calculate weighted average entry price
- Track realized/unrealized PNL
- Handle partial buys/sells
- Detect position closure (zero balance or dust)

**Data Flow:**
```
Transaction → isTradeTransaction? → processBuySide/processSellSide
                                          ↓
                                    Update Position
                                          ↓
                                    Check if Closed
                                          ↓
                                    Return Result
```

**Key Classes:**
- `TradeEngine`: Main business logic class
- `PositionUpdateResult`: Result type for position updates

### 3. Storage Layer (`src/storage/`)

**Responsibilities:**
- IndexedDB wrapper using `idb` library
- CRUD operations for all data types
- Caching mechanism with TTL
- Bulk operations for performance

**Stores:**
- `positions`: Token positions
- `reflections`: Trade reflections
- `sessions`: Trading sessions
- `walletConfig`: Wallet configurations
- `transactions`: Transaction history
- `settings`: App settings
- `cache`: Price/token metadata cache

### 4. Services Layer (`src/services/`)

**SolanaTracker Service:**
- Primary API for wallet data
- Rate limiting built-in
- Transaction normalization
- Token price fetching

**Helius Service (Optional):**
- Enhanced transaction parsing
- Better DEX identification
- Webhook support (future)

### 5. UI Components (`src/components/`, `src/popup/`, `src/dashboard/`)

**Components:**
- `PositionRow`: Display position in table
- `ReflectionModal`: Fullscreen reflection form

**Pages:**
- Portfolio: Active positions
- Trades: Completed trade history
- Journal: Reflection entries
- Analytics: Behavioral insights

## Data Models

### TokenPosition
```typescript
interface TokenPosition {
  id: string;              // UUID
  tokenMint: string;       // Token contract address
  tokenSymbol: string;     // e.g., "SOL"
  
  // Position tracking
  totalBought: number;
  totalSold: number;
  remainingBalance: number;
  
  // Price tracking
  averageEntryPrice: number;  // Weighted average
  weightedBuyCost: number;
  totalSellRevenue: number;
  
  // PNL
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  currentPrice: number;
  
  // Timestamps
  openedAt: number;
  closedAt?: number;
  lastUpdatedAt: number;
  
  // Status
  tradeStatus: 'open' | 'closed' | 'dust';
  
  // History
  transactionIds: string[];
}
```

### TradeReflection
```typescript
interface TradeReflection {
  id: string;
  positionId: string;
  tokenSymbol: string;
  
  // Outcomes
  realizedPnl: number;
  pnlPercentage: number;
  durationHours: number;
  
  // Entry questions
  entryReason: string;
  attraction: string;
  wasPlanned: boolean;
  
  // Profit-specific
  ifProfit?: {
    whyItWorked: string;
    correctSignals: string;
    wouldRepeat: boolean;
  };
  
  // Loss-specific
  ifLoss?: {
    mistakeCause: string;
    wasFomo: boolean;
    wasLateEntry: boolean;
    riskManagementIgnored: boolean;
    improvement: string;
  };
  
  createdAt: number;
  sessionId?: string;
}
```

## Event Flow

### Trade Completion Flow
```
1. Background polls wallet
2. New transaction detected
3. Transaction processed by Trade Engine
4. Position updated
5. If position closed:
   - Mark as closed
   - Send message to popup
   - Show ReflectionModal
6. User submits reflection
7. Reflection saved to IndexedDB
8. Continue trading
```

### Session Management Flow
```
1. First trade starts session
2. Session tracks:
   - Trade count
   - Win/loss ratio
   - Total PNL
3. After 12 hours:
   - End session
   - Show summary modal
   - Start new session
```

## Error Handling Strategy

### API Errors
```typescript
try {
  const result = await api.getTransactions();
  if (!result.success) {
    logger.error('API', result.error);
    // Graceful degradation
    return [];
  }
  return result.data;
} catch (error) {
  logger.error('API', 'Network error', error);
  return [];
}
```

### Database Errors
```typescript
try {
  await savePosition(position);
} catch (error) {
  logger.error('Storage', 'Failed to save position', error);
  // Retry logic or user notification
}
```

## Performance Optimizations

### Caching Strategy
- Token prices: 1 minute TTL
- Token metadata: 1 hour TTL
- Transactions: Permanent (with deduplication)

### Batch Operations
```typescript
// Instead of multiple saves
await bulkSavePositions(updatedPositions);
await bulkSaveTransactions(newTransactions);
```

### Debounced Polling
- Minimum 30 seconds between polls
- Skip if previous poll still running
- Exponential backoff on errors

## Security Considerations

### Data Privacy
- All data stored locally in IndexedDB
- No cloud synchronization
- No analytics/tracking

### API Key Handling
- Keys stored in environment variables
- Never exposed to content scripts
- Rate limiting prevents abuse

### Input Validation
- Wallet address format validation
- Transaction signature verification
- Numeric bounds checking

## Scalability Plan

### Current Limitations
- Single wallet support
- Local storage only (~10MB limit)
- Sequential transaction processing

### Future Enhancements

#### Phase 1: Multiple Wallets
```typescript
interface WalletConfig {
  address: string;
  label: string;
  isActive: boolean;
}
// Store array of wallets
// Switch between wallets in UI
```

#### Phase 2: Cloud Sync (Optional)
```typescript
// Encrypted backup to user's cloud storage
// Opt-in only
// End-to-end encryption
```

#### Phase 3: Advanced Analytics
```typescript
// Pattern detection
const detectPatterns = (reflections: TradeReflection[]) => {
  // Find repeated mistakes
  // Identify best setups
  // Suggest improvements
};
```

#### Phase 4: Mobile Companion
- React Native app
- Sync via encrypted export/import
- Push notifications for trade closures

## Testing Strategy

### Unit Tests
- Trade engine calculations
- PNL accuracy
- Position lifecycle

### Integration Tests
- API client mocking
- Storage operations
- Message passing

### E2E Tests
- Complete trade flow
- Reflection submission
- Session management

## Monitoring & Debugging

### Structured Logging
```typescript
logger.info('Background', 'Polling started', { 
  wallet: address,
  interval: 30000 
});

logger.error('TradeEngine', 'Invalid transaction', {
  signature: tx.signature,
  error: error.message
});
```

### Debug Mode
- Enable verbose logging
- Export data for debugging
- Performance metrics

---

This architecture prioritizes:
1. **Modularity**: Each module has single responsibility
2. **Reliability**: Explicit error handling throughout
3. **Performance**: Caching, batching, debouncing
4. **Privacy**: Local-first storage
5. **Extensibility**: Easy to add features
