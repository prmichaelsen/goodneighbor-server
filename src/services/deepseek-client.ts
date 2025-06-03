/**
 * DeepSeek Client Service
 * Handles communication with the DeepSeek API
 */

import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import { DEEPSEEK_CONFIG } from '../config';
import { debug, error, info, warn } from '../utils/logger';

/**
 * DeepSeek Chat Completion Parameters
 */
export interface DeepSeekChatCompletionParams {
  model?: string;
  messages: Array<{role: string; content: string}>;
  temperature?: number;
  stream?: boolean;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

/**
 * Tool Parameter Schema
 */
export interface ToolParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: {
    type: string;
  };
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
}

/**
 * Tool Definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };
}

/**
 * DeepSeek Chat Completion with Tools Parameters
 */
export interface DeepSeekChatCompletionWithToolsParams extends DeepSeekChatCompletionParams {
  tools: ToolDefinition[];
}

/**
 * Tool Suggestion
 */
export interface ToolSuggestion {
  tool: string;
  description: string;
  confidence: number;
  suggestedArgs: Record<string, any>;
}

/**
 * DeepSeek Chat Completion Result
 */
export interface DeepSeekChatCompletionResult {
  success: boolean;
  data?: any;
  error?: string;
  details?: string;
  toolSuggestions?: ToolSuggestion[];
}

/**
 * DeepSeek Client for communicating with the DeepSeek API
 */
export class DeepSeekClient {
  private client: AxiosInstance;

  constructor() {
    // Create axios instance with default configuration
    this.client = axios.create({
      baseURL: 'https://api.deepseek.com',
      timeout: DEEPSEEK_CONFIG.TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_CONFIG.API_KEY}`
      }
    });

    // Log the configuration (with masked API key)
    const maskedApiKey = DEEPSEEK_CONFIG.API_KEY ? 
      `${DEEPSEEK_CONFIG.API_KEY.substring(0, 4)}...${DEEPSEEK_CONFIG.API_KEY.substring(DEEPSEEK_CONFIG.API_KEY.length - 4)}` : 
      'not-set';
    
    info('DeepSeek client initialized', {
      baseURL: 'https://api.deepseek.com',
      timeout: DEEPSEEK_CONFIG.TIMEOUT,
      apiKeyPresent: !!DEEPSEEK_CONFIG.API_KEY,
      apiKeyMasked: maskedApiKey,
      defaultModel: DEEPSEEK_CONFIG.DEFAULT_MODEL
    });

    // Add request interceptor for detailed logging
    this.client.interceptors.request.use((config) => {
      // Create a copy of headers to mask sensitive information
      const safeHeaders = { ...config.headers };
      if (safeHeaders.Authorization && typeof safeHeaders.Authorization === 'string') {
        safeHeaders.Authorization = safeHeaders.Authorization.replace(/Bearer\s+(.+)/, 'Bearer ***masked***');
      }

      debug('Sending request to DeepSeek API', {
        method: config.method,
        url: config.url,
        baseURL: config.baseURL,
        fullURL: `${config.baseURL}${config.url}`,
        headers: safeHeaders,
        data: config.data,
        timeout: config.timeout
      });
      return config;
    }, (err) => {
      // Create a safe error object to avoid circular references
      const safeError: Record<string, any> = {
        message: err.message,
        stack: err.stack,
        code: err.code
      };
      
      error('Error creating DeepSeek API request', safeError);
      return Promise.reject(err);
    });

    // Add response interceptor for detailed logging
    this.client.interceptors.response.use(
      (response) => {
        debug('Received response from DeepSeek API', {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data,
          size: JSON.stringify(response.data).length
        });
        return response;
      },
      (err) => {
        // Detailed error logging
        const errorContext: Record<string, any> = {
          message: err.message,
          code: err.code,
          stack: err.stack,
          isAxiosError: err.isAxiosError
        };

        // Add config if available
        if (err.config) {
          try {
            errorContext.config = {
              method: err.config.method,
              url: err.config.url,
              baseURL: err.config.baseURL,
              timeout: err.config.timeout
            };
          } catch (e) {
            errorContext.config = 'Error extracting config: possible circular reference';
          }
        } else {
          errorContext.config = 'No config available';
        }

        // Add response data if available
        if (err.response) {
          try {
            // Test if response data can be stringified
            const testData = err.response.data ? JSON.stringify(err.response.data) : null;
            
            errorContext.response = {
              status: err.response.status,
              statusText: err.response.statusText,
              headers: err.response.headers,
              data: err.response.data
            };
          } catch (e) {
            // If stringification fails, provide a safe version
            errorContext.response = {
              status: err.response.status,
              statusText: err.response.statusText,
              headers: err.response.headers,
              data: '[Circular data structure - cannot be stringified]'
            };
          }
        } else if (err.request) {
          // The request was made but no response was received
          try {
            errorContext.request = {
              method: err.request.method,
              path: err.request.path,
              host: err.request.host,
              protocol: err.request.protocol
            };
          } catch (e) {
            errorContext.request = 'Error extracting request: possible circular reference';
          }
        }

        error('Error in DeepSeek API response', errorContext);
        return Promise.reject(err);
      }
    );
  }

  /**
   * Create a chat completion (non-streaming)
   */
  async createChatCompletion(params: DeepSeekChatCompletionParams): Promise<DeepSeekChatCompletionResult> {
    try {
      info(`Creating DeepSeek chat completion`, {
        model: params.model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
        messages: params.messages,
      });

      const response = await this.client.post('/chat/completions', {
        model: params.model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
        messages: params.messages,
        stream: false,
        temperature: params.temperature !== undefined ? params.temperature : 0.7,
        max_tokens: params.max_tokens,
        top_p: params.top_p,
        frequency_penalty: params.frequency_penalty,
        presence_penalty: params.presence_penalty
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (err: any) {
      // Create a safe error object to avoid circular references
      const safeError: Record<string, any> = {
        message: err.message,
        code: err.code
      };
      
      // Safely extract response data if available
      let responseData = 'Unknown error';
      if (err.response && err.response.data) {
        try {
          // Test if response data can be stringified
          JSON.stringify(err.response.data);
          responseData = err.response.data;
        } catch (e) {
          responseData = '[Circular data structure - cannot be stringified]';
        }
      }
      
      error(`Failed to create DeepSeek chat completion`, {
        error: safeError,
        response: responseData,
      });

      return {
        success: false,
        error: err.message,
        details: err.response?.data?.error || 'Unknown error',
      };
    }
  }

  /**
   * Create a streaming chat completion
   * Returns an EventEmitter that emits 'data', 'end', and 'error' events
   */
  createChatCompletionStream(params: DeepSeekChatCompletionParams): EventEmitter {
    const emitter = new EventEmitter();
    
    // Log the request parameters
    info('Creating DeepSeek streaming chat completion', {
      model: params.model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
      messageCount: params.messages.length,
      temperature: params.temperature,
      stream: true
    });
    
    // Make the request
    this.client({
      method: 'post',
      url: '/chat/completions',
      data: {
        model: params.model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
        messages: params.messages,
        stream: true,
        temperature: params.temperature !== undefined ? params.temperature : 0.7,
        max_tokens: params.max_tokens,
        top_p: params.top_p,
        frequency_penalty: params.frequency_penalty,
        presence_penalty: params.presence_penalty
      },
      responseType: 'stream'
    })
    .then(response => {
      try {
        let buffer = '';
        
        // Create a safe response object for logging
        const safeResponse = {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          hasData: !!response.data
        };
        
        debug('Received streaming response from DeepSeek API', safeResponse);
        
        response.data.on('data', (chunk: Buffer) => {
          try {
            const chunkStr = chunk.toString();
            buffer += chunkStr;
            
            // Process any complete SSE messages in the buffer
            let processedBuffer = this.processSSEChunk(buffer, emitter);
            buffer = processedBuffer;
          } catch (err: any) {
            // Create a safe error object to avoid circular references
            const safeError: Record<string, any> = {
              message: err.message,
              name: err.name,
              stack: err.stack
            };
            error('Error processing stream chunk', { error: safeError });
            emitter.emit('error', new Error('Error processing stream data: ' + err.message));
          }
        });
        
        response.data.on('end', () => {
          try {
            // Process any remaining data in the buffer
            if (buffer.trim().length > 0) {
              this.processSSEChunk(buffer, emitter, true);
            }
            
            debug('Stream ended successfully');
            emitter.emit('end');
          } catch (err: any) {
            // Create a safe error object to avoid circular references
            const safeError: Record<string, any> = {
              message: err.message,
              name: err.name,
              stack: err.stack
            };
            error('Error processing final stream chunk', { error: safeError });
            emitter.emit('error', new Error('Error processing final stream data: ' + err.message));
          }
        });
        
        response.data.on('error', (err: Error) => {
          // Extract only necessary information to avoid circular references
          const safeError: Record<string, any> = {
            message: err.message,
            name: err.name,
            stack: err.stack
          };
          error('Error in DeepSeek streaming response', { error: safeError });
          emitter.emit('error', new Error('Stream error: ' + err.message));
        });
      } catch (err: any) {
        // Handle any errors in the response handling itself
        const safeError: Record<string, any> = {
          message: err.message,
          name: err.name,
          stack: err.stack
        };
        error('Error handling streaming response', { error: safeError });
        emitter.emit('error', new Error('Error handling streaming response: ' + err.message));
      }
    })
    .catch(err => {
      try {
        // Extract only necessary information to avoid circular references
        const safeError: Record<string, any> = {
          message: err.message,
          name: err.name,
          code: err.code,
          isAxiosError: err.isAxiosError
        };
        
        // Add response status and data if available, but avoid circular references
        if (err.response) {
          safeError.responseStatus = err.response.status;
          safeError.responseStatusText = err.response.statusText;
          
          // Safely extract headers
          try {
            if (err.response.headers) {
              safeError.responseHeaders = { ...err.response.headers };
            }
          } catch (e) {
            safeError.responseHeaders = '[Could not extract headers]';
          }
          
          // Safely extract data
          if (err.response.data) {
            try {
              // Only include response data if it can be safely stringified
              JSON.stringify(err.response.data);
              safeError.responseData = err.response.data;
            } catch (e) {
              safeError.responseData = '[Circular data structure - cannot be stringified]';
            }
          }
        }
        
        // Safely extract request information
        if (err.request) {
          try {
            safeError.request = {
              method: err.request.method,
              path: err.request.path,
              host: err.request.host
            };
          } catch (e) {
            safeError.request = '[Could not extract request details]';
          }
        }
        
        // Safely extract config information
        if (err.config) {
          try {
            safeError.config = {
              url: err.config.url,
              method: err.config.method,
              baseURL: err.config.baseURL,
              timeout: err.config.timeout
            };
          } catch (e) {
            safeError.config = '[Could not extract config details]';
          }
        }
        
        error('Failed to create DeepSeek streaming request', { error: safeError });
        
        // Create a simplified error message for the client
        let errorMessage = 'Failed to create streaming request';
        if (err.message) {
          // Remove any sensitive or circular reference information
          errorMessage = err.message.replace(/Bearer [^\s]+/g, 'Bearer [REDACTED]');
          
          // Limit the length of the error message
          if (errorMessage.length > 200) {
            errorMessage = errorMessage.substring(0, 200) + '...';
          }
        }
        
        emitter.emit('error', new Error(errorMessage));
      } catch (handlingErr: any) {
        // If we get an error while handling the error, use a generic message
        error('Error while handling streaming request error', { 
          message: handlingErr.message,
          originalError: err.message || 'Unknown error'
        });
        emitter.emit('error', new Error('Internal server error processing streaming request'));
      }
    });
    
    return emitter;
  }
  
  /**
   * Process a chunk of SSE data
   * Returns any unprocessed data
   */
  private processSSEChunk(buffer: string, emitter: EventEmitter, isEnd = false): string {
    // Split the buffer by double newlines (SSE message delimiter)
    const lines = buffer.split('\n\n');
    
    // Process all complete messages except the last one (which might be incomplete)
    const processUntil = isEnd ? lines.length : lines.length - 1;
    
    for (let i = 0; i < processUntil; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('data: ')) {
        const data = line.substring(6); // Remove 'data: ' prefix
        
        if (data === '[DONE]') {
          // End of stream marker
          continue;
        }
        
        try {
          const parsedData = JSON.parse(data);
          emitter.emit('data', parsedData);
        } catch (err: any) {
          // Create a safe error object to avoid circular references
          const safeError: Record<string, any> = {
            message: err.message,
            name: err.name,
            stack: err.stack
          };
          error('Error parsing SSE data', { error: safeError, data });
        }
      }
    }
    
    // Return any unprocessed data
    return isEnd ? '' : lines[lines.length - 1];
  }

  /**
   * Create a chat completion with tools (non-streaming)
   */
  async createChatCompletionWithTools(params: DeepSeekChatCompletionWithToolsParams): Promise<DeepSeekChatCompletionResult> {
    try {
      info(`Creating DeepSeek chat completion with tools`, {
        model: params.model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
        messages: params.messages,
        toolCount: params.tools.length,
      });

      // Log the tools being sent to DeepSeek for debugging
      debug('Tools being sent to DeepSeek:', JSON.stringify(params.tools, null, 2));

      // For now, since we're simulating the tool suggestion functionality,
      // we'll analyze the user's message to determine if any tools are relevant
      const userMessage = params.messages[params.messages.length - 1].content.toLowerCase();
      
      // Check if the message contains keywords related to available tools
      const toolSuggestions = this.analyzeMessageForToolSuggestions(userMessage, params.tools);
      
      if (toolSuggestions && toolSuggestions.length > 0) {
        // If we have tool suggestions, return them directly
        info(`Found ${toolSuggestions.length} tool suggestions for the message`);
        
        // Create a regular chat completion without tools for the content
        const response = await this.client.post('/chat/completions', {
          model: params.model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
          messages: params.messages,
          stream: false,
          temperature: params.temperature !== undefined ? params.temperature : 0.7,
          max_tokens: params.max_tokens,
          top_p: params.top_p,
          frequency_penalty: params.frequency_penalty,
          presence_penalty: params.presence_penalty
        });
        
        return {
          success: true,
          data: response.data,
          toolSuggestions
        };
      } else {
        // If no tool suggestions, just do a regular chat completion
        info('No tool suggestions found, proceeding with regular chat completion');
        
        const response = await this.client.post('/chat/completions', {
          model: params.model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
          messages: params.messages,
          stream: false,
          temperature: params.temperature !== undefined ? params.temperature : 0.7,
          max_tokens: params.max_tokens,
          top_p: params.top_p,
          frequency_penalty: params.frequency_penalty,
          presence_penalty: params.presence_penalty
        });
        
        return {
          success: true,
          data: response.data
        };
      }
    } catch (err: any) {
      // Create a safe error object to avoid circular references
      const safeError: Record<string, any> = {
        message: err.message,
        code: err.code
      };
      
      // Safely extract response data if available
      let responseData = 'Unknown error';
      if (err.response && err.response.data) {
        try {
          // Test if response data can be stringified
          JSON.stringify(err.response.data);
          responseData = err.response.data;
        } catch (e) {
          responseData = '[Circular data structure - cannot be stringified]';
        }
      }
      
      error(`Failed to create DeepSeek chat completion with tools`, {
        error: safeError,
        response: responseData,
      });

      return {
        success: false,
        error: err.message,
        details: err.response?.data?.error || 'Unknown error',
      };
    }
  }

  /**
   * Analyze a message to determine if any tools are relevant
   * This is a simple keyword-based approach that can be replaced with a more sophisticated
   * approach in the future (e.g., using an actual LLM to determine tool relevance)
   */
  private analyzeMessageForToolSuggestions(message: string, tools: ToolDefinition[]): ToolSuggestion[] | undefined {
    const suggestions: ToolSuggestion[] = [];
    
    // Check for search-related keywords
    if (message.includes('search') || message.includes('find') || message.includes('look for')) {
      const searchTool = tools.find(tool => tool.name === 'search_posts');
      if (searchTool) {
        // Extract potential search query
        let query = '';
        const searchTerms = ['search for', 'search', 'find', 'look for'];
        for (const term of searchTerms) {
          if (message.includes(term)) {
            const parts = message.split(term);
            if (parts.length > 1) {
              query = parts[1].trim().split(' ').slice(0, 5).join(' ');
              break;
            }
          }
        }
        
        if (!query && message.includes('about')) {
          const parts = message.split('about');
          if (parts.length > 1) {
            query = parts[1].trim().split(' ').slice(0, 5).join(' ');
          }
        }
        
        if (!query) {
          // Just use some words from the message
          const words = message.split(' ').filter(word => word.length > 3);
          query = words.slice(0, 3).join(' ');
        }
        
        suggestions.push({
          tool: 'search_posts',
          description: searchTool.description,
          confidence: 0.9,
          suggestedArgs: {
            query: query || 'community',
            hitsPerPage: 5
          }
        });
      }
    }
    
    // Check for feed-related keywords
    if (message.includes('feed') || message.includes('feeds') || message.includes('channel')) {
      const feedTool = tools.find(tool => tool.name === 'get_feeds');
      if (feedTool) {
        suggestions.push({
          tool: 'get_feeds',
          description: feedTool.description,
          confidence: 0.8,
          suggestedArgs: {
            limit: 10
          }
        });
      }
    }
    
    // Check for post-related keywords
    if (message.includes('post') || message.includes('create') || message.includes('write')) {
      const postTool = tools.find(tool => tool.name === 'create_post');
      if (postTool) {
        suggestions.push({
          tool: 'create_post',
          description: postTool.description,
          confidence: 0.7,
          suggestedArgs: {
            title: 'New post about ' + message.split(' ').slice(0, 3).join(' '),
            content: 'This is a draft post about ' + message
          }
        });
      }
    }
    
    return suggestions.length > 0 ? suggestions : undefined;
  }


  /**
   * Check if the DeepSeek API is healthy
   * Enhanced with retries, timeouts, and detailed diagnostics
   */
  async healthCheck(): Promise<boolean> {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second
    
    // Log environment variables (masked for security)
    info('DeepSeek healthCheck - Environment variables check', {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      PORT: process.env.PORT || 'not set',
      WS_PATH: process.env.WS_PATH || 'not set',
      MCP_SERVER_URL: process.env.MCP_SERVER_URL || 'not set',
      MCP_SERVER_API_KEY: process.env.MCP_SERVER_API_KEY ? 'set (masked)' : 'not set',
      CLIENT_AUTH_API_KEY: process.env.CLIENT_AUTH_API_KEY ? 'set (masked)' : 'not set',
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ? 'set (masked)' : 'not set',
    });
    
    // Log DeepSeek config
    info('DeepSeek healthCheck - Config check', {
      API_KEY_SET: !!DEEPSEEK_CONFIG.API_KEY,
      DEFAULT_MODEL: DEEPSEEK_CONFIG.DEFAULT_MODEL || 'not set',
      TIMEOUT: DEEPSEEK_CONFIG.TIMEOUT || 'not set',
    });
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // Define startTime outside try/catch so it's available in both blocks
      let startTime = Date.now(); // Initialize with current time
      
      try {
        info(`Checking DeepSeek API health (attempt ${attempt}/${maxRetries})`);
        
        // Check if API key is set
        if (!DEEPSEEK_CONFIG.API_KEY) {
          error('DeepSeek API health check failed: API key not set');
          return false;
        }
        
        // Log API key details (masked)
        const maskedApiKey = DEEPSEEK_CONFIG.API_KEY ? 
          `${DEEPSEEK_CONFIG.API_KEY.substring(0, 4)}...${DEEPSEEK_CONFIG.API_KEY.substring(DEEPSEEK_CONFIG.API_KEY.length - 4)}` : 
          'not-set';
        
        info('DeepSeek API key details', {
          apiKeyPresent: !!DEEPSEEK_CONFIG.API_KEY,
          apiKeyLength: DEEPSEEK_CONFIG.API_KEY.length,
          apiKeyMasked: maskedApiKey
        });
        
        // Use a shorter timeout for health checks
        const healthCheckTimeout = Math.min(DEEPSEEK_CONFIG.TIMEOUT, 10000); // 10 seconds max
        
        info(`Using timeout of ${healthCheckTimeout}ms for health check`);
        
        startTime = Date.now();
        
        // Log the request we're about to make
        debug('Sending health check request to DeepSeek API', {
          url: '/chat/completions',
          model: DEEPSEEK_CONFIG.DEFAULT_MODEL,
          timeout: healthCheckTimeout,
          baseURL: this.client.defaults.baseURL
        });
        
        // Simple request to test the API with minimal tokens
        const response = await this.client.post('/chat/completions', {
          model: DEEPSEEK_CONFIG.DEFAULT_MODEL,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello!' }
          ],
          max_tokens: 5,
          stream: false
        }, {
          timeout: healthCheckTimeout
        });
        
        const duration = Date.now() - startTime;
        
        // Log successful health check with timing information
        info('DeepSeek API health check successful', {
          status: response.status,
          statusText: response.statusText,
          responseTime: `${duration}ms`,
          model: DEEPSEEK_CONFIG.DEFAULT_MODEL,
          responseSize: JSON.stringify(response.data).length
        });
        
        return response.status === 200;
      } catch (err: any) {
        // Calculate duration if startTime is defined, otherwise use 'unknown'
        const endTime = Date.now();
        const duration = typeof startTime !== 'undefined' ? endTime - startTime : 'unknown';
        const durationStr = typeof duration === 'number' ? `${duration}ms` : duration;
        
        // Detailed error logging
        const errorContext: Record<string, any> = { 
          attempt,
          error: err.message,
          code: err.code,
          isAxiosError: err.isAxiosError || false,
          isNetworkError: err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND',
          duration: durationStr
        };
        
        // Add response data if available
        if (err.response) {
          try {
            // Test if response data can be stringified
            const testData = err.response.data ? JSON.stringify(err.response.data) : null;
            
            errorContext.response = {
              status: err.response.status,
              statusText: err.response.statusText,
              data: err.response.data
            };
          } catch (e) {
            // If stringification fails, provide a safe version
            errorContext.response = {
              status: err.response.status,
              statusText: err.response.statusText,
              data: '[Circular data structure - cannot be stringified]'
            };
          }
        }
        
        // Add request data if available
        if (err.config) {
          try {
            errorContext.request = {
              url: `${err.config.baseURL}${err.config.url}`,
              method: err.config.method,
              timeout: err.config.timeout
            };
          } catch (e) {
            errorContext.request = 'Error extracting request: possible circular reference';
          }
        }
        
        // Add more detailed error information
        if (err.isAxiosError) {
          errorContext.axiosDetails = {
            isTimeout: err.code === 'ECONNABORTED',
            isNetworkError: !err.response,
            hasResponse: !!err.response
          };
        }
        
        error(`DeepSeek API health check failed (attempt ${attempt}/${maxRetries})`, errorContext);
        
        // If we have more retries left, wait before trying again
        if (attempt < maxRetries) {
          info(`Retrying DeepSeek API health check in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          warn('DeepSeek API health check failed after all retry attempts');
        }
      }
    }
    
    return false;
  }
}

// Export a singleton instance
export const deepseekClient = new DeepSeekClient();
