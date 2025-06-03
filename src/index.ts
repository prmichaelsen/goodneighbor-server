/**
 * GoodNeighbor WebSocket Server
 * Main entry point
 */

import { server } from './server';
import { error, info } from './utils/logger';

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  try {
    // Initialize the server
    server.initialize();
    
    // Start the server
    await server.start();
    
    info('Server started successfully');
  } catch (err) {
    error('Failed to start server', { error: err });
    process.exit(1);
  }
}

/**
 * Handle process signals
 */
function setupSignalHandlers(): void {
  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', async () => {
    info('Received SIGINT signal, shutting down...');
    
    try {
      await server.stop();
      process.exit(0);
    } catch (err) {
      error('Error during shutdown', { error: err });
      process.exit(1);
    }
  });
  
  // Handle SIGTERM
  process.on('SIGTERM', async () => {
    info('Received SIGTERM signal, shutting down...');
    
    try {
      await server.stop();
      process.exit(0);
    } catch (err) {
      error('Error during shutdown', { error: err });
      process.exit(1);
    }
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    error('Uncaught exception', { error: err });
    
    // Attempt to gracefully shut down
    server.stop().finally(() => {
      process.exit(1);
    });
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    error('Unhandled promise rejection', { reason });
    
    // Attempt to gracefully shut down
    server.stop().finally(() => {
      process.exit(1);
    });
  });
}

// Set up signal handlers
setupSignalHandlers();

// Start the server
startServer();
