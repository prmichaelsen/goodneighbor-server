/**
 * Connection Manager Service
 * Manages WebSocket connections and handles message routing
 */

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { 
  ClientMessage, 
  ServerMessage, 
  ClientMessageType,
  ServerMessageType,
  AuthMessage,
  ToolCallMessage,
  PingMessage,
  ChatCompletionMessage,
  ToolSelectionMessage,
  ToolSuggestionsMessage,
  NaturalLanguageSearchMessage,
  NaturalLanguageSearchResultMessage,
  ErrorCode,
  ErrorMessageEnum
} from '../types/messages';
import { SECURITY_CONFIG, WS_CONFIG, DEEPSEEK_CONFIG } from '../config';
import { debug, error, info, warn } from '../utils/logger';
import { determineErrorCode } from '../utils/error-utils';
import { mcpClient } from './mcp-client';
import { deepseekClient, DeepSeekPreset } from './deepseek-client';
import { algoliaSearchService } from './algolia-search-service';

/**
 * Connection state
 */
interface ConnectionState {
  id: string;
  socket: WebSocket;
  isAuthenticated: boolean;
  lastPing: number;
  pendingPong: boolean;
}

/**
 * Connection Manager
 * Manages WebSocket connections and message routing
 */
export class ConnectionManager {
  private connections: Map<string, ConnectionState>;
  private pingInterval: NodeJS.Timeout | null;

  constructor() {
    this.connections = new Map();
    this.pingInterval = null;
  }

  /**
   * Initialize the connection manager
   */
  initialize(): void {
    // Start ping interval
    this.pingInterval = setInterval(() => {
      this.pingConnections();
    }, WS_CONFIG.PING_INTERVAL);

    info('Connection manager initialized');
  }

  /**
   * Add a new connection
   */
  addConnection(socket: WebSocket): string {
    const connectionId = uuidv4();
    
    this.connections.set(connectionId, {
      id: connectionId,
      socket,
      isAuthenticated: false,
      lastPing: Date.now(),
      pendingPong: false,
    });

    info(`New connection added: ${connectionId}`);
    
    // Set up event handlers
    socket.on('message', (data: WebSocket.RawData) => {
      this.handleMessage(connectionId, data);
    });

    socket.on('close', () => {
      this.removeConnection(connectionId);
    });

    socket.on('error', (err) => {
      error(`WebSocket error for connection ${connectionId}`, { error: err });
      this.removeConnection(connectionId);
    });

    return connectionId;
  }

  /**
   * Remove a connection
   */
  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    
    if (connection) {
      try {
        connection.socket.terminate();
      } catch (err) {
        error(`Error terminating connection ${connectionId}`, { error: err });
      }
      
      this.connections.delete(connectionId);
      info(`Connection removed: ${connectionId}`);
    }
  }

  /**
   * Handle an incoming message
   */
  private async handleMessage(connectionId: string, data: WebSocket.RawData): Promise<void> {
    const connection = this.connections.get(connectionId);
    
    if (!connection) {
      warn(`Received message for unknown connection: ${connectionId}`);
      return;
    }

    try {
      const parsedData: {type: string; id: string; [key: string]: any} = JSON.parse(data.toString());
      
      // Validate that the parsed data has the required properties
      if (!parsedData || typeof parsedData !== 'object' || !parsedData.type || !parsedData.id) {
        throw new Error('Invalid message format');
      }
      
      const message = parsedData as ClientMessage;
      
      debug(`Received message from connection ${connectionId}`, { 
        type: parsedData.type,
        id: parsedData.id,
      });

      switch (message.type) {
        case ClientMessageType.AUTH:
          await this.handleAuthMessage(connection, message as AuthMessage);
          break;
        
        case ClientMessageType.TOOL_CALL:
          await this.handleToolCallMessage(connection, message as ToolCallMessage);
          break;
        
        case ClientMessageType.PING:
          this.handlePingMessage(connection, message as PingMessage);
          break;
        
        case ClientMessageType.CHAT_COMPLETION:
          await this.handleChatCompletionMessage(connection, message as ChatCompletionMessage);
          break;
        
        case ClientMessageType.TOOL_SELECTION:
          await this.handleToolSelectionMessage(connection, message as ToolSelectionMessage);
          break;
        
        case ClientMessageType.NATURAL_LANGUAGE_SEARCH:
          await this.handleNaturalLanguageSearchMessage(connection, message as NaturalLanguageSearchMessage);
          break;
        
        default:
          // Use type assertion for unknown message types
          const unknownMessage = message as {id: string; type: string};
          this.sendErrorMessage(
            connection, 
            unknownMessage.id, 
            `Unknown message type: ${unknownMessage.type}`,
            ErrorCode.INVALID_MESSAGE_FORMAT,
            { messageType: unknownMessage.type }
          );
      }
    } catch (err: any) {
      error(`Error handling message for connection ${connectionId}`, { error: err });
      
      try {
        // Try to send an error message
        // Use the utility function to determine the appropriate error code
        const errorCode = determineErrorCode(err);
        
        connection.socket.send(JSON.stringify({
          type: ServerMessageType.ERROR,
          id: uuidv4(),
          code: errorCode,
          message: 'Failed to process message: ' + (err.message || 'Unknown error'),
          context: { error: err.message }
        }));
      } catch (sendErr) {
        error(`Failed to send error message to connection ${connectionId}`, { error: sendErr });
      }
    }
  }

  /**
   * Handle an authentication message
   */
  private async handleAuthMessage(connection: ConnectionState, message: AuthMessage): Promise<void> {
    const { id, auth } = message;
    
    // Log the received API key and the expected API key
    info('Auth attempt details', {
      connectionId: connection.id,
      receivedApiKey: auth.apiKey,
      expectedApiKey: SECURITY_CONFIG.API_KEY,
      receivedApiKeyLength: auth.apiKey ? auth.apiKey.length : 0,
      expectedApiKeyLength: SECURITY_CONFIG.API_KEY ? SECURITY_CONFIG.API_KEY.length : 0,
      receivedApiKeyType: typeof auth.apiKey,
      expectedApiKeyType: typeof SECURITY_CONFIG.API_KEY
    });
    
    // Trim both API keys to remove any whitespace or newline characters
    const receivedApiKey = auth.apiKey ? auth.apiKey.trim() : '';
    const expectedApiKey = SECURITY_CONFIG.API_KEY ? SECURITY_CONFIG.API_KEY.trim() : '';
    
    // Check if API key is valid
    const isValid = receivedApiKey === expectedApiKey;
    
    if (isValid) {
      connection.isAuthenticated = true;
      info(`Connection ${connection.id} authenticated successfully`);
      
      this.sendMessage(connection, {
        type: ServerMessageType.AUTH_RESULT,
        id,
        success: true,
      });
    } else {
      warn(`Failed authentication attempt for connection ${connection.id}`);
      
      this.sendMessage(connection, {
        type: ServerMessageType.AUTH_RESULT,
        id,
        success: false,
        error: 'Invalid API key',
      });
      
      // Close the connection after a short delay
      setTimeout(() => {
        this.removeConnection(connection.id);
      }, 1000);
    }
  }

  /**
   * Handle a tool call message
   */
  private async handleToolCallMessage(connection: ConnectionState, message: ToolCallMessage): Promise<void> {
    const { id, tool, arguments: args } = message;
    
    // Check if authenticated
    if (!connection.isAuthenticated) {
      this.sendErrorMessage(
        connection, 
        id, 
        ErrorMessageEnum.NOT_AUTHENTICATED, 
        ErrorCode.NOT_AUTHENTICATED
      );
      return;
    }
    
    // Send status message
    this.sendMessage(connection, {
      type: ServerMessageType.STATUS,
      id,
      status: `Processing tool call: ${tool}`,
    });
    
    try {
      // Call the MCP tool
      const result = await mcpClient.callTool({
        tool,
        arguments: args,
      });
      
      if (result.success) {
        // Send tool result
        this.sendMessage(connection, {
          type: ServerMessageType.TOOL_RESULT,
          id,
          tool,
          data: result.data,
        });
      } else {
        // Send error message
        // Use the utility function to determine the appropriate error code
        const errorCode = determineErrorCode(result.error || '', result.details);
        
        this.sendErrorMessage(
          connection, 
          id, 
          result.error || ErrorMessageEnum.TOOL_CALL_FAILED, 
          errorCode,
          { tool, arguments: args }
        );
      }
    } catch (err: any) {
      error(`Error calling tool ${tool} for connection ${connection.id}`, { error: err });
      
      // Use the utility function to determine the appropriate error code
      const errorCode = determineErrorCode(err, err.details);
      
      this.sendErrorMessage(
        connection, 
        id, 
        err.message || ErrorMessageEnum.INTERNAL_SERVER_ERROR, 
        errorCode,
        { tool, error: err.message, stack: err.stack, duration: `${Date.now() - (err.startTime || 0)}ms` }
      );
    }
  }

  /**
   * Handle a ping message
   */
  private handlePingMessage(connection: ConnectionState, message: PingMessage): void {
    const { id } = message;
    
    connection.lastPing = Date.now();
    connection.pendingPong = false;
    
    this.sendMessage(connection, {
      type: ServerMessageType.PONG,
      id,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle a chat completion message
   */
  private async handleChatCompletionMessage(connection: ConnectionState, message: ChatCompletionMessage): Promise<void> {
    const { id, model, messages, stream, temperature } = message;
    
    // Check if authenticated
    if (!connection.isAuthenticated) {
      this.sendErrorMessage(
        connection, 
        id, 
        ErrorMessageEnum.NOT_AUTHENTICATED, 
        ErrorCode.NOT_AUTHENTICATED
      );
      return;
    }
    
    // Log detailed information about the chat completion request
    info(`Processing chat completion for connection ${connection.id}`, {
      messageId: id,
      model: model || 'default',
      messageCount: messages.length,
      lastMessageLength: messages[messages.length - 1]?.content?.length || 0,
      streaming: stream,
      temperature
    });
    
    // Send status message
    this.sendMessage(connection, {
      type: ServerMessageType.STATUS,
      id,
      status: `Processing chat completion`,
    });
    
    try {
      if (stream) {
        debug(`Using streaming mode for chat completion (connection ${connection.id})`, {
          messageId: id,
          model
        });
        
        // Handle streaming response
        const startTime = Date.now();
        const streamEmitter = deepseekClient.createChatCompletionStream({
          model,
          messages,
          temperature,
          stream: true
        });
        
        let chunkCount = 0;
        
        streamEmitter.on('data', (chunk) => {
          chunkCount++;
          
          // Log every 10th chunk to avoid excessive logging
          if (chunkCount % 10 === 0) {
            debug(`Received stream chunk ${chunkCount} for connection ${connection.id}`, {
              messageId: id,
              elapsedTime: `${Date.now() - startTime}ms`
            });
          }
          
          // Ensure the message follows the ChatCompletionChunkMessage interface
          this.sendMessage(connection, {
            type: ServerMessageType.CHAT_COMPLETION_CHUNK,
            id,
            chunk: {
              id: chunk.id || id,
              object: chunk.object || 'chat.completion.chunk',
              created: chunk.created || Date.now(),
              model: chunk.model || model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
              choices: chunk.choices || []
            }
          });
        });
        
        streamEmitter.on('error', (err) => {
          error(`Error in chat completion stream for connection ${connection.id}`, { 
            error: err,
            messageId: id,
            model,
            elapsedTime: `${Date.now() - startTime}ms`
          });
          
          // Use the utility function to determine the appropriate error code
          const errorCode = determineErrorCode(err, err.details);
          
          this.sendErrorMessage(
            connection, 
            id, 
            err.message || 'Streaming error', 
            errorCode,
            { model, error: err.message, stack: err.stack, duration: `${Date.now() - startTime}ms` }
          );
        });
        
        streamEmitter.on('end', () => {
          info(`Chat completion stream ended for connection ${connection.id}`, {
            messageId: id,
            totalChunks: chunkCount,
            totalTime: `${Date.now() - startTime}ms`
          });
        });
      } else {
        debug(`Using non-streaming mode for chat completion (connection ${connection.id})`, {
          messageId: id,
          model
        });
        
        // Get available tools from MCP server
        debug(`Fetching tools from MCP server for connection ${connection.id}`);
        const toolsStartTime = Date.now();
        const tools = await mcpClient.formatToolsForDeepSeek();
        debug(`Fetched ${tools.length} tools from MCP server in ${Date.now() - toolsStartTime}ms`);
        
        // Create chat completion with tools
        info(`Creating chat completion with tools for connection ${connection.id}`, {
          messageId: id,
          toolCount: tools.length
        });
        
        const completionStartTime = Date.now();
        const result = await deepseekClient.createChatCompletionWithTools({
          model,
          messages,
          temperature,
          stream: false,
          tools
        }, {
          preset: DeepSeekPreset.TOOL_SUGGESTION,
          numMessages: 1 // Use only the most recent message for tool analysis
        });
        
        const completionDuration = Date.now() - completionStartTime;
        
        if (result.success) {
          info(`Chat completion successful for connection ${connection.id}`, {
            messageId: id,
            duration: `${completionDuration}ms`,
            hasSuggestions: !!result.toolSuggestions && result.toolSuggestions.length > 0
          });
          
          // Check if there are tool suggestions
          if (result.toolSuggestions && result.toolSuggestions.length > 0) {
            // Check if any tool has confidence >= 90%
            const highConfidenceTool = result.toolSuggestions
              .filter(tool => tool.confidence >= 0.9)
              .sort((a, b) => b.confidence - a.confidence)[0];
              
            if (highConfidenceTool) {
              // Log auto-execution
              info(`Auto-executing high confidence tool for connection ${connection.id}`, {
                messageId: id,
                tool: highConfidenceTool.tool,
                confidence: highConfidenceTool.confidence
              });
              
              if (highConfidenceTool.tool === 'search_posts') {
                // Extract the original query from the user's message
                const originalQuery = messages[messages.length - 1].content;
                
                info(`Auto-executing natural language search for connection ${connection.id}`, {
                  messageId: id,
                  query: originalQuery,
                  confidence: highConfidenceTool.confidence
                });
                
                // Use AlgoliaSearchService to process the natural language query
                const searchResult = await algoliaSearchService.search(originalQuery);
                
                if (searchResult.success) {
                  // Send natural language search result
                  this.sendMessage(connection, {
                    type: ServerMessageType.NATURAL_LANGUAGE_SEARCH_RESULT,
                    id,
                    success: true,
                    searchParams: searchResult.searchParams || {},
                    searchResults: searchResult.searchResults || {}
                  } as NaturalLanguageSearchResultMessage);
                  
                  info(`Auto-executed natural language search completed successfully for connection ${connection.id}`, {
                    messageId: id,
                    query: originalQuery,
                    resultCount: searchResult.searchResults?.hits?.length || 0,
                    responseType: 'NATURAL_LANGUAGE_SEARCH_RESULT'
                  });
                } else {
                  // Send error message
                  // Use the utility function to determine the appropriate error code
                  const errorCode = determineErrorCode(searchResult.error || '', searchResult.details);
                  
                  this.sendErrorMessage(
                    connection, 
                    id, 
                    searchResult.error || ErrorMessageEnum.RESOURCE_NOT_FOUND, 
                    errorCode,
                    { query: originalQuery }
                  );
                }
              } else {
                // Execute the tool directly
                const toolResult = await mcpClient.callTool({
                  tool: highConfidenceTool.tool,
                  arguments: highConfidenceTool.suggestedArgs
                });
                
                // Return the result directly
                if (toolResult.success) {
                  this.sendMessage(connection, {
                    type: ServerMessageType.TOOL_RESULT,
                    id,
                    tool: highConfidenceTool.tool,
                    data: toolResult.data,
                  });
                  
                  info(`Auto-executed tool completed successfully for connection ${connection.id}`, {
                    messageId: id,
                    tool: highConfidenceTool.tool
                  });
                } else {
                  // Use the utility function to determine the appropriate error code
                  const errorCode = determineErrorCode(toolResult.error || '', toolResult.details);
                  
                  this.sendErrorMessage(
                    connection, 
                    id, 
                    toolResult.error || ErrorMessageEnum.TOOL_CALL_FAILED, 
                    errorCode,
                    { tool: highConfidenceTool.tool, arguments: highConfidenceTool.suggestedArgs }
                  );
                }
              }
            } else {
              debug(`Sending ${result.toolSuggestions.length} tool suggestions to connection ${connection.id}`, {
                messageId: id,
                suggestions: result.toolSuggestions.map(s => s.tool)
              });
              
              // Send tool suggestions
              this.sendMessage(connection, {
                type: ServerMessageType.TOOL_SUGGESTIONS,
                id,
                suggestions: result.toolSuggestions,
                originalQuery: messages[messages.length - 1].content
              } as ToolSuggestionsMessage);
            }
          } else {
            debug(`Sending regular chat completion result to connection ${connection.id}`, {
              messageId: id,
              responseSize: JSON.stringify(result.data).length
            });
            
            // Send regular chat completion result
            // Ensure the message follows the ChatCompletionResultMessage interface
            this.sendMessage(connection, {
              type: ServerMessageType.CHAT_COMPLETION_RESULT,
              id,
              result: {
                id: result.data.id || id,
                object: result.data.object || 'chat.completion',
                created: result.data.created || Date.now(),
                model: result.data.model || model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
                choices: result.data.choices || [],
                usage: result.data.usage || {
                  prompt_tokens: 0,
                  completion_tokens: 0,
                  total_tokens: 0
                }
              }
            });
          }
        } else {
          error(`Chat completion failed for connection ${connection.id}`, {
            messageId: id,
            error: result.error,
            details: result.details,
            duration: `${completionDuration}ms`
          });
          
          // Use the utility function to determine the appropriate error code
          const errorCode = determineErrorCode(result.error || '', result.details);
          
          this.sendErrorMessage(
            connection, 
            id, 
            result.error || ErrorMessageEnum.INTERNAL_SERVER_ERROR, 
            errorCode,
            { model, error: result.error, details: result.details, duration: `${completionDuration}ms` }
          );
        }
      }
    } catch (err: any) {
      error(`Error in chat completion for connection ${connection.id}`, { 
        error: err,
        messageId: id,
        stack: err.stack
      });
      
      // Use the utility function to determine the appropriate error code
      const errorCode = determineErrorCode(err, err.details);
      
      this.sendErrorMessage(
        connection, 
        id, 
        err.message || ErrorMessageEnum.INTERNAL_SERVER_ERROR, 
        errorCode,
        { model, error: err.message, stack: err.stack, duration: `${Date.now() - (err.startTime || 0)}ms` }
      );
    }
  }

  /**
   * Handle a tool selection message
   */
  private async handleToolSelectionMessage(connection: ConnectionState, message: ToolSelectionMessage): Promise<void> {
    const { id, toolName, arguments: args, originalMessageId } = message;
    
    // Check if authenticated
    if (!connection.isAuthenticated) {
      this.sendErrorMessage(
        connection, 
        id, 
        ErrorMessageEnum.NOT_AUTHENTICATED, 
        ErrorCode.NOT_AUTHENTICATED
      );
      return;
    }
    
    // Send status message
    this.sendMessage(connection, {
      type: ServerMessageType.STATUS,
      id,
      status: `Processing tool selection: ${toolName}`,
    });
    
    try {
      // Call the selected tool
      const result = await mcpClient.callTool({
        tool: toolName,
        arguments: args,
      });
      
      if (result.success) {
        // Send tool result
        this.sendMessage(connection, {
          type: ServerMessageType.TOOL_RESULT,
          id,
          tool: toolName,
          data: result.data,
        });
      } else {
        // Send error message
        // Use the utility function to determine the appropriate error code
        const errorCode = determineErrorCode(result.error || '', result.details);
        
        this.sendErrorMessage(
          connection, 
          id, 
          result.error || ErrorMessageEnum.TOOL_CALL_FAILED, 
          errorCode,
          { tool: toolName, arguments: args }
        );
      }
    } catch (err: any) {
      error(`Error calling selected tool ${toolName} for connection ${connection.id}`, { error: err });
      
      // Use the utility function to determine the appropriate error code
      const errorCode = determineErrorCode(err, err.details);
      
      this.sendErrorMessage(
        connection, 
        id, 
        err.message || ErrorMessageEnum.INTERNAL_SERVER_ERROR, 
        errorCode,
        { tool: toolName, error: err.message, stack: err.stack, duration: `${Date.now() - (err.startTime || 0)}ms` }
      );
    }
  }

  /**
   * Send a message to a connection
   */
  private sendMessage(connection: ConnectionState, message: ServerMessage): void {
    try {
      // Ensure the type property is included in the message
      if (!message.type) {
        error(`Message missing type property for connection ${connection.id}`, { message });
        // Add a default type if missing
        (message as any).type = 'unknown';
      }
      
      // Log the full message for debugging
      debug(`Sending message to connection ${connection.id}`, { 
        message: JSON.stringify(message)
      });
      
      connection.socket.send(JSON.stringify(message));
      
      // Use type assertion to avoid TypeScript errors
      const typedMessage = message as {type: string; id: string};
      debug(`Sent message to connection ${connection.id}`, { 
        type: typedMessage.type,
        id: typedMessage.id,
      });
    } catch (err) {
      error(`Failed to send message to connection ${connection.id}`, { error: err });
      
      // If we can't send a message, the connection might be dead
      this.removeConnection(connection.id);
    }
  }

  /**
   * Send an error message to a connection
   */
  private sendErrorMessage(
    connection: ConnectionState, 
    correlationId: string, 
    errorMessage: string | ErrorMessageEnum, 
    errorCode: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
    context?: Record<string, any>
  ): void {
    this.sendMessage(connection, {
      type: ServerMessageType.ERROR,
      id: correlationId,
      code: errorCode,
      message: errorMessage,
      context: context
    });
  }

  /**
   * Ping all connections to check if they're still alive
   */
  private pingConnections(): void {
    const now = Date.now();
    
    for (const [connectionId, connection] of this.connections.entries()) {
      // If we have a pending pong and it's timed out, remove the connection
      if (connection.pendingPong && now - connection.lastPing > WS_CONFIG.PING_TIMEOUT) {
        warn(`Connection ${connectionId} timed out`);
        this.removeConnection(connectionId);
        continue;
      }
      
      // If we don't have a pending pong, send a ping
      if (!connection.pendingPong) {
        try {
          // Use WebSocket ping frame
          connection.socket.ping();
          connection.pendingPong = true;
          debug(`Sent ping to connection ${connectionId}`);
        } catch (err) {
          error(`Failed to send ping to connection ${connectionId}`, { error: err });
          this.removeConnection(connectionId);
        }
      }
    }
  }

  /**
   * Shutdown the connection manager
   */
  shutdown(): void {
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Close all connections
    for (const connectionId of this.connections.keys()) {
      this.removeConnection(connectionId);
    }
    
    info('Connection manager shut down');
  }

  /**
   * Get the number of active connections
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Handle a natural language search message
   */
  private async handleNaturalLanguageSearchMessage(connection: ConnectionState, message: NaturalLanguageSearchMessage): Promise<void> {
    const { id, query, options } = message;
    
    // Check if authenticated
    if (!connection.isAuthenticated) {
      this.sendErrorMessage(
        connection, 
        id, 
        ErrorMessageEnum.NOT_AUTHENTICATED, 
        ErrorCode.NOT_AUTHENTICATED
      );
      return;
    }
    
    // Send status message
    this.sendMessage(connection, {
      type: ServerMessageType.STATUS,
      id,
      status: `Processing natural language search: "${query}"`,
    });
    
    try {
      let result;
      
      // Check if we should enhance existing parameters
      if (options?.enhanceExisting && options.existingParams) {
        info(`Enhancing existing search params with natural language query for connection ${connection.id}`, {
          messageId: id,
          query,
          existingParams: options.existingParams
        });
        
        // Enhance existing parameters
        const enhancedParams = await algoliaSearchService.enhanceSearchParams(
          options.existingParams,
          query
        );

        console.log(enhancedParams);
        
        // Call the MCP search_posts tool with the enhanced parameters
        const searchResult = await mcpClient.callTool({
          tool: 'search_posts',
          arguments: enhancedParams
        });
        
        if (!searchResult.success) {
          throw new Error(searchResult.error || 'Search failed');
        }
        
        result = {
          success: true,
          searchParams: enhancedParams,
          searchResults: searchResult.data
        };
      } else {
        // Perform a new natural language search
        info(`Performing new natural language search for connection ${connection.id}`, {
          messageId: id,
          query
        });
        
        result = await algoliaSearchService.search(query);
      }
      
      if (result.success) {
        // Send search result
        this.sendMessage(connection, {
          type: ServerMessageType.NATURAL_LANGUAGE_SEARCH_RESULT,
          id,
          success: true,
          searchParams: result.searchParams || {},
          searchResults: result.searchResults
        } as NaturalLanguageSearchResultMessage);
        
        info(`Natural language search completed successfully for connection ${connection.id}`, {
          messageId: id,
          query,
          resultCount: result.searchResults?.hits?.length || 0
        });
      } else {
        // Send error message
        // Use the utility function to determine the appropriate error code
        const errorCode = determineErrorCode(result.error || '', result.details);
        
        this.sendErrorMessage(
          connection, 
          id, 
          result.error || ErrorMessageEnum.RESOURCE_NOT_FOUND, 
          errorCode,
          { query, searchParams: result.searchParams }
        );
      }
    } catch (err: any) {
      error(`Error in natural language search for connection ${connection.id}`, { 
        error: err,
        messageId: id,
        query,
        stack: err.stack
      });
      
      // Use the utility function to determine the appropriate error code
      const errorCode = determineErrorCode(err, err.details);
      
      this.sendErrorMessage(
        connection, 
        id, 
        err.message || ErrorMessageEnum.INTERNAL_SERVER_ERROR, 
        errorCode,
        { query, error: err.message, stack: err.stack, duration: `${Date.now() - (err.startTime || 0)}ms` }
      );
    }
  }

  /**
   * Get the number of authenticated connections
   */
  getAuthenticatedConnectionCount(): number {
    let count = 0;
    
    for (const connection of this.connections.values()) {
      if (connection.isAuthenticated) {
        count++;
      }
    }
    
    return count;
  }
}

// Export a singleton instance
export const connectionManager = new ConnectionManager();
