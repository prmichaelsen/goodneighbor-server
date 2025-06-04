/**
 * Chat Completion Message Handler
 * Handles chat completion messages from clients
 */

import { EventEmitter } from 'events';
import { 
  ChatCompletionMessage, 
  ErrorCode, 
  ErrorMessageEnum, 
  NaturalLanguageSearchResultMessage, 
  ServerMessageType, 
  ToolSuggestionsMessage 
} from '../../types/messages';
import { ConnectionState } from '../connection/connection-state';
import { checkAuthentication } from '../connection/connection-validator';
import { deepseekClient, DeepSeekPreset } from '../deepseek-client';
import { mcpClient } from '../mcp-client';
import { algoliaSearchService } from '../algolia-search-service';
import { DEEPSEEK_CONFIG } from '../../config';
import { debug, error, info } from '../../utils/logger';
import { sendMessage } from '../../utils/message-sender';
import { sendErrorMessage } from '../../utils/error-handler';
import { determineErrorCode } from '../../utils';

/**
 * Chat completion message handler
 */
export class ChatCompletionMessageHandler {
  /**
   * Handle a chat completion message
   * 
   * @param connection The connection state
   * @param message The chat completion message
   */
  async handle(connection: ConnectionState, message: ChatCompletionMessage): Promise<void> {
    const { id, model, messages, stream, temperature } = message;
    
    // Check if authenticated
    if (!checkAuthentication(connection, id)) {
      return;
    }
    
    // Log detailed information about the chat completion request
    info(`Processing chat completion for connection ${connection.id}`, {
      messageId: id,
      model: model || 'default',
      messageCount: messages.length,
      lastMessageLength: messages[messages.length - 1]?.content?.length || 0,
      streaming: stream,
      temperature
    });
    
    // Send status message
    sendMessage(connection.socket, connection.id, {
      type: ServerMessageType.STATUS,
      id,
      status: `Processing chat completion`,
    });
    
    try {
      if (stream) {
        await this.handleStreamingChatCompletion(connection, id, model, messages, temperature);
      } else {
        await this.handleNonStreamingChatCompletion(connection, id, model, messages, temperature);
      }
    } catch (err: any) {
      error(`Error in chat completion for connection ${connection.id}`, { 
        error: err,
        messageId: id,
        stack: err.stack
      });
      
      // Use the utility function to determine the appropriate error code
      // Use INTERNAL_SERVER_ERROR as the default error code for general chat completion errors
      const errorCode = determineErrorCode(err, err.details, ErrorCode.INTERNAL_SERVER_ERROR);
      
      sendErrorMessage(
        connection.socket,
        connection.id,
        id,
        err.message || ErrorMessageEnum.INTERNAL_SERVER_ERROR,
        errorCode,
        { model, error: err.message, stack: err.stack, duration: `${Date.now() - (err.startTime || 0)}ms` }
      );
    }
  }

  /**
   * Handle a streaming chat completion
   * 
   * @param connection The connection state
   * @param messageId The message ID
   * @param model The model to use
   * @param messages The messages to process
   * @param temperature The temperature to use
   */
  private async handleStreamingChatCompletion(
    connection: ConnectionState,
    messageId: string,
    model: string | undefined,
    messages: Array<{role: string; content: string}>,
    temperature: number | undefined
  ): Promise<void> {
    debug(`Using streaming mode for chat completion (connection ${connection.id})`, {
      messageId,
      model
    });
    
    // Handle streaming response
    const startTime = Date.now();
    const streamEmitter = deepseekClient.createChatCompletionStream({
      model,
      messages,
      temperature,
      stream: true
    });
    
    let chunkCount = 0;
    
    streamEmitter.on('data', (chunk) => {
      chunkCount++;
      
      // Log every 10th chunk to avoid excessive logging
      if (chunkCount % 10 === 0) {
        debug(`Received stream chunk ${chunkCount} for connection ${connection.id}`, {
          messageId,
          elapsedTime: `${Date.now() - startTime}ms`
        });
      }
      
      // Ensure the message follows the ChatCompletionChunkMessage interface
      sendMessage(connection.socket, connection.id, {
        type: ServerMessageType.CHAT_COMPLETION_CHUNK,
        id: messageId,
        chunk: {
          id: chunk.id || messageId,
          object: chunk.object || 'chat.completion.chunk',
          created: chunk.created || Date.now(),
          model: chunk.model || model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
          choices: chunk.choices || []
        }
      });
    });
    
    streamEmitter.on('error', (err) => {
      error(`Error in chat completion stream for connection ${connection.id}`, { 
        error: err,
        messageId,
        model,
        elapsedTime: `${Date.now() - startTime}ms`
      });
      
      // Use the utility function to determine the appropriate error code
      // Use TIMEOUT as the default error code for streaming errors, as they're often timeout related
      const errorCode = determineErrorCode(err, err.details, ErrorCode.TIMEOUT);
      
      sendErrorMessage(
        connection.socket,
        connection.id,
        messageId,
        err.message || 'Streaming error',
        errorCode,
        { model, error: err.message, stack: err.stack, duration: `${Date.now() - startTime}ms` }
      );
    });
    
    streamEmitter.on('end', () => {
      info(`Chat completion stream ended for connection ${connection.id}`, {
        messageId,
        totalChunks: chunkCount,
        totalTime: `${Date.now() - startTime}ms`
      });
    });
  }

  /**
   * Handle a non-streaming chat completion
   * 
   * @param connection The connection state
   * @param messageId The message ID
   * @param model The model to use
   * @param messages The messages to process
   * @param temperature The temperature to use
   */
  private async handleNonStreamingChatCompletion(
    connection: ConnectionState,
    messageId: string,
    model: string | undefined,
    messages: Array<{role: string; content: string}>,
    temperature: number | undefined
  ): Promise<void> {
    debug(`Using non-streaming mode for chat completion (connection ${connection.id})`, {
      messageId,
      model
    });
    
    // Get available tools from MCP server
    debug(`Fetching tools from MCP server for connection ${connection.id}`);
    const toolsStartTime = Date.now();
    const tools = await mcpClient.formatToolsForDeepSeek();
    debug(`Fetched ${tools.length} tools from MCP server in ${Date.now() - toolsStartTime}ms`);
    
    // Create chat completion with tools
    info(`Creating chat completion with tools for connection ${connection.id}`, {
      messageId,
      toolCount: tools.length
    });
    
    const completionStartTime = Date.now();
    const result = await deepseekClient.createChatCompletionWithTools({
      model,
      messages,
      temperature,
      stream: false,
      tools
    }, {
      preset: DeepSeekPreset.TOOL_SUGGESTION,
      numMessages: 1 // Use only the most recent message for tool analysis
    });
    
    const completionDuration = Date.now() - completionStartTime;
    
    if (result.success) {
      info(`Chat completion successful for connection ${connection.id}`, {
        messageId,
        duration: `${completionDuration}ms`,
        hasSuggestions: !!result.toolSuggestions && result.toolSuggestions.length > 0
      });
      
      // Check if there are tool suggestions
      if (result.toolSuggestions && result.toolSuggestions.length > 0) {
        await this.handleToolSuggestions(
          connection,
          messageId,
          result.toolSuggestions,
          messages
        );
      } else {
        debug(`Sending regular chat completion result to connection ${connection.id}`, {
          messageId,
          responseSize: JSON.stringify(result.data).length
        });
        
        // Send regular chat completion result
        // Ensure the message follows the ChatCompletionResultMessage interface
        sendMessage(connection.socket, connection.id, {
          type: ServerMessageType.CHAT_COMPLETION_RESULT,
          id: messageId,
          result: {
            id: result.data.id || messageId,
            object: result.data.object || 'chat.completion',
            created: result.data.created || Date.now(),
            model: result.data.model || model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
            choices: result.data.choices || [],
            usage: result.data.usage || {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0
            }
          }
        });
      }
    } else {
      error(`Chat completion failed for connection ${connection.id}`, {
        messageId,
        error: result.error,
        details: result.details,
        duration: `${completionDuration}ms`
      });
      
      // Use the utility function to determine the appropriate error code
      // Use INTERNAL_SERVER_ERROR as the default error code for chat completion failures
      const errorCode = determineErrorCode(result.error || '', result.details, ErrorCode.INTERNAL_SERVER_ERROR);
      
      sendErrorMessage(
        connection.socket,
        connection.id,
        messageId,
        result.error || ErrorMessageEnum.INTERNAL_SERVER_ERROR,
        errorCode,
        { model, error: result.error, details: result.details, duration: `${completionDuration}ms` }
      );
    }
  }

  /**
   * Handle tool suggestions
   * 
   * @param connection The connection state
   * @param messageId The message ID
   * @param toolSuggestions The tool suggestions
   * @param messages The original messages
   */
  private async handleToolSuggestions(
    connection: ConnectionState,
    messageId: string,
    toolSuggestions: Array<{
      tool: string;
      description: string;
      confidence: number;
      suggestedArgs: Record<string, any>;
    }>,
    messages: Array<{role: string; content: string}>
  ): Promise<void> {
    // Check if any tool has confidence >= 90%
    const highConfidenceTool = toolSuggestions
      .filter(tool => tool.confidence >= 0.9)
      .sort((a, b) => b.confidence - a.confidence)[0];
      
    if (highConfidenceTool) {
      // Log auto-execution
      info(`Auto-executing high confidence tool for connection ${connection.id}`, {
        messageId,
        tool: highConfidenceTool.tool,
        confidence: highConfidenceTool.confidence
      });
      
      if (highConfidenceTool.tool === 'search_posts') {
        await this.handleAutoSearchPosts(
          connection,
          messageId,
          messages[messages.length - 1].content
        );
      } else {
        await this.handleAutoExecuteTool(
          connection,
          messageId,
          highConfidenceTool.tool,
          highConfidenceTool.suggestedArgs
        );
      }
    } else {
      debug(`Sending ${toolSuggestions.length} tool suggestions to connection ${connection.id}`, {
        messageId,
        suggestions: toolSuggestions.map(s => s.tool)
      });
      
      // Send tool suggestions
      sendMessage(connection.socket, connection.id, {
        type: ServerMessageType.TOOL_SUGGESTIONS,
        id: messageId,
        suggestions: toolSuggestions,
        originalQuery: messages[messages.length - 1].content
      } as ToolSuggestionsMessage);
    }
  }

  /**
   * Handle auto-execution of search_posts tool
   * 
   * @param connection The connection state
   * @param messageId The message ID
   * @param originalQuery The original query
   */
  private async handleAutoSearchPosts(
    connection: ConnectionState,
    messageId: string,
    originalQuery: string
  ): Promise<void> {
    info(`Auto-executing natural language search for connection ${connection.id}`, {
      messageId,
      query: originalQuery
    });
    
    // Use AlgoliaSearchService to process the natural language query
    const searchResult = await algoliaSearchService.search(originalQuery);
    
    if (searchResult.success) {
      // Send natural language search result
      sendMessage(connection.socket, connection.id, {
        type: ServerMessageType.NATURAL_LANGUAGE_SEARCH_RESULT,
        id: messageId,
        success: true,
        searchParams: searchResult.searchParams || {},
        searchResults: searchResult.searchResults || {}
      } as NaturalLanguageSearchResultMessage);
      
      info(`Auto-executed natural language search completed successfully for connection ${connection.id}`, {
        messageId,
        query: originalQuery,
        resultCount: searchResult.searchResults?.hits?.length || 0,
        responseType: 'NATURAL_LANGUAGE_SEARCH_RESULT'
      });
    } else {
      // Send error message
      // Use the utility function to determine the appropriate error code
      // Use RESOURCE_NOT_FOUND as the default error code for search failures
      const errorCode = determineErrorCode(searchResult.error || '', searchResult.details, ErrorCode.RESOURCE_NOT_FOUND);
      
      sendErrorMessage(
        connection.socket,
        connection.id,
        messageId,
        searchResult.error || ErrorMessageEnum.RESOURCE_NOT_FOUND,
        errorCode,
        { query: originalQuery }
      );
    }
  }

  /**
   * Handle auto-execution of a tool
   * 
   * @param connection The connection state
   * @param messageId The message ID
   * @param tool The tool to execute
   * @param args The tool arguments
   */
  private async handleAutoExecuteTool(
    connection: ConnectionState,
    messageId: string,
    tool: string,
    args: Record<string, any>
  ): Promise<void> {
    // Execute the tool directly
    const toolResult = await mcpClient.callTool({
      tool,
      arguments: args
    });
    
    // Return the result directly
    if (toolResult.success) {
      sendMessage(connection.socket, connection.id, {
        type: ServerMessageType.TOOL_RESULT,
        id: messageId,
        tool,
        data: toolResult.data,
      });
      
      info(`Auto-executed tool completed successfully for connection ${connection.id}`, {
        messageId,
        tool
      });
    } else {
      // Use the utility function to determine the appropriate error code
      // Use TOOL_CALL_FAILED as the default error code for auto-executed tool failures
      const errorCode = determineErrorCode(toolResult.error || '', toolResult.details, ErrorCode.TOOL_CALL_FAILED);
      
      sendErrorMessage(
        connection.socket,
        connection.id,
        messageId,
        toolResult.error || ErrorMessageEnum.TOOL_CALL_FAILED,
        errorCode,
        { tool, arguments: args }
      );
    }
  }
}
