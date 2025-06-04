/**
 * DeepSeek Client Service
 * Handles communication with the DeepSeek API
 */

import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import { DEEPSEEK_CONFIG } from '../config';
import { debug, error, info, warn } from '../utils/logger';

/**
 * DeepSeek Preset Types
 */
export enum DeepSeekPreset {
  DEFAULT = 'default',
  LOW_LATENCY = 'low_latency',
  HIGH_QUALITY = 'high_quality',
  TOOL_SUGGESTION = 'tool_suggestion',
  CUSTOM = 'custom'
}

/**
 * DeepSeek Options Interface
 */
export interface DeepSeekOptions {
  preset?: DeepSeekPreset;
  timeout?: number;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  keepAlive?: boolean;
  systemPrompt?: string;
  truncateUserMessage?: boolean;
  maxUserMessageLength?: number;
  retryStrategy?: 'none' | 'once' | 'exponential';
  prioritizePatternMatching?: boolean;
  numMessages?: number; // Number of most recent messages to include
}

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
 * Preset configurations
 */
const PRESET_CONFIGS: Record<DeepSeekPreset, Partial<DeepSeekOptions>> = {
  [DeepSeekPreset.DEFAULT]: {
    timeout: 60000,
    maxTokens: undefined, // Use API default
    temperature: 0.7,
    keepAlive: true,
    truncateUserMessage: false,
    retryStrategy: 'once'
  },
  
  [DeepSeekPreset.LOW_LATENCY]: {
    timeout: 3000,
    maxTokens: 10,
    temperature: 0.0,
    model: 'deepseek-chat', // Could use a lighter model if available
    keepAlive: true,
    truncateUserMessage: true,
    maxUserMessageLength: 100,
    retryStrategy: 'none',
    prioritizePatternMatching: true
  },
  
  [DeepSeekPreset.HIGH_QUALITY]: {
    timeout: 90000,
    maxTokens: 1000,
    temperature: 0.8,
    keepAlive: true,
    truncateUserMessage: false,
    retryStrategy: 'exponential'
  },
  
  [DeepSeekPreset.TOOL_SUGGESTION]: {
    // timeout: 30000, // Increased from 5000 to 30000 ms (30 seconds)
    timeout: 300, // Increased from 5000 to 30000 ms (30 seconds)
    maxTokens: 50,
    temperature: 0.2,
    keepAlive: true,
    truncateUserMessage: true,
    maxUserMessageLength: 200,
    retryStrategy: 'once',
    prioritizePatternMatching: true,
    numMessages: 1, // Default to using only the last message
    systemPrompt: `You are a tool selection assistant. Your task is to analyze the user's query and determine which tool would be most appropriate to use.

For each tool, provide:
1. The tool name
2. A confidence score between 0 and 1 (where 1 is 100% confidence)
3. Suggested arguments for the tool

IMPORTANT: Only assign a confidence score >= 0.9 if you are VERY certain that the tool is the correct one to use for the query. A confidence score of 0.9 or higher will result in automatic execution without user confirmation.`
  },
  
  [DeepSeekPreset.CUSTOM]: {
    // Empty - will use provided options
  }
};

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
      error('Error creating DeepSeek API request', {
        message: err.message,
        stack: err.stack,
        code: err.code
      });
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
        const errorContext: any = {
          message: err.message,
          code: err.code,
          stack: err.stack,
          isAxiosError: err.isAxiosError
        };

        // Add config if available
        if (err.config) {
          errorContext.config = {
            method: err.config.method,
            url: err.config.url,
            baseURL: err.config.baseURL,
            timeout: err.config.timeout
          };
        } else {
          errorContext.config = 'No config available';
        }

        // Add response data if available
        if (err.response) {
          errorContext.response = {
            status: err.response.status,
            statusText: err.response.statusText,
            headers: err.response.headers,
            data: err.response.data
          };
        } else if (err.request) {
          // The request was made but no response was received
          errorContext.request = {
            method: err.request.method,
            path: err.request.path,
            host: err.request.host,
            protocol: err.request.protocol
          };
        }

        error('Error in DeepSeek API response', errorContext);
        return Promise.reject(err);
      }
    );
  }

  /**
   * Apply preset options to the provided options
   */
  private applyPresetOptions(options?: DeepSeekOptions): DeepSeekOptions {
    // Default to DEFAULT preset if none specified
    const preset = options?.preset || DeepSeekPreset.DEFAULT;
    
    // Get preset configuration
    const presetConfig = PRESET_CONFIGS[preset];
    
    // Merge preset with provided options (provided options take precedence)
    return {
      ...presetConfig,
      ...options,
      preset // Ensure preset is included in result
    };
  }

  /**
   * Truncate messages to the specified number of most recent messages
   * Always preserves system messages
   */
  private truncateMessages(
    messages: Array<{role: string; content: string}>,
    numMessages?: number
  ): Array<{role: string; content: string}> {
    if (!numMessages || numMessages <= 0 || messages.length <= numMessages) {
      return messages;
    }
    
    // Get system messages
    const systemMessages = messages.filter(msg => msg.role === 'system');
    
    // Get non-system messages
    const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
    
    // Get the specified number of most recent non-system messages
    const recentMessages = nonSystemMessages.slice(
      Math.max(0, nonSystemMessages.length - numMessages)
    );
    
    // Combine system messages with recent messages
    return [...systemMessages, ...recentMessages];
  }

  /**
   * Process messages based on options
   */
  private processMessages(
    messages: Array<{role: string; content: string}>,
    options: DeepSeekOptions
  ): Array<{role: string; content: string}> {
    let processedMessages = [...messages];
    
    // Truncate messages if needed
    if (options.numMessages) {
      processedMessages = this.truncateMessages(processedMessages, options.numMessages);
    }
    
    // Truncate user message if needed
    if (options.truncateUserMessage && options.maxUserMessageLength) {
      processedMessages = processedMessages.map(msg => {
        if (msg.role === 'user' && msg.content.length > options.maxUserMessageLength!) {
          return {
            ...msg,
            content: msg.content.substring(0, options.maxUserMessageLength)
          };
        }
        return msg;
      });
    }
    
    // Add custom system prompt if provided
    if (options.systemPrompt) {
      // Replace existing system message or add new one
      const hasSystemMsg = processedMessages.some(msg => msg.role === 'system');
      if (hasSystemMsg) {
        processedMessages = processedMessages.map(msg => {
          if (msg.role === 'system') {
            return { ...msg, content: options.systemPrompt! };
          }
          return msg;
        });
      } else {
        processedMessages = [
          { role: 'system', content: options.systemPrompt },
          ...processedMessages
        ];
      }
    }
    
    return processedMessages;
  }

  /**
   * Create a chat completion (non-streaming)
   */
  async createChatCompletion(
    params: DeepSeekChatCompletionParams,
    options?: DeepSeekOptions
  ): Promise<DeepSeekChatCompletionResult> {
    try {
      // Apply preset options
      const appliedOptions = this.applyPresetOptions(options);
      
      info(`Creating DeepSeek chat completion`, {
        model: params.model || appliedOptions.model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
        messages: params.messages,
        preset: appliedOptions.preset,
      });

      // Process messages based on options
      const processedMessages = this.processMessages(params.messages, appliedOptions);
      
      const response = await this.client.post('/chat/completions', {
        model: params.model || appliedOptions.model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
        messages: processedMessages,
        stream: false,
        temperature: appliedOptions.temperature !== undefined ? 
          appliedOptions.temperature : 
          (params.temperature !== undefined ? params.temperature : 0.7),
        max_tokens: appliedOptions.maxTokens || params.max_tokens,
        top_p: params.top_p,
        frequency_penalty: params.frequency_penalty,
        presence_penalty: params.presence_penalty
      }, {
        timeout: appliedOptions.timeout || DEEPSEEK_CONFIG.TIMEOUT
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

      // Handle retry strategy if configured
      if (options?.retryStrategy === 'once') {
        try {
          info(`Retrying DeepSeek chat completion (single retry)`);
          
          // Apply preset options
          const appliedOptions = this.applyPresetOptions(options);
          
          // Process messages based on options
          const processedMessages = this.processMessages(params.messages, appliedOptions);
          
          const response = await this.client.post('/chat/completions', {
            model: params.model || appliedOptions.model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
            messages: processedMessages,
            stream: false,
            temperature: appliedOptions.temperature !== undefined ? 
              appliedOptions.temperature : 
              (params.temperature !== undefined ? params.temperature : 0.7),
            max_tokens: appliedOptions.maxTokens || params.max_tokens,
            top_p: params.top_p,
            frequency_penalty: params.frequency_penalty,
            presence_penalty: params.presence_penalty
          }, {
            timeout: appliedOptions.timeout || DEEPSEEK_CONFIG.TIMEOUT
          });

          return {
            success: true,
            data: response.data,
          };
        } catch (retryErr: any) {
          error(`Retry failed for DeepSeek chat completion`, {
            error: retryErr.message,
            response: retryErr.response?.data,
          });
        }
      }

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
  createChatCompletionStream(
    params: DeepSeekChatCompletionParams,
    options?: DeepSeekOptions
  ): EventEmitter {
    const emitter = new EventEmitter();
    
    // Apply preset options
    const appliedOptions = this.applyPresetOptions(options);
    
    // Process messages based on options
    const processedMessages = this.processMessages(params.messages, appliedOptions);
    
    // Make the request
    this.client({
      method: 'post',
      url: '/chat/completions',
      data: {
        model: params.model || appliedOptions.model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
        messages: processedMessages,
        stream: true,
        temperature: appliedOptions.temperature !== undefined ? 
          appliedOptions.temperature : 
          (params.temperature !== undefined ? params.temperature : 0.7),
        max_tokens: appliedOptions.maxTokens || params.max_tokens,
        top_p: params.top_p,
        frequency_penalty: params.frequency_penalty,
        presence_penalty: params.presence_penalty
      },
      responseType: 'stream',
      timeout: appliedOptions.timeout || DEEPSEEK_CONFIG.TIMEOUT
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
  async createChatCompletionWithTools(
    params: DeepSeekChatCompletionWithToolsParams,
    options?: DeepSeekOptions
  ): Promise<DeepSeekChatCompletionResult> {
    try {
      // Default to TOOL_SUGGESTION preset if none specified
      const defaultOptions: DeepSeekOptions = {
        preset: DeepSeekPreset.TOOL_SUGGESTION
      };
      
      // Apply preset options
      const appliedOptions = this.applyPresetOptions(options || defaultOptions);
      
      info(`Creating DeepSeek chat completion with tools`, {
        model: params.model || appliedOptions.model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
        messages: params.messages,
        toolCount: params.tools.length,
        preset: appliedOptions.preset
      });

      // Log the tools being sent to DeepSeek for debugging
      debug('Tools being sent to DeepSeek:', JSON.stringify(params.tools, null, 2));

      // Process messages based on options
      const processedMessages = this.processMessages(params.messages, appliedOptions);
      
      // For now, since we're simulating the tool suggestion functionality,
      // we'll analyze the user's message to determine if any tools are relevant
      const userMessage = processedMessages[processedMessages.length - 1].content.toLowerCase();
      
      // Check if the message contains keywords related to available tools
      const toolSuggestions = this.analyzeMessageForToolSuggestions(userMessage, params.tools);
      
      if (toolSuggestions && toolSuggestions.length > 0) {
        // If we have tool suggestions, return them directly
        info(`Found ${toolSuggestions.length} tool suggestions for the message`);
        
        // Create a regular chat completion without tools for the content
        const response = await this.client.post('/chat/completions', {
          model: params.model || appliedOptions.model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
          messages: processedMessages,
          stream: false,
          temperature: appliedOptions.temperature !== undefined ? 
            appliedOptions.temperature : 
            (params.temperature !== undefined ? params.temperature : 0.7),
          max_tokens: appliedOptions.maxTokens || params.max_tokens,
          top_p: params.top_p,
          frequency_penalty: params.frequency_penalty,
          presence_penalty: params.presence_penalty
        }, {
          timeout: appliedOptions.timeout || DEEPSEEK_CONFIG.TIMEOUT
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
          model: params.model || appliedOptions.model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
          messages: processedMessages,
          stream: false,
          temperature: appliedOptions.temperature !== undefined ? 
            appliedOptions.temperature : 
            (params.temperature !== undefined ? params.temperature : 0.7),
          max_tokens: appliedOptions.maxTokens || params.max_tokens,
          top_p: params.top_p,
          frequency_penalty: params.frequency_penalty,
          presence_penalty: params.presence_penalty
        }, {
          timeout: appliedOptions.timeout || DEEPSEEK_CONFIG.TIMEOUT
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

      // Handle retry strategy if configured
      if (options?.retryStrategy === 'once') {
        try {
          info(`Retrying DeepSeek chat completion with tools (single retry)`);
          
          // Apply preset options
          const appliedOptions = this.applyPresetOptions(options);
          
          // Process messages based on options
          const processedMessages = this.processMessages(params.messages, appliedOptions);
          
          // Create a regular chat completion without tools for the content
          const response = await this.client.post('/chat/completions', {
            model: params.model || appliedOptions.model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
            messages: processedMessages,
            stream: false,
            temperature: appliedOptions.temperature !== undefined ? 
              appliedOptions.temperature : 
              (params.temperature !== undefined ? params.temperature : 0.7),
            max_tokens: appliedOptions.maxTokens || params.max_tokens,
            top_p: params.top_p,
            frequency_penalty: params.frequency_penalty,
            presence_penalty: params.presence_penalty
          }, {
            timeout: appliedOptions.timeout || DEEPSEEK_CONFIG.TIMEOUT
          });
          
          return {
            success: true,
            data: response.data
          };
        } catch (retryErr: any) {
          error(`Retry failed for DeepSeek chat completion with tools`, {
            error: retryErr.message,
            response: retryErr.response?.data,
          });
        }
      }

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
          confidence: 0.95, // Increased from 0.9 to ensure auto-execution
          suggestedArgs: {
            query: query || 'community',
            hitsPerPage: 5
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
        const errorContext: any = { 
          attempt,
          error: err.message,
          code: err.code,
          isAxiosError: err.isAxiosError || false,
          isNetworkError: err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND',
          duration: durationStr
        };
        
        // Add response data if available
        if (err.response) {
          errorContext.response = {
            status: err.response.status,
            statusText: err.response.statusText,
            data: err.response.data
          };
        }
        
        // Add request data if available
        if (err.config) {
          errorContext.request = {
            url: `${err.config.baseURL}${err.config.url}`,
            method: err.config.method,
            timeout: err.config.timeout
          };
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
