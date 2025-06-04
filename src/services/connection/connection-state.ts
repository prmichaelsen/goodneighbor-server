/**
 * Connection State
 * Defines the state of a WebSocket connection
 */

import WebSocket from 'ws';

/**
 * Connection state
 */
export interface ConnectionState {
  /**
   * Unique identifier for the connection
   */
  id: string;
  
  /**
   * The WebSocket connection
   */
  socket: WebSocket;
  
  /**
   * Whether the connection is authenticated
   */
  isAuthenticated: boolean;
  
  /**
   * Timestamp of the last ping
   */
  lastPing: number;
  
  /**
   * Whether a pong is pending
   */
  pendingPong: boolean;
}
