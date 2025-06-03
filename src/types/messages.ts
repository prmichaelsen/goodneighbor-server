/**
 * Message types for WebSocket communication
 */

/**
 * Client to Server message types
 */
export enum ClientMessageType {
  TOOL_CALL = 'tool_call',
  AUTH = 'auth',
  PING = 'ping',
}

/**
 * Server to Client message types
 */
export enum ServerMessageType {
  TOOL_RESULT = 'tool_result',
  ERROR = 'error',
  STATUS = 'status',
  AUTH_RESULT = 'auth_result',
  PONG = 'pong',
}

/**
 * Base message interface
 */
export interface BaseMessage {
  type: string;
  id: string; // Unique message ID for correlation
}

/**
 * Authentication message from client
 */
export interface AuthMessage extends BaseMessage {
  type: ClientMessageType.AUTH;
  auth: {
    apiKey: string;
  };
}

/**
 * Tool call message from client
 */
export interface ToolCallMessage extends BaseMessage {
  type: ClientMessageType.TOOL_CALL;
  tool: string;
  arguments: Record<string, any>;
}

/**
 * Ping message from client
 */
export interface PingMessage extends BaseMessage {
  type: ClientMessageType.PING;
}

/**
 * Union type for all client messages
 */
export type ClientMessage = AuthMessage | ToolCallMessage | PingMessage;

/**
 * Authentication result message from server
 */
export interface AuthResultMessage extends BaseMessage {
  type: ServerMessageType.AUTH_RESULT;
  success: boolean;
  error?: string;
}

/**
 * Tool result message from server
 */
export interface ToolResultMessage extends BaseMessage {
  type: ServerMessageType.TOOL_RESULT;
  tool: string;
  data: any;
}

/**
 * Error message from server
 */
export interface ErrorMessage extends BaseMessage {
  type: ServerMessageType.ERROR;
  error: string;
  code?: string;
}

/**
 * Status message from server
 */
export interface StatusMessage extends BaseMessage {
  type: ServerMessageType.STATUS;
  status: string;
}

/**
 * Pong message from server
 */
export interface PongMessage extends BaseMessage {
  type: ServerMessageType.PONG;
  timestamp: number;
}

/**
 * Union type for all server messages
 */
export type ServerMessage = AuthResultMessage | ToolResultMessage | ErrorMessage | StatusMessage | PongMessage;
