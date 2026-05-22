/**
 * Logger utility for structured logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
}

class Logger {
  private minLevel: LogLevel = 'debug';
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  setMinLevel(level: LogLevel) {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  private formatEntry(entry: LogEntry): string {
    const time = new Date(entry.timestamp).toISOString();
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    return `[${time}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}${dataStr}`;
  }

  private log(level: LogLevel, module: string, message: string, data?: unknown) {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data,
    };

    const formatted = this.formatEntry(entry);

    switch (level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  }

  debug(module: string, message: string, data?: unknown) {
    this.log('debug', module, message, data);
  }

  info(module: string, message: string, data?: unknown) {
    this.log('info', module, message, data);
  }

  warn(module: string, message: string, data?: unknown) {
    this.log('warn', module, message, data);
  }

  error(module: string, message: string, error?: Error | unknown) {
    const errorData = error instanceof Error 
      ? { name: error.name, message: error.message, stack: error.stack }
      : error;
    this.log('error', module, message, errorData);
  }
}

export const logger = new Logger();
