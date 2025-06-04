/**
 * Tool Call Message Handler
 * Handles tool call messages from clients
 */

import { ErrorCode, ErrorMessageEnum, ServerMessageType, ToolCallMessage } from '../../types/messages';
import { ConnectionState } from '../connection/connection-state';
import { checkAuthentication } from '../connection/connection-validator';
import { mcpClient } from '../mcp-client';
import { info, error } from '../../utils/logger';
import { sendMessage } from '../../utils/message-sender';
import { sendErrorMessage } from '../../utils/error-handler';
import { determineErrorCode } from '../../utils';

/**
 * Tool call message handler
 */
export class ToolCallMessageHandler {
  /**
   * Handle a tool call message
   * 
   * @param connection The connection state
   * @param message The tool call message
   */
  async handle(connection: ConnectionState, message: ToolCallMessage): Promise<void> {
    const { id, tool, arguments: args } = message;
    
    // Check if authenticated
    if (!checkAuthentication(connection, id)) {
      return;
    }
    
    // Send status message
    sendMessage(connection.socket, connection.id, {
      type: ServerMessageType.STATUS,
      id,
      status: `Processing tool call: ${tool}`,
    });
    
    try {
      // Call the MCP tool
      const result = await mcpClient.callTool({
        tool,
        arguments: args,
      });
      
      if (result.success) {
        // Send tool result
        sendMessage(connection.socket, connection.id, {
          type: ServerMessageType.TOOL_RESULT,
          id,
          tool,
          data: result.data,
        });
      } else {
        // Send error message
        // Use the utility function to determine the appropriate error code
        // Use TOOL_CALL_FAILED as the default error code for tool call failures
        const errorCode = determineErrorCode(result.error || '', result.details, ErrorCode.TOOL_CALL_FAILED);
        
        sendErrorMessage(
          connection.socket,
          connection.id,
          id,
          result.error || ErrorMessageEnum.TOOL_CALL_FAILED,
          errorCode,
          { tool, arguments: args }
        );
      }
    } catch (err: any) {
      error(`Error calling tool ${tool} for connection ${connection.id}`, { error: err });
      
      // Use the utility function to determine the appropriate error code
      // Use TOOL_CALL_FAILED as the default error code for tool call errors
      const errorCode = determineErrorCode(err, err.details, ErrorCode.TOOL_CALL_FAILED);
      
      sendErrorMessage(
        connection.socket,
        connection.id,
        id,
        err.message || ErrorMessageEnum.INTERNAL_SERVER_ERROR,
        errorCode,
        { tool, error: err.message, stack: err.stack, duration: `${Date.now() - (err.startTime || 0)}ms` }
      );
    }
  }
}
