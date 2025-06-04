/**
 * Connection Manager
 * Manages WebSocket connections lifecycle
 */

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { ConnectionState } from './connection-state';
import { MessageRouter } from './message-router';
import { WS_CONFIG } from '../../config';
import { debug, error, info, warn } from '../../utils/logger';

/**
 * Connection Manager
 * Manages WebSocket connections lifecycle
 */
export class ConnectionManager {
  private connections: Map<string, ConnectionState>;
  private pingInterval: NodeJS.Timeout | null;
  private messageRouter: MessageRouter;

  /**
   * Create a new connection manager
   * 
   * @param messageRouter The message router to use for routing messages
   */
  constructor(messageRouter: MessageRouter) {
    this.connections = new Map();
    this.pingInterval = null;
    this.messageRouter = messageRouter;
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
   * 
   * @param socket The WebSocket connection to add
   * @returns The ID of the new connection
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
   * 
   * @param connectionId The ID of the connection to remove
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
   * 
   * @param connectionId The ID of the connection that sent the message
   * @param data The raw message data
   */
  private async handleMessage(connectionId: string, data: WebSocket.RawData): Promise<void> {
    const connection = this.connections.get(connectionId);
    
    if (!connection) {
      warn(`Received message for unknown connection: ${connectionId}`);
      return;
    }

    // Route the message to the appropriate handler
    await this.messageRouter.routeMessage(connection, data);
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

  /**
   * Get a connection by ID
   * 
   * @param connectionId The ID of the connection to get
   * @returns The connection state, or undefined if not found
   */
  getConnection(connectionId: string): ConnectionState | undefined {
    return this.connections.get(connectionId);
  }
}
