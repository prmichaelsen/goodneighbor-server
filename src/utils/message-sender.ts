/**
 * Message Sender Utility
 * Provides functions for sending messages to WebSocket connections
 */

import WebSocket from 'ws';
import { ServerMessage } from '../types/messages';
import { debug, error } from './logger';

/**
 * Send a message to a WebSocket connection
 * 
 * @param socket The WebSocket connection to send the message to
 * @param connectionId The ID of the connection (for logging)
 * @param message The message to send
 * @returns True if the message was sent successfully, false otherwise
 */
export function sendMessage(
  socket: WebSocket,
  connectionId: string,
  message: ServerMessage
): boolean {
  try {
    // Check if the socket is open
    if (socket.readyState !== WebSocket.OPEN) {
      error(`Cannot send message to connection ${connectionId} - socket not open`, {
        messageType: message.type,
        messageId: message.id,
        socketState: socket.readyState
      });
      return false;
    }
    
    // Convert the message to a JSON string
    const messageString = JSON.stringify(message);
    
    // Log the message (but not the full content for large messages)
    const isLargeMessage = messageString.length > 1000;
    debug(`Sending message to connection ${connectionId}`, {
      messageType: message.type,
      messageId: message.id,
      messageSize: messageString.length,
      message: isLargeMessage ? '[Large message content omitted]' : message
    });
    
    // Send the message
    socket.send(messageString);
    
    return true;
  } catch (err) {
    error(`Error sending message to connection ${connectionId}`, {
      error: err,
      messageType: message.type,
      messageId: message.id
    });
    
    return false;
  }
}
