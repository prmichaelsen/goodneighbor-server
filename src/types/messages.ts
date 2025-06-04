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
  TOOL_SELECTION = 'tool_selection', // User selects a suggested tool
  NATURAL_LANGUAGE_SEARCH = 'natural_language_search', // New: Natural language search
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
  TOOL_SUGGESTIONS = 'tool_suggestions', // Server suggests tools
  NATURAL_LANGUAGE_SEARCH_RESULT = 'natural_language_search_result', // New: Natural language search result
}

/**
 * Error codes for error messages
 */
export enum ErrorCode {
  AUTHENTICATION_FAILED = 'AUTH_FAILED',
  INVALID_MESSAGE_FORMAT = 'INVALID_FORMAT',
  TOOL_CALL_FAILED = 'TOOL_CALL_FAILED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_ERROR',
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',
  INVALID_PARAMETERS = 'INVALID_PARAMS',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT',
  RESOURCE_NOT_FOUND = 'NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT'
}

/**
 * Standard error messages
 */
export enum ErrorMessageEnum {
  AUTHENTICATION_FAILED = 'Authentication failed',
  INVALID_MESSAGE_FORMAT = 'Invalid message format',
  TOOL_CALL_FAILED = 'Tool call failed',
  INTERNAL_SERVER_ERROR = 'Internal server error',
  NOT_AUTHENTICATED = 'Not authenticated',
  INVALID_PARAMETERS = 'Invalid parameters',
  RATE_LIMIT_EXCEEDED = 'Rate limit exceeded',
  RESOURCE_NOT_FOUND = 'Resource not found',
  PERMISSION_DENIED = 'Permission denied',
  SERVICE_UNAVAILABLE = 'Service unavailable',
  TIMEOUT = 'Operation timed out'
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
 * Tool selection message from client
 */
export interface ToolSelectionMessage extends BaseMessage {
  type: ClientMessageType.TOOL_SELECTION;
  toolName: string;
  arguments: Record<string, any>;
  originalMessageId: string; // Reference to the original message
}

/**
 * Natural language search message from client
 */
export interface NaturalLanguageSearchMessage extends BaseMessage {
  type: ClientMessageType.NATURAL_LANGUAGE_SEARCH;
  query: string;
  options?: {
    enhanceExisting?: boolean;
    existingParams?: Record<string, any>;
  };
}

/**
 * Union type for all client messages
 */
export type ClientMessage = AuthMessage | ToolCallMessage | PingMessage | ChatCompletionMessage | ToolSelectionMessage | NaturalLanguageSearchMessage;

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
  code: ErrorCode;
  message: string | ErrorMessageEnum;
  context?: Record<string, any>; // Optional context object for additional details
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
 * Tool suggestion message from server
 */
export interface ToolSuggestionsMessage extends BaseMessage {
  type: ServerMessageType.TOOL_SUGGESTIONS;
  suggestions: Array<{
    tool: string;
    description: string;
    confidence: number;
    suggestedArgs: Record<string, any>;
  }>;
  originalQuery: string;
  no_tool_intent?: number; // Score between 0 and 1 indicating likelihood user isn't trying to use a tool
}

/**
 * Natural language search result message from server
 */
export interface NaturalLanguageSearchResultMessage extends BaseMessage {
  type: ServerMessageType.NATURAL_LANGUAGE_SEARCH_RESULT;
  success: boolean;
  searchParams: Record<string, any>;
  searchResults?: any;
  error?: string;
  details?: string;
}

/**
 * Union type for all server messages
 */
export type ServerMessage = AuthResultMessage | ToolResultMessage | ErrorMessage | StatusMessage | PongMessage | ChatCompletionChunkMessage | ChatCompletionResultMessage | ToolSuggestionsMessage | NaturalLanguageSearchResultMessage;
