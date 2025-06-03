/**
 * Configuration module
 * Loads environment variables and provides configuration values
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Server configuration
 */
export const SERVER_CONFIG = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
};

/**
 * WebSocket configuration
 */
export const WS_CONFIG = {
  PATH: process.env.WS_PATH || '/ws',
  PING_INTERVAL: 30000, // 30 seconds
  PING_TIMEOUT: 30000, // 10 seconds
};

/**
 * MCP Server configuration
 */
export const MCP_CONFIG = {
  SERVER_URL: process.env.MCP_SERVER_URL || 'https://goodneighbor-mcp-868795766038.us-central1.run.app',
  API_KEY: process.env.MCP_SERVER_API_KEY || '', // Key for authenticating with the MCP server
  TIMEOUT: 30000, // 30 seconds
};

/**
 * DeepSeek API configuration
 */
export const DEEPSEEK_CONFIG = {
  API_KEY: process.env.DEEPSEEK_API_KEY || '',
  TIMEOUT: 60000, // 60 seconds for longer completions
  DEFAULT_MODEL: 'deepseek-chat',
};

/**
 * Security configuration
 */
export const SECURITY_CONFIG = {
  API_KEY: process.env.CLIENT_AUTH_API_KEY || '', // Key for clients to authenticate with this server
};

/**
 * Validate required configuration values
 */
export function validateConfig(): void {
  const missingVars: string[] = [];

  if (!MCP_CONFIG.API_KEY) {
    missingVars.push('MCP_SERVER_API_KEY');
  }

  if (!SECURITY_CONFIG.API_KEY) {
    missingVars.push('CLIENT_AUTH_API_KEY');
  }

  if (!DEEPSEEK_CONFIG.API_KEY) {
    missingVars.push('DEEPSEEK_API_KEY');
  }

  if (missingVars.length > 0) {
    if (SERVER_CONFIG.IS_PRODUCTION) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    } else {
      console.warn(`Warning: Missing recommended environment variables: ${missingVars.join(', ')}`);
    }
  }
}
