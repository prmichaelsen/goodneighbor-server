/**
 * Natural Language Search Message Handler
 * Handles natural language search messages from clients
 */

import { 
  ErrorCode, 
  ErrorMessageEnum, 
  NaturalLanguageSearchMessage, 
  NaturalLanguageSearchResultMessage, 
  ServerMessageType 
} from '../../types/messages';
import { ConnectionState } from '../connection/connection-state';
import { checkAuthentication } from '../connection/connection-validator';
import { algoliaSearchService } from '../algolia-search-service';
import { error, info } from '../../utils/logger';
import { sendMessage } from '../../utils/message-sender';
import { sendErrorMessage } from '../../utils/error-handler';

/**
 * Natural language search message handler
 */
export class NaturalLanguageSearchMessageHandler {
  /**
   * Handle a natural language search message
   * 
   * @param connection The connection state
   * @param message The natural language search message
   */
  async handle(connection: ConnectionState, message: NaturalLanguageSearchMessage): Promise<void> {
    const { id, query, options } = message;
    
    // Check if authenticated
    if (!checkAuthentication(connection, id)) {
      return;
    }
    
    // Send status message
    sendMessage(connection.socket, connection.id, {
      type: ServerMessageType.STATUS,
      id,
      status: `Processing natural language search: "${query}"`,
    });
    
    try {
      let result;
      
      // Check if we should enhance existing parameters
      if (options?.enhanceExisting && options.existingParams) {
        info(`Enhancing existing search params with natural language query for connection ${connection.id}`, {
          messageId: id,
          query,
          existingParams: options.existingParams
        });
        
        // Enhance existing parameters
        const enhancedParams = await algoliaSearchService.enhanceSearchParams(
          options.existingParams,
          query
        );
        
        // Call the MCP search_posts tool with the enhanced parameters
        const searchResult = await mcpClient.callTool({
          tool: 'search_posts',
          arguments: enhancedParams
        });
        
        if (!searchResult.success) {
          throw new Error(searchResult.error || 'Search failed');
        }
        
        result = {
          success: true,
          searchParams: enhancedParams,
          searchResults: searchResult.data
        };
      } else {
        // Perform a new natural language search
        info(`Performing new natural language search for connection ${connection.id}`, {
          messageId: id,
          query
        });
        
        result = await algoliaSearchService.search(query);
      }
      
      if (result.success) {
        // Send search result
        sendMessage(connection.socket, connection.id, {
          type: ServerMessageType.NATURAL_LANGUAGE_SEARCH_RESULT,
          id,
          success: true,
          searchParams: result.searchParams || {},
          searchResults: result.searchResults
        } as NaturalLanguageSearchResultMessage);
        
        info(`Natural language search completed successfully for connection ${connection.id}`, {
          messageId: id,
          query,
          resultCount: result.searchResults?.hits?.length || 0
        });
      } else {
        // Send error message
        // Use the utility function to determine the appropriate error code
        // Use RESOURCE_NOT_FOUND as the default error code for search failures
        const errorCode = determineErrorCode(result.error || '', result.details, ErrorCode.RESOURCE_NOT_FOUND);
        
        sendErrorMessage(
          connection.socket,
          connection.id,
          id,
          result.error || ErrorMessageEnum.RESOURCE_NOT_FOUND,
          errorCode,
          { query, searchParams: result.searchParams }
        );
      }
    } catch (err: any) {
      error(`Error in natural language search for connection ${connection.id}`, { 
        error: err,
        messageId: id,
        query,
        stack: err.stack
      });
      
      // Use the utility function to determine the appropriate error code
      // Use RESOURCE_NOT_FOUND as the default error code for natural language search errors
      const errorCode = determineErrorCode(err, err.details, ErrorCode.RESOURCE_NOT_FOUND);
      
      sendErrorMessage(
        connection.socket,
        connection.id,
        id,
        err.message || ErrorMessageEnum.INTERNAL_SERVER_ERROR,
        errorCode,
        { query, error: err.message, stack: err.stack, duration: `${Date.now() - (err.startTime || 0)}ms` }
      );
    }
  }
}

// Import at the end to avoid circular dependencies
import { mcpClient } from '../mcp-client';import { determineErrorCode } from '../../utils';

