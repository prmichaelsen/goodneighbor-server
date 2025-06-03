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
  CHAT_COMPLETION = 'chat_completion',
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
  CHAT_COMPLETION_CHUNK = 'chat_completion_chunk',
  CHAT_COMPLETION_RESULT = 'chat_completion_result',
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
 * Chat completion message from client
 */
export interface ChatCompletionMessage extends BaseMessage {
  type: ClientMessageType.CHAT_COMPLETION;
  model?: string; // Optional, can default to "deepseek-chat"
  messages: Array<{role: string; content: string}>;
  stream: boolean;
  temperature?: number;
  // Other OpenAI-compatible parameters
}

/**
 * Union type for all client messages
 */
export type ClientMessage = AuthMessage | ToolCallMessage | PingMessage | ChatCompletionMessage;

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
 * Chat completion result message from server (for non-streaming)
 */
export interface ChatCompletionResultMessage extends BaseMessage {
  type: ServerMessageType.CHAT_COMPLETION_RESULT;
  result: {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
      index: number;
      message: {
        role: string;
        content: string;
      };
      finish_reason: string;
    }>;
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };
}

/**
 * Union type for all server messages
 */
export type ServerMessage = AuthResultMessage | ToolResultMessage | ErrorMessage | StatusMessage | PongMessage | ChatCompletionChunkMessage | ChatCompletionResultMessage;
