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
  ToolSuggestionsMessage
} from '../types/messages';
import { SECURITY_CONFIG, WS_CONFIG } from '../config';
import { debug, error, info, warn } from '../utils/logger';
import { mcpClient } from './mcp-client';
import { deepseekClient } from './deepseek-client';

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
        
        default:
          // Use type assertion for unknown message types
          const unknownMessage = message as {id: string; type: string};
          this.sendErrorMessage(connection, unknownMessage.id, `Unknown message type: ${unknownMessage.type}`);
      }
    } catch (err: any) {
      error(`Error handling message for connection ${connectionId}`, { error: err });
      
      try {
        // Try to send an error message
        connection.socket.send(JSON.stringify({
          type: ServerMessageType.ERROR,
          id: uuidv4(),
          error: 'Failed to process message: ' + (err.message || 'Unknown error'),
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
      this.sendErrorMessage(connection, id, 'Not authenticated');
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
        this.sendErrorMessage(connection, id, result.error || 'Tool call failed');
      }
    } catch (err: any) {
      error(`Error calling tool ${tool} for connection ${connection.id}`, { error: err });
      this.sendErrorMessage(connection, id, err.message || 'Internal server error');
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
      this.sendErrorMessage(connection, id, 'Not authenticated');
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
          
          this.sendMessage(connection, {
            type: ServerMessageType.CHAT_COMPLETION_CHUNK,
            id,
            chunk
          });
        });
        
        streamEmitter.on('error', (err) => {
          error(`Error in chat completion stream for connection ${connection.id}`, { 
            error: err,
            messageId: id,
            model,
            elapsedTime: `${Date.now() - startTime}ms`
          });
          this.sendErrorMessage(connection, id, err.message || 'Streaming error');
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
          } else {
            debug(`Sending regular chat completion result to connection ${connection.id}`, {
              messageId: id,
              responseSize: JSON.stringify(result.data).length
            });
            
            // Send regular chat completion result
            this.sendMessage(connection, {
              type: ServerMessageType.CHAT_COMPLETION_RESULT,
              id,
              result: result.data
            });
          }
        } else {
          error(`Chat completion failed for connection ${connection.id}`, {
            messageId: id,
            error: result.error,
            details: result.details,
            duration: `${completionDuration}ms`
          });
          
          this.sendErrorMessage(connection, id, result.error || 'Chat completion failed');
        }
      }
    } catch (err: any) {
      error(`Error in chat completion for connection ${connection.id}`, { 
        error: err,
        messageId: id,
        stack: err.stack
      });
      this.sendErrorMessage(connection, id, err.message || 'Internal server error');
    }
  }

  /**
   * Handle a tool selection message
   */
  private async handleToolSelectionMessage(connection: ConnectionState, message: ToolSelectionMessage): Promise<void> {
    const { id, toolName, arguments: args, originalMessageId } = message;
    
    // Check if authenticated
    if (!connection.isAuthenticated) {
      this.sendErrorMessage(connection, id, 'Not authenticated');
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
        this.sendErrorMessage(connection, id, result.error || 'Tool call failed');
      }
    } catch (err: any) {
      error(`Error calling selected tool ${toolName} for connection ${connection.id}`, { error: err });
      this.sendErrorMessage(connection, id, err.message || 'Internal server error');
    }
  }

  /**
   * Send a message to a connection
   */
  private sendMessage(connection: ConnectionState, message: ServerMessage): void {
    try {
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
  private sendErrorMessage(connection: ConnectionState, correlationId: string, errorMessage: string): void {
    this.sendMessage(connection, {
      type: ServerMessageType.ERROR,
      id: correlationId,
      error: errorMessage,
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
