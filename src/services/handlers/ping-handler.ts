/**
 * Ping Message Handler
 * Handles ping messages from clients
 */

import { PingMessage, ServerMessageType } from '../../types/messages';
import { ConnectionState } from '../connection/connection-state';
import { sendMessage } from '../../utils/message-sender';

/**
 * Ping message handler
 */
export class PingMessageHandler {
  /**
   * Handle a ping message
   * 
   * @param connection The connection state
   * @param message The ping message
   */
  async handle(connection: ConnectionState, message: PingMessage): Promise<void> {
    const { id } = message;
    
    // Update the last ping timestamp
    connection.lastPing = Date.now();
    connection.pendingPong = false;
    
    // Send a pong message
    sendMessage(connection.socket, connection.id, {
      type: ServerMessageType.PONG,
      id,
      timestamp: Date.now(),
    });
  }
}
