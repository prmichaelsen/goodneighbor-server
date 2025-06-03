/**
 * DeepSeek Client Service
 * Handles communication with the DeepSeek API
 */

import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import { DEEPSEEK_CONFIG } from '../config';
import { debug, error, info } from '../utils/logger';

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

    // Add request interceptor for logging
    this.client.interceptors.request.use((config) => {
      debug('Sending request to DeepSeek API', {
        method: config.method,
        url: config.url,
        data: config.data,
      });
      return config;
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        debug('Received response from DeepSeek API', {
          status: response.status,
          statusText: response.statusText,
          data: response.data,
        });
        return response;
      },
      (err) => {
        error('Error in DeepSeek API response', {
          message: err.message,
          response: err.response?.data,
        });
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
      error(`Failed to create DeepSeek chat completion`, {
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
   * Create a streaming chat completion
   * Returns an EventEmitter that emits 'data', 'end', and 'error' events
   */
  createChatCompletionStream(params: DeepSeekChatCompletionParams): EventEmitter {
    const emitter = new EventEmitter();
    
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
      let buffer = '';
      
      response.data.on('data', (chunk: Buffer) => {
        const chunkStr = chunk.toString();
        buffer += chunkStr;
        
        // Process any complete SSE messages in the buffer
        let processedBuffer = this.processSSEChunk(buffer, emitter);
        buffer = processedBuffer;
      });
      
      response.data.on('end', () => {
        // Process any remaining data in the buffer
        if (buffer.trim().length > 0) {
          this.processSSEChunk(buffer, emitter, true);
        }
        
        emitter.emit('end');
      });
      
      response.data.on('error', (err: Error) => {
        error('Error in DeepSeek streaming response', { error: err });
        emitter.emit('error', err);
      });
    })
    .catch(err => {
      error('Failed to create DeepSeek streaming request', { error: err });
      emitter.emit('error', err);
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
        } catch (err) {
          error('Error parsing SSE data', { error: err, data });
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
      error(`Failed to create DeepSeek chat completion with tools`, {
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
   */
  async healthCheck(): Promise<boolean> {
    try {
      info('Checking DeepSeek API health');
      
      // Simple request to test the API
      const response = await this.client.post('/chat/completions', {
        model: DEEPSEEK_CONFIG.DEFAULT_MODEL,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello!' }
        ],
        max_tokens: 5,
        stream: false
      });
      
      return response.status === 200;
    } catch (err: any) {
      error('DeepSeek API health check failed', { 
        error: err.message,
        response: err.response?.data
      });
      return false;
    }
  }
}

// Export a singleton instance
export const deepseekClient = new DeepSeekClient();
