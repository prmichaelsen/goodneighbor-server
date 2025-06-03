/**
 * Logger utility
 * Provides logging functions with different log levels
 */

import { SERVER_CONFIG } from '../config';

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Log a message with context data
 */
export function log(level: LogLevel, message: string, context?: any): void {
  // Skip debug logs in production
  if (level === LogLevel.DEBUG && SERVER_CONFIG.IS_PRODUCTION) {
    return;
  }

  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    level,
    message,
    ...(context ? { context } : {}),
  };

  // In production, we might want to use a more sophisticated logging solution
  if (SERVER_CONFIG.IS_PRODUCTION) {
    console.log(JSON.stringify(logData));
  } else {
    // In development, format logs for better readability
    const colorize = (str: string, colorCode: number): string => `\x1b[${colorCode}m${str}\x1b[0m`;
    
    let levelColor: number;
    switch (level) {
      case LogLevel.DEBUG:
        levelColor = 34; // Blue
        break;
      case LogLevel.INFO:
        levelColor = 32; // Green
        break;
      case LogLevel.WARN:
        levelColor = 33; // Yellow
        break;
      case LogLevel.ERROR:
        levelColor = 31; // Red
        break;
      default:
        levelColor = 0; // Default
    }

    const coloredLevel = colorize(level.padEnd(5), levelColor);
    console.log(`${colorize(timestamp, 90)} ${coloredLevel} ${message}`);
    
    if (context) {
      console.log(colorize('Context:', 90), context);
    }
  }
}

/**
 * Log a debug message
 */
export function debug(message: string, context?: any): void {
  log(LogLevel.DEBUG, message, context);
}

/**
 * Log an info message
 */
export function info(message: string, context?: any): void {
  log(LogLevel.INFO, message, context);
}

/**
 * Log a warning message
 */
export function warn(message: string, context?: any): void {
  log(LogLevel.WARN, message, context);
}

/**
 * Log an error message
 */
export function error(message: string, context?: any): void {
  log(LogLevel.ERROR, message, context);
}
