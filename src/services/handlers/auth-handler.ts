/**
 * Authentication Message Handler
 * Handles authentication messages from clients
 */

import { AuthMessage } from '../../types/messages';
import { ConnectionState } from '../connection/connection-state';
import { validateAuthentication } from '../connection/connection-validator';

/**
 * Authentication message handler
 */
export class AuthMessageHandler {
  /**
   * Handle an authentication message
   * 
   * @param connection The connection state
   * @param message The authentication message
   */
  async handle(connection: ConnectionState, message: AuthMessage): Promise<void> {
    // Validate the authentication message
    const isValid = validateAuthentication(connection, message);
    
    // If authentication failed, the connection will be removed after a short delay
    if (!isValid) {
      setTimeout(() => {
        // This will be handled by the connection manager
        // The connection manager will check if the connection still exists
        connection.socket.terminate();
      }, 1000);
    }
  }
}
