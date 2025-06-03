/**
 * Message types for WebSocket communication
 */

/**
 * Client to Server message types
 */
export enum ClientMessageType {
  AUTH = 'auth',
  PING = 'ping',
  CHAT_COMPLETION = 'chat_completion',
}

/**
 * Server to Client message types
 */
export enum ServerMessageType {
  ERROR = 'error',
  STATUS = 'status',
  AUTH_RESULT = 'auth_result',
  PONG = 'pong',
  CHAT_COMPLETION_CHUNK = 'chat_completion_chunk',
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
 * Ping message from client
 */
export interface PingMessage extends BaseMessage {
  type: ClientMessageType.PING;
}

/**
 * Chat completion message from client
 */
export interface ChatCompletionMessage extends BaseMessage {
  type: ClientMessageType.CHAT_COMPLETION;
  model?: string; // Optional, can default to "deepseek-chat"
  messages: Array<{role: string; content: string}>;
  temperature?: number;
  // Other OpenAI-compatible parameters
}

/**
 * Union type for all client messages
 */
export type ClientMessage = AuthMessage | PingMessage | ChatCompletionMessage;

/**
 * Authentication result message from server
 */
export interface AuthResultMessage extends BaseMessage {
  type: ServerMessageType.AUTH_RESULT;
  success: boolean;
  error?: string;
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
 * Chat completion chunk message from server (for streaming)
 */
export interface ChatCompletionChunkMessage extends BaseMessage {
  type: ServerMessageType.CHAT_COMPLETION_CHUNK;
  chunk: {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
      index: number;
      delta: {
        content?: string;
        role?: string;
      };
      finish_reason: string | null;
    }>;
  };
}

/**
 * Union type for all server messages
 */
export type ServerMessage = AuthResultMessage | ErrorMessage | StatusMessage | PongMessage | ChatCompletionChunkMessage;
