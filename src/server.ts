/**
 * WebSocket Server
 * Handles WebSocket connections and routes messages to the appropriate handlers
 */

import http from 'http';
import express from 'express';
import WebSocket from 'ws';
import cors from 'cors';
import { SERVER_CONFIG, WS_CONFIG, validateConfig } from './config';
import { connectionManager } from './services/connection-manager';
import { mcpClient } from './services/mcp-client';
import { deepseekClient } from './services/deepseek-client';
import { debug, error, info } from './utils/logger';

/**
 * Server class
 */
export class Server {
  private app: express.Application;
  private httpServer: http.Server;
  private wsServer: WebSocket.Server;
  private isRunning: boolean;

  constructor() {
    // Create Express app
    this.app = express();
    
    // Create HTTP server
    this.httpServer = http.createServer(this.app);
    
    // Create WebSocket server
    this.wsServer = new WebSocket.Server({
      server: this.httpServer,
      path: WS_CONFIG.PATH,
    });
    
    this.isRunning = false;
  }

  /**
   * Initialize the server
   */
  initialize(): void {
    // Validate configuration
    validateConfig();
    
    // Configure Express middleware
    this.configureMiddleware();
    
    // Configure Express routes
    this.configureRoutes();
    
    // Configure WebSocket server
    this.configureWebSocketServer();
    
    // Initialize connection manager
    connectionManager.initialize();
    
    info('Server initialized');
  }

  /**
   * Configure Express middleware
   */
  private configureMiddleware(): void {
    // Enable CORS
    this.app.use(cors());
    
    // Parse JSON bodies
    this.app.use(express.json());
    
    // Add request logging
    this.app.use((req, res, next) => {
      debug(`HTTP ${req.method} ${req.url}`);
      next();
    });
  }

  /**
   * Configure Express routes
   */
  private configureRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        // Check MCP server health
        const mcpHealth = await mcpClient.healthCheck();
        
        // Check DeepSeek API health
        const deepseekHealth = await deepseekClient.healthCheck();
        
        if (mcpHealth && deepseekHealth) {
          res.status(200).json({
            status: 'ok',
            connections: {
              total: connectionManager.getConnectionCount(),
              authenticated: connectionManager.getAuthenticatedConnectionCount(),
            },
            services: {
              mcp: 'healthy',
              deepseek: 'healthy'
            }
          });
        } else {
          res.status(500).json({
            status: 'error',
            error: 'One or more services are not healthy',
            services: {
              mcp: mcpHealth ? 'healthy' : 'unhealthy',
              deepseek: deepseekHealth ? 'healthy' : 'unhealthy'
            }
          });
        }
      } catch (err) {
        error('Health check failed', { error: err });
        
        res.status(500).json({
          status: 'error',
          error: 'Health check failed',
        });
      }
    });
    
    // Root endpoint with server info
    this.app.get('/', (req, res) => {
      res.status(200).json({
        name: 'GoodNeighbor WebSocket Server',
        version: '1.0.0',
        websocket: {
          path: WS_CONFIG.PATH,
        },
        connections: {
          total: connectionManager.getConnectionCount(),
          authenticated: connectionManager.getAuthenticatedConnectionCount(),
        },
      });
    });
    
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        status: 'error',
        error: 'Not found',
      });
    });
  }

  /**
   * Configure WebSocket server
   */
  private configureWebSocketServer(): void {
    this.wsServer.on('connection', (socket, request) => {
      // Add connection to manager
      const connectionId = connectionManager.addConnection(socket);
      
      info(`WebSocket connection established: ${connectionId}`);
      
      // Log connection details
      debug('WebSocket connection details', {
        connectionId,
        ip: request.socket.remoteAddress,
        headers: request.headers,
      });
    });
    
    this.wsServer.on('error', (err) => {
      error('WebSocket server error', { error: err });
    });
    
    info('WebSocket server configured');
  }

  /**
   * Start the server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        reject(new Error('Server is already running'));
        return;
      }
      
      // Start HTTP server
      this.httpServer.listen(SERVER_CONFIG.PORT, () => {
        this.isRunning = true;
        
        info(`Server started on port ${SERVER_CONFIG.PORT}`);
        info(`WebSocket server available at ws://localhost:${SERVER_CONFIG.PORT}${WS_CONFIG.PATH}`);
        info(`HTTP server available at http://localhost:${SERVER_CONFIG.PORT}`);
        
        resolve();
      });
      
      this.httpServer.on('error', (err) => {
        error('HTTP server error', { error: err });
        reject(err);
      });
    });
  }

  /**
   * Stop the server
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isRunning) {
        resolve();
        return;
      }
      
      // Shutdown connection manager
      connectionManager.shutdown();
      
      // Close WebSocket server
      this.wsServer.close((err) => {
        if (err) {
          error('Error closing WebSocket server', { error: err });
          // Continue anyway
        }
        
        // Close HTTP server
        this.httpServer.close((err) => {
          if (err) {
            error('Error closing HTTP server', { error: err });
            reject(err);
            return;
          }
          
          this.isRunning = false;
          info('Server stopped');
          resolve();
        });
      });
    });
  }
}

// Export a singleton instance
export const server = new Server();
