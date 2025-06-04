/**
 * Error Handler Utility
 * Provides functions for handling errors and sending error messages
 */

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { ErrorCode, ErrorMessageEnum, ServerMessageType } from '../types/messages';
import { sendMessage } from './message-sender';
import { error } from './logger';
import { determineErrorCode } from './error-utils';

/**
 * Send an error message to a WebSocket connection
 * 
 * @param socket The WebSocket connection to send the error message to
 * @param connectionId The ID of the connection (for logging)
 * @param correlationId The ID of the message that caused the error
 * @param errorMessage The error message to send
 * @param errorCode The error code to send
 * @param context Additional context for the error
 * @returns True if the error message was sent successfully, false otherwise
 */
export function sendErrorMessage(
  socket: WebSocket,
  connectionId: string,
  correlationId: string,
  errorMessage: string | ErrorMessageEnum,
  errorCode: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
  context?: Record<string, any>
): boolean {
  return sendMessage(socket, connectionId, {
    type: ServerMessageType.ERROR,
    id: correlationId,
    code: errorCode,
    message: errorMessage,
    context: context
  });
}

/**
 * Handle an error that occurred during message processing
 * 
 * @param socket The WebSocket connection to send the error message to
 * @param connectionId The ID of the connection (for logging)
 * @param err The error that occurred
 * @param messageId The ID of the message that caused the error (if available)
 * @param defaultErrorCode The default error code to use if none can be determined
 * @param context Additional context for the error
 */
export function handleMessageProcessingError(
  socket: WebSocket,
  connectionId: string,
  err: any,
  messageId?: string,
  defaultErrorCode: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
  context?: Record<string, any>
): void {
  error(`Error processing message for connection ${connectionId}`, { error: err });
  
  try {
    // Use the utility function to determine the appropriate error code
    const errorCode = determineErrorCode(err, err.details, defaultErrorCode);
    
    // Generate a new message ID if none was provided
    const id = messageId || uuidv4();
    
    sendErrorMessage(
      socket,
      connectionId,
      id,
      err.message || ErrorMessageEnum.INTERNAL_SERVER_ERROR,
      errorCode,
      { ...context, error: err.message, stack: err.stack }
    );
  } catch (sendErr) {
    error(`Failed to send error message to connection ${connectionId}`, { error: sendErr });
  }
}