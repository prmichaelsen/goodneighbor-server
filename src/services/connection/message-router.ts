/**
 * Message Router
 * Routes incoming WebSocket messages to the appropriate handlers
 */

import WebSocket from 'ws';
import {
  ClientMessage,
  ClientMessageType,
  AuthMessage,
  ToolCallMessage,
  PingMessage,
  ChatCompletionMessage,
  ToolSelectionMessage,
  NaturalLanguageSearchMessage,
  StartMediaUploadMessage,
  MediaChunkMessage,
  EndMediaUploadMessage,
} from '../../types/messages';
import { MediaHandler } from '../handlers/media-handler';
import { ConnectionState } from './connection-state';
import { debug, error } from '../../utils/logger';
import { handleMessageProcessingError } from '../../utils/error-handler';

/**
 * Message handler interface
 */
export interface MessageHandler<T extends ClientMessage> {
  /**
   * Handle a message
   * 
   * @param connection The connection state
   * @param message The message to handle
   */
  handle(connection: ConnectionState, message: T): Promise<void>;
}

/**
 * Message router
 */
export class MessageRouter {
  private authHandler: MessageHandler<AuthMessage>;
  private toolCallHandler: MessageHandler<ToolCallMessage>;
  private pingHandler: MessageHandler<PingMessage>;
  private chatCompletionHandler: MessageHandler<ChatCompletionMessage>;
  private toolSelectionHandler: MessageHandler<ToolSelectionMessage>;
  private naturalLanguageSearchHandler: MessageHandler<NaturalLanguageSearchMessage>;
  private mediaHandler: MediaHandler;

  /**
   * Create a new message router
   * 
   * @param authHandler The authentication message handler
   * @param toolCallHandler The tool call message handler
   * @param pingHandler The ping message handler
   * @param chatCompletionHandler The chat completion message handler
   * @param toolSelectionHandler The tool selection message handler
   * @param naturalLanguageSearchHandler The natural language search message handler
   */
  constructor(
    authHandler: MessageHandler<AuthMessage>,
    toolCallHandler: MessageHandler<ToolCallMessage>,
    pingHandler: MessageHandler<PingMessage>,
    chatCompletionHandler: MessageHandler<ChatCompletionMessage>,
    toolSelectionHandler: MessageHandler<ToolSelectionMessage>,
    naturalLanguageSearchHandler: MessageHandler<NaturalLanguageSearchMessage>,
    mediaHandler: MediaHandler
  ) {
    this.authHandler = authHandler;
    this.toolCallHandler = toolCallHandler;
    this.pingHandler = pingHandler;
    this.chatCompletionHandler = chatCompletionHandler;
    this.toolSelectionHandler = toolSelectionHandler;
    this.naturalLanguageSearchHandler = naturalLanguageSearchHandler;
    this.mediaHandler = mediaHandler;
  }

  /**
   * Route a message to the appropriate handler
   * 
   * @param connection The connection state
   * @param data The raw message data
   */
  async routeMessage(connection: ConnectionState, data: WebSocket.RawData): Promise<void> {
    try {
      const parsedData: {type: string; id: string; [key: string]: any} = JSON.parse(data.toString());
      
      // Validate that the parsed data has the required properties
      if (!parsedData || typeof parsedData !== 'object' || !parsedData.type || !parsedData.id) {
        throw new Error('Invalid message format');
      }
      
      const message = parsedData as ClientMessage;
      
      debug(`Received message from connection ${connection.id}`, { 
        type: parsedData.type,
        id: parsedData.id,
      });

      switch (message.type) {
        case ClientMessageType.AUTH:
          await this.authHandler.handle(connection, message as AuthMessage);
          break;
        
        case ClientMessageType.TOOL_CALL:
          await this.toolCallHandler.handle(connection, message as ToolCallMessage);
          break;
        
        case ClientMessageType.PING:
          await this.pingHandler.handle(connection, message as PingMessage);
          break;
        
        case ClientMessageType.CHAT_COMPLETION:
          await this.chatCompletionHandler.handle(connection, message as ChatCompletionMessage);
          break;
        
        case ClientMessageType.TOOL_SELECTION:
          await this.toolSelectionHandler.handle(connection, message as ToolSelectionMessage);
          break;
        
        case ClientMessageType.NATURAL_LANGUAGE_SEARCH:
          await this.naturalLanguageSearchHandler.handle(connection, message as NaturalLanguageSearchMessage);
          break;

        case ClientMessageType.START_MEDIA_UPLOAD:
        case ClientMessageType.MEDIA_CHUNK:
        case ClientMessageType.END_MEDIA_UPLOAD:
          await this.mediaHandler.handle(connection, message);
          break;
        
        default:
          // Use type assertion for unknown message types
          const unknownMessage = message as {id: string; type: string};
          throw new Error(`Unknown message type: ${unknownMessage.type}`);
      }
    } catch (err: any) {
      handleMessageProcessingError(
        connection.socket,
        connection.id,
        err
      );
    }
  }
}
