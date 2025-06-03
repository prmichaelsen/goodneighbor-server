/**
 * MCP Client Service
 * Handles communication with the GoodNeighbor MCP server
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { MCP_CONFIG } from '../config';
import { debug, error, info } from '../utils/logger';
import { ToolDefinition } from './deepseek-client';

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
 * MCP Tool Information
 */
export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
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
        // Use API key as a query parameter instead of a header
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
      }, {
        params: {
          apiKey: MCP_CONFIG.API_KEY
        }
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
      info('Checking MCP server health', { url: `${MCP_CONFIG.SERVER_URL}/health` });
      const response = await this.client.get('/health', {
        params: {
          apiKey: MCP_CONFIG.API_KEY
        }
      });
      info('MCP server health check response', { 
        status: response.status,
        data: response.data
      });
      return response.status === 200;
    } catch (err: any) {
      error('MCP server health check failed', { 
        error: err.message,
        code: err.code,
        response: err.response?.data,
        config: {
          url: err.config?.url,
          params: err.config?.params,
          method: err.config?.method
        }
      });
      return false;
    }
  }

  /**
   * Get available tools from the MCP server (just names)
   */
  async getAvailableTools(): Promise<string[]> {
    try {
      const response = await this.client.get('/', {
        params: {
          apiKey: MCP_CONFIG.API_KEY
        }
      });
      return response.data?.tools || [];
    } catch (err) {
      error('Failed to get available tools from MCP server', { error: err });
      return [];
    }
  }

  /**
   * Get detailed information about available tools from the MCP server
   */
  async getToolsInfo(): Promise<MCPToolInfo[]> {
    try {
      info('Getting detailed tool information from MCP server');
      
      // The MCP server doesn't have a direct HTTP endpoint for listing tools with details
      // Instead, we'll use a hardcoded list of tools based on the MCP server's implementation
      // This is a temporary solution until the MCP server provides a proper endpoint
      
      return [
        {
          name: 'goodneighbor_api_call',
          description: 'Make API calls to Good Neighbor endpoints',
          inputSchema: {
            type: 'object',
            properties: {
              endpoint: {
                type: 'string',
                description: 'API endpoint path (e.g., "search/proxy", "posts/create")',
              },
              method: {
                type: 'string',
                enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                description: 'HTTP method',
              },
              data: {
                type: 'object',
                description: 'Request body data (for POST, PUT, PATCH)',
              },
              params: {
                type: 'object',
                description: 'Query parameters',
              },
            },
            required: ['endpoint', 'method'],
          }
        },
        {
          name: 'search_posts',
          description: 'Search posts using Algolia proxy',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query string',
              },
              filters: {
                type: 'string',
                description: 'Algolia filters (e.g., "type:post")',
              },
              hitsPerPage: {
                type: 'number',
                description: 'Number of results per page (default: 20)',
              },
              page: {
                type: 'number',
                description: 'Page number (default: 0)',
              },
            },
            required: ['query'],
          }
        },
        {
          name: 'get_feeds',
          description: 'Get available feeds',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['user', 'geographic', 'role', 'dynamic'],
                description: 'Filter by feed type',
              },
              limit: {
                type: 'number',
                description: 'Limit number of results',
              },
            }
          }
        },
        {
          name: 'create_post',
          description: 'Create a new post',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Post title',
              },
              content: {
                type: 'string',
                description: 'Post content (markdown supported)',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Post tags/hashtags',
              },
              feedIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Feed IDs to submit to',
              },
            },
            required: ['title', 'content'],
          }
        }
      ];
    } catch (err) {
      error('Failed to get detailed tool information from MCP server', { error: err });
      return [];
    }
  }

  /**
   * Format MCP tools for DeepSeek API
   * Converts MCP tool definitions to the format expected by DeepSeek
   */
  async formatToolsForDeepSeek(): Promise<ToolDefinition[]> {
    try {
      const toolsInfo = await this.getToolsInfo();
      
      return toolsInfo.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: {
          type: tool.inputSchema.type,
          properties: this.convertSchemaProperties(tool.inputSchema.properties),
          required: tool.inputSchema.required || []
        }
      }));
    } catch (err) {
      error('Failed to format tools for DeepSeek', { error: err });
      return [];
    }
  }

  /**
   * Convert schema properties to the format expected by DeepSeek
   */
  private convertSchemaProperties(properties: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, prop] of Object.entries(properties)) {
      result[key] = {
        type: prop.type,
        description: prop.description || ''
      };
      
      if (prop.enum) {
        result[key].enum = prop.enum;
      }
      
      if (prop.items) {
        result[key].items = prop.items;
      }
      
      if (prop.properties) {
        result[key].properties = this.convertSchemaProperties(prop.properties);
      }
    }
    
    return result;
  }
}

// Export a singleton instance
export const mcpClient = new MCPClient();
