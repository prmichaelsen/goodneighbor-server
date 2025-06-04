/**
 * Connection Validator
 * Handles authentication and validation of WebSocket connections
 */

import { ConnectionState } from './connection-state';
import { AuthMessage, ErrorCode, ErrorMessageEnum, ServerMessageType } from '../../types/messages';
import { SECURITY_CONFIG } from '../../config';
import { info, warn } from '../../utils/logger';
import { sendMessage } from '../../utils/message-sender';
import { sendErrorMessage } from '../../utils/error-handler';

/**
 * Validate an authentication message
 * 
 * @param connection The connection state
 * @param message The authentication message
 * @returns True if authentication was successful, false otherwise
 */
export function validateAuthentication(
  connection: ConnectionState,
  message: AuthMessage
): boolean {
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
    
    sendMessage(connection.socket, connection.id, {
      type: ServerMessageType.AUTH_RESULT,
      id,
      success: true,
    });
    
    return true;
  } else {
    warn(`Failed authentication attempt for connection ${connection.id}`);
    
    sendMessage(connection.socket, connection.id, {
      type: ServerMessageType.AUTH_RESULT,
      id,
      success: false,
      error: 'Invalid API key',
    });
    
    return false;
  }
}

/**
 * Check if a connection is authenticated
 * 
 * @param connection The connection state
 * @param messageId The ID of the message that triggered the check
 * @returns True if the connection is authenticated, false otherwise
 */
export function checkAuthentication(
  connection: ConnectionState,
  messageId: string
): boolean {
  if (!connection.isAuthenticated) {
    sendErrorMessage(
      connection.socket,
      connection.id,
      messageId,
      ErrorMessageEnum.NOT_AUTHENTICATED,
      ErrorCode.NOT_AUTHENTICATED
    );
    return false;
  }
  
  return true;
}
