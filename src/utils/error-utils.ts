/**
 * Error Utilities
 * Provides utility functions for error handling
 */

import { ErrorCode } from '../types/messages';

/**
 * Determine the appropriate error code based on the error message and details
 * 
 * @param error - The error object or message
 * @param details - Optional additional error details
 * @returns The appropriate ErrorCode
 */
export function determineErrorCode(
  error: Error | string,
  details?: string
): ErrorCode {
  // Get the error message as a string
  const errorMessage = typeof error === 'string' 
    ? error.toLowerCase() 
    : (error.message || '').toLowerCase();
  
  // Get the details as a string (if provided)
  const errorDetails = details ? details.toLowerCase() : '';
  
  // Check for timeout errors
  if (
    errorMessage.includes('timeout') || 
    errorMessage.includes('timed out') ||
    errorMessage.includes('etimedout') ||
    errorDetails.includes('timeout')
  ) {
    return ErrorCode.TIMEOUT;
  }
  
  // Check for authentication errors
  if (
    errorMessage.includes('authentication') ||
    errorMessage.includes('auth') ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('api key')
  ) {
    return ErrorCode.AUTHENTICATION_FAILED;
  }
  
  // Check for permission errors
  if (
    errorMessage.includes('permission') ||
    errorMessage.includes('forbidden') ||
    errorMessage.includes('access denied')
  ) {
    return ErrorCode.PERMISSION_DENIED;
  }
  
  // Check for not found errors
  if (
    errorMessage.includes('not found') ||
    errorMessage.includes('404') ||
    errorMessage.includes('does not exist')
  ) {
    return ErrorCode.RESOURCE_NOT_FOUND;
  }
  
  // Check for rate limit errors
  if (
    errorMessage.includes('rate limit') ||
    errorMessage.includes('too many requests') ||
    errorMessage.includes('429')
  ) {
    return ErrorCode.RATE_LIMIT_EXCEEDED;
  }
  
  // Check for invalid parameter errors
  if (
    errorMessage.includes('invalid') ||
    errorMessage.includes('parameter') ||
    errorMessage.includes('argument') ||
    errorMessage.includes('bad request') ||
    errorMessage.includes('400')
  ) {
    return ErrorCode.INVALID_PARAMETERS;
  }
  
  // Check for service unavailable errors
  if (
    errorMessage.includes('unavailable') ||
    errorMessage.includes('service') ||
    errorMessage.includes('503')
  ) {
    return ErrorCode.SERVICE_UNAVAILABLE;
  }
  
  // Default to internal server error
  return ErrorCode.INTERNAL_SERVER_ERROR;
}
