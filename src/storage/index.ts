/**
 * IndexedDB storage layer using idb
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { 
  TokenPosition, 
  TradeReflection, 
  TradingSession, 
  WalletConfig,
  Transaction,
  AppSettings 
} from '../types';

interface TradeReflectDB extends DBSchema {
  positions: {
    key: string;
    value: TokenPosition;
    indexes: { 
      byTokenMint: string; 
      byStatus: string;
      byOpenedAt: number;
    };
  };
  reflections: {
    key: string;
    value: TradeReflection;
    indexes: { 
      byPositionId: string;
      byCreatedAt: number;
    };
  };
  sessions: {
    key: string;
    value: TradingSession;
    indexes: { 
      byStartedAt: number;
      byActive: boolean;
    };
  };
  walletConfig: {
    key: string;
    value: WalletConfig;
  };
  transactions: {
    key: string;
    value: Transaction;
    indexes: {
      bySignature: string;
      byTimestamp: number;
      byWallet: string;
    };
  };
  settings: {
    key: string;
    value: AppSettings;
  };
  cache: {
    key: string;
    value: {
      data: unknown;
      timestamp: number;
      ttl: number;
    };
  };
}

const DB_NAME = 'tradereflect-db';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<TradeReflectDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<TradeReflectDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<TradeReflectDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Positions store
      const positionStore = db.createObjectStore('positions', { keyPath: 'id' });
      positionStore.createIndex('byTokenMint', 'tokenMint');
      positionStore.createIndex('byStatus', 'tradeStatus');
      positionStore.createIndex('byOpenedAt', 'openedAt');

      // Reflections store
      const reflectionStore = db.createObjectStore('reflections', { keyPath: 'id' });
      reflectionStore.createIndex('byPositionId', 'positionId');
      reflectionStore.createIndex('byCreatedAt', 'createdAt');

      // Sessions store
      const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
      sessionStore.createIndex('byStartedAt', 'startedAt');
      sessionStore.createIndex('byActive', 'isActive');

      // Wallet config store
      db.createObjectStore('walletConfig', { keyPath: 'address' });

      // Transactions store
      const txStore = db.createObjectStore('transactions', { keyPath: 'signature' });
      txStore.createIndex('bySignature', 'signature');
      txStore.createIndex('byTimestamp', 'timestamp');
      txStore.createIndex('byWallet', 'walletAddress');

      // Settings store
      db.createObjectStore('settings', { keyPath: 'key' });

      // Cache store
      db.createObjectStore('cache', { keyPath: 'key' });
    },
  });

  return dbInstance;
}

// Position operations
export async function savePosition(position: TokenPosition): Promise<void> {
  const db = await getDB();
  await db.put('positions', position);
}

export async function getPosition(id: string): Promise<TokenPosition | undefined> {
  const db = await getDB();
  return db.get('positions', id);
}

export async function getAllPositions(): Promise<TokenPosition[]> {
  const db = await getDB();
  return db.getAll('positions');
}

export async function getOpenPositions(): Promise<TokenPosition[]> {
  const db = await getDB();
  const index = db.transaction('positions').store.index('byStatus');
  return index.getAll('open');
}

export async function deletePosition(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('positions', id);
}

// Reflection operations
export async function saveReflection(reflection: TradeReflection): Promise<void> {
  const db = await getDB();
  await db.put('reflections', reflection);
}

export async function getReflection(id: string): Promise<TradeReflection | undefined> {
  const db = await getDB();
  return db.get('reflections', id);
}

export async function getAllReflections(): Promise<TradeReflection[]> {
  const db = await getDB();
  return db.getAll('reflections');
}

export async function getReflectionsByPosition(positionId: string): Promise<TradeReflection[]> {
  const db = await getDB();
  const index = db.transaction('reflections').store.index('byPositionId');
  return index.getAll(positionId);
}

// Session operations
export async function saveSession(session: TradingSession): Promise<void> {
  const db = await getDB();
  await db.put('sessions', session);
}

export async function getActiveSession(): Promise<TradingSession | undefined> {
  const db = await getDB();
  const index = db.transaction('sessions').store.index('byActive');
  const sessions = await index.getAll(true);
  return sessions[0];
}

export async function getAllSessions(): Promise<TradingSession[]> {
  const db = await getDB();
  return db.getAll('sessions');
}

// Wallet config operations
export async function saveWalletConfig(config: WalletConfig): Promise<void> {
  const db = await getDB();
  await db.put('walletConfig', config);
}

export async function getWalletConfig(address: string): Promise<WalletConfig | undefined> {
  const db = await getDB();
  return db.get('walletConfig', address);
}

export async function getAllWalletConfigs(): Promise<WalletConfig[]> {
  const db = await getDB();
  return db.getAll('walletConfig');
}

export async function deleteWalletConfig(address: string): Promise<void> {
  const db = await getDB();
  await db.delete('walletConfig', address);
}

// Transaction operations
export async function saveTransaction(tx: Transaction & { walletAddress: string }): Promise<void> {
  const db = await getDB();
  await db.put('transactions', tx);
}

export async function getTransaction(signature: string): Promise<(Transaction & { walletAddress: string }) | undefined> {
  const db = await getDB();
  return db.get('transactions', signature);
}

export async function getTransactionsByWallet(wallet: string, limit = 100): Promise<(Transaction & { walletAddress: string })[]> {
  const db = await getDB();
  const index = db.transaction('transactions').store.index('byWallet');
  return index.getAll(wallet, limit);
}

// Settings operations
export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key: 'app_settings', ...settings });
}

export async function getSettings(): Promise<AppSettings | undefined> {
  const db = await getDB();
  const result = await db.get('settings', 'app_settings');
  if (!result) return undefined;
  const { key, ...settings } = result as AppSettings & { key: string };
  return settings;
}

// Cache operations
export async function getCachedData<T>(key: string, ttlMs: number): Promise<T | null> {
  const db = await getDB();
  const cached = await db.get('cache', key);
  
  if (!cached) return null;
  
  const now = Date.now();
  if (now - cached.timestamp > ttlMs) {
    await db.delete('cache', key);
    return null;
  }
  
  return cached.data as T;
}

export async function setCachedData<T>(key: string, data: T, ttlMs: number): Promise<void> {
  const db = await getDB();
  await db.put('cache', {
    key,
    data,
    timestamp: Date.now(),
    ttl: ttlMs,
  });
}

export async function clearCache(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('cache', 'readwrite');
  await tx.store.clear();
}

// Bulk operations
export async function bulkSavePositions(positions: TokenPosition[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('positions', 'readwrite');
  await Promise.all(positions.map(p => tx.store.put(p)));
  await tx.done;
}

export async function bulkSaveTransactions(txs: Array<Transaction & { walletAddress: string }>): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('transactions', 'readwrite');
  await Promise.all(txs.map(t => tx.store.put(t)));
  await tx.done;
}
