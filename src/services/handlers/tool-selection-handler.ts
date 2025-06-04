/**
 * Tool Selection Message Handler
 * Handles tool selection messages from clients
 */

import { ErrorCode, ErrorMessageEnum, ServerMessageType, ToolSelectionMessage } from '../../types/messages';
import { ConnectionState } from '../connection/connection-state';
import { checkAuthentication } from '../connection/connection-validator';
import { mcpClient } from '../mcp-client';
import { error } from '../../utils/logger';
import { sendMessage } from '../../utils/message-sender';
import { sendErrorMessage } from '../../utils/error-handler';
import { determineErrorCode } from '../../utils';

/**
 * Tool selection message handler
 */
export class ToolSelectionMessageHandler {
  /**
   * Handle a tool selection message
   * 
   * @param connection The connection state
   * @param message The tool selection message
   */
  async handle(connection: ConnectionState, message: ToolSelectionMessage): Promise<void> {
    const { id, toolName, arguments: args, originalMessageId } = message;
    
    // Check if authenticated
    if (!checkAuthentication(connection, id)) {
      return;
    }
    
    // Send status message
    sendMessage(connection.socket, connection.id, {
      type: ServerMessageType.STATUS,
      id,
      status: `Processing tool selection: ${toolName}`,
    });
    
    try {
      // Call the selected tool
      const result = await mcpClient.callTool({
        tool: toolName,
        arguments: args,
      });
      
      if (result.success) {
        // Send tool result
        sendMessage(connection.socket, connection.id, {
          type: ServerMessageType.TOOL_RESULT,
          id,
          tool: toolName,
          data: result.data,
        });
      } else {
        // Send error message
        // Use the utility function to determine the appropriate error code
        // Use TOOL_CALL_FAILED as the default error code for tool selection failures
        const errorCode = determineErrorCode(result.error || '', result.details, ErrorCode.TOOL_CALL_FAILED);
        
        sendErrorMessage(
          connection.socket,
          connection.id,
          id,
          result.error || ErrorMessageEnum.TOOL_CALL_FAILED,
          errorCode,
          { tool: toolName, arguments: args }
        );
      }
    } catch (err: any) {
      error(`Error calling selected tool ${toolName} for connection ${connection.id}`, { error: err });
      
      // Use the utility function to determine the appropriate error code
      // Use TOOL_CALL_FAILED as the default error code for tool selection errors
      const errorCode = determineErrorCode(err, err.details, ErrorCode.TOOL_CALL_FAILED);
      
      sendErrorMessage(
        connection.socket,
        connection.id,
        id,
        err.message || ErrorMessageEnum.INTERNAL_SERVER_ERROR,
        errorCode,
        { tool: toolName, error: err.message, stack: err.stack, duration: `${Date.now() - (err.startTime || 0)}ms` }
      );
    }
  }
}
