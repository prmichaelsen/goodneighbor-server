/**
 * WebSocket Server
 * Handles WebSocket connections and routes messages to the appropriate handlers
 */

import http from 'http';
import express from 'express';
import WebSocket from 'ws';
import cors from 'cors';
import { SERVER_CONFIG, WS_CONFIG, validateConfig, DEEPSEEK_CONFIG } from './config';
import { connectionManager } from './services/connection-manager';
import { mcpClient } from './services/mcp-client';
import { deepseekClient } from './services/deepseek-client';
import { debug, error, info, warn } from './utils/logger';

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
    // Health check endpoint with enhanced diagnostics
    this.app.get('/health', async (req, res) => {
      try {
        info('Health check requested', {
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });
        
        const startTime = Date.now();
        const healthResults: Record<string, any> = {
          timestamp: new Date().toISOString(),
          environment: SERVER_CONFIG.NODE_ENV,
          uptime: process.uptime(),
          connections: {
            total: connectionManager.getConnectionCount(),
            authenticated: connectionManager.getAuthenticatedConnectionCount(),
          },
          services: {}
        };
        
        // Check MCP server health
        info('Checking MCP server health');
        try {
          const mcpStartTime = Date.now();
          const mcpHealth = await mcpClient.healthCheck();
          const mcpDuration = Date.now() - mcpStartTime;
          
          healthResults.services.mcp = {
            status: mcpHealth ? 'healthy' : 'unhealthy',
            responseTime: `${mcpDuration}ms`
          };
          
          info(`MCP server health check ${mcpHealth ? 'succeeded' : 'failed'}`, {
            duration: mcpDuration
          });
        } catch (mcpErr: any) {
          error('MCP health check error', { error: mcpErr });
          healthResults.services.mcp = {
            status: 'error',
            error: mcpErr.message
          };
        }
        
        // Check DeepSeek API health with detailed diagnostics
        info('Checking DeepSeek API health');
        try {
          // Log environment variables for DeepSeek (masked for security)
          debug('DeepSeek environment variables', {
            DEEPSEEK_API_KEY: DEEPSEEK_CONFIG.API_KEY ? 
              `${DEEPSEEK_CONFIG.API_KEY.substring(0, 4)}...${DEEPSEEK_CONFIG.API_KEY.substring(DEEPSEEK_CONFIG.API_KEY.length - 4)}` : 
              'not-set',
            DEEPSEEK_API_KEY_LENGTH: DEEPSEEK_CONFIG.API_KEY?.length || 0,
            DEFAULT_MODEL: DEEPSEEK_CONFIG.DEFAULT_MODEL,
            TIMEOUT: DEEPSEEK_CONFIG.TIMEOUT,
            NODE_ENV: process.env.NODE_ENV,
            DEBUG: process.env.DEBUG,
            LOG_LEVEL: process.env.LOG_LEVEL
          });
          
          const deepseekStartTime = Date.now();
          info('Calling deepseekClient.healthCheck()');
          const deepseekHealth = await deepseekClient.healthCheck();
          const deepseekDuration = Date.now() - deepseekStartTime;
          
          healthResults.services.deepseek = {
            status: deepseekHealth ? 'healthy' : 'unhealthy',
            responseTime: `${deepseekDuration}ms`,
            apiKeyConfigured: !!DEEPSEEK_CONFIG.API_KEY,
            apiKeyLength: DEEPSEEK_CONFIG.API_KEY?.length || 0,
            defaultModel: DEEPSEEK_CONFIG.DEFAULT_MODEL
          };
          
          info(`DeepSeek API health check ${deepseekHealth ? 'succeeded' : 'failed'}`, {
            duration: deepseekDuration
          });
        } catch (deepseekErr: any) {
          error('DeepSeek health check error', { 
            error: deepseekErr.message,
            stack: deepseekErr.stack,
            code: deepseekErr.code,
            isAxiosError: deepseekErr.isAxiosError || false
          });
          
          healthResults.services.deepseek = {
            status: 'error',
            error: deepseekErr.message,
            errorCode: deepseekErr.code,
            isAxiosError: deepseekErr.isAxiosError || false
          };
          
          // Add response data if available
          if (deepseekErr.response) {
            healthResults.services.deepseek.response = {
              status: deepseekErr.response.status,
              statusText: deepseekErr.response.statusText,
              data: deepseekErr.response.data
            };
          }
          
          // Add request data if available
          if (deepseekErr.config) {
            healthResults.services.deepseek.request = {
              url: deepseekErr.config.url,
              method: deepseekErr.config.method,
              baseURL: deepseekErr.config.baseURL,
              timeout: deepseekErr.config.timeout
            };
          }
        }
        
        // Calculate overall health status
        const allHealthy = 
          healthResults.services.mcp?.status === 'healthy' && 
          healthResults.services.deepseek?.status === 'healthy';
        
        healthResults.status = allHealthy ? 'ok' : 'error';
        healthResults.responseTime = `${Date.now() - startTime}ms`;
        
        // Log the health check result
        if (allHealthy) {
          info('Health check succeeded', healthResults);
          res.status(200).json(healthResults);
        } else {
          warn('Health check failed', healthResults);
          res.status(503).json({
            ...healthResults,
            error: 'One or more services are not healthy'
          });
        }
      } catch (err: any) {
        error('Health check failed with exception', { error: err });
        
        res.status(500).json({
          status: 'error',
          error: 'Health check failed: ' + err.message,
          timestamp: new Date().toISOString()
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
