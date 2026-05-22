/**
 * Application constants
 */

export const CONSTANTS = {
  // Dust threshold in USD - positions below this are considered closed
  DEFAULT_DUST_THRESHOLD_USD: 0.01,
  
  // Polling interval in milliseconds
  DEFAULT_POLLING_INTERVAL_MS: 30000, // 30 seconds
  
  // Session duration in hours
  SESSION_DURATION_HOURS: 12,
  
  // Minimum trade size to track (USD)
  MIN_TRADE_SIZE_USD: 1.0,
  
  // Max transactions to fetch per request
  MAX_TRANSACTIONS_PER_FETCH: 50,
  
  // Token metadata cache TTL in ms
  TOKEN_CACHE_TTL_MS: 3600000, // 1 hour
  
  // Price cache TTL in ms
  PRICE_CACHE_TTL_MS: 60000, // 1 minute
  
  // Rate limiting
  API_RATE_LIMIT_DELAY_MS: 1000,
  
  // Solana blockchain
  SOLANA_RPC_URL: 'https://api.mainnet-beta.solana.com',
  
  // Known DEX programs
  DEX_PROGRAMS: {
    JUPITER: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    RAYDIUM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    ORCA: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  },
  
  // Storage keys
  STORAGE_KEYS: {
    WALLET_CONFIG: 'wallet_config',
    POSITIONS: 'positions',
    REFLECTIONS: 'reflections',
    SESSIONS: 'sessions',
    SETTINGS: 'settings',
    TRANSACTIONS: 'transactions',
    TOKEN_CACHE: 'token_cache',
  },
  
  // Extension IDs and URLs
  EXTENSION_ID: 'tradereflect',
  
  // UI constants
  MODAL_ANIMATION_DURATION_MS: 300,
} as const;

export const DEFAULT_SETTINGS = {
  dustThresholdUsd: CONSTANTS.DEFAULT_DUST_THRESHOLD_USD,
  pollingIntervalMs: CONSTANTS.DEFAULT_POLLING_INTERVAL_MS,
  sessionDurationHours: CONSTANTS.SESSION_DURATION_HOURS,
  enableHeliusEnrichment: false,
} as const;
