/**
 * MCP Client Service
 * Handles communication with the GoodNeighbor MCP server
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { MCP_CONFIG } from '../config';
import { debug, error, info } from '../utils/logger';

/**
 * MCP Tool Call Parameters
 */
export interface MCPToolCallParams {
  tool: string;
  arguments: Record<string, any>;
}

/**
 * MCP Tool Result
 */
export interface MCPToolResult {
  success: boolean;
  data?: any;
  error?: string;
  details?: string;
}

/**
 * MCP Client for communicating with the GoodNeighbor MCP server
 */
export class MCPClient {
  private client: AxiosInstance;

  constructor() {
    // Create axios instance with default configuration
    this.client = axios.create({
      baseURL: MCP_CONFIG.SERVER_URL,
      timeout: MCP_CONFIG.TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MCP_CONFIG.API_KEY}`,
      },
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use((config) => {
      debug('Sending request to MCP server', {
        method: config.method,
        url: config.url,
        data: config.data,
      });
      return config;
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        debug('Received response from MCP server', {
          status: response.status,
          statusText: response.statusText,
          data: response.data,
        });
        return response;
      },
      (err) => {
        error('Error in MCP server response', {
          message: err.message,
          response: err.response?.data,
        });
        return Promise.reject(err);
      }
    );
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(params: MCPToolCallParams): Promise<MCPToolResult> {
    try {
      info(`Calling MCP tool: ${params.tool}`, {
        arguments: params.arguments,
      });

      const response = await this.client.post('/mcp/call', {
        tool: params.tool,
        parameters: params.arguments,
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (err: any) {
      error(`Failed to call MCP tool: ${params.tool}`, {
        error: err.message,
        response: err.response?.data,
      });

      return {
        success: false,
        error: err.message,
        details: err.response?.data?.error || 'Unknown error',
      };
    }
  }

  /**
   * Check if the MCP server is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (err) {
      error('MCP server health check failed', { error: err });
      return false;
    }
  }

  /**
   * Get available tools from the MCP server
   */
  async getAvailableTools(): Promise<string[]> {
    try {
      const response = await this.client.get('/');
      return response.data?.tools || [];
    } catch (err) {
      error('Failed to get available tools from MCP server', { error: err });
      return [];
    }
  }
}

// Export a singleton instance
export const mcpClient = new MCPClient();
