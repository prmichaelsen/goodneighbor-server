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
  PingMessage
} from '../types/messages';
import { SECURITY_CONFIG, WS_CONFIG } from '../config';
import { debug, error, info, warn } from '../utils/logger';
import { mcpClient } from './mcp-client';

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
