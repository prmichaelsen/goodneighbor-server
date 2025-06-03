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
 * DeepSeek Chat Completion Result
 */
export interface DeepSeekChatCompletionResult {
  success: boolean;
  data?: any;
  error?: string;
  details?: string;
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
