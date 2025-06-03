# GoodNeighbor Server Memory Bank

## Project Overview

The GoodNeighbor Server is a TypeScript Node.js WebSocket server that acts as a bridge between the GoodNeighbor MCP server and client applications. It provides a real-time bidirectional communication channel for clients to make tool calls to the MCP server.

## Key Components

1. **WebSocket Server**: Handles WebSocket connections and routes messages between clients and the MCP server.
2. **Connection Manager**: Manages WebSocket connections, handles authentication, and maintains connection state.
3. **MCP Client**: Communicates with the GoodNeighbor MCP server to execute tool calls.
4. **Message Protocol**: Defines the message types and formats for communication between clients and the server.

## Project Structure

- `src/types/messages.ts`: Defines the message types and interfaces for WebSocket communication.
- `src/config/index.ts`: Loads environment variables and provides configuration values.
- `src/utils/logger.ts`: Provides logging functions with different log levels.
- `src/services/mcp-client.ts`: Handles communication with the GoodNeighbor MCP server.
- `src/services/connection-manager.ts`: Manages WebSocket connections and handles message routing.
- `src/server.ts`: Sets up the WebSocket server and HTTP server for health checks.
- `src/index.ts`: Main entry point for the application.

## Deployment

The server is designed to be deployed to Google Cloud Run using the provided Dockerfile and cloudbuild.yaml configuration.

## Environment Variables

- `PORT`: The port to run the server on (default: 3000)
- `NODE_ENV`: The environment to run the server in (development or production)
- `WS_PATH`: The WebSocket endpoint path (default: /ws)
- `MCP_SERVER_URL`: The URL of the GoodNeighbor MCP server
- `MCP_SERVER_API_KEY`: The API key for authenticating with the GoodNeighbor MCP server
- `CLIENT_AUTH_API_KEY`: The API key for clients to authenticate with this server

## Message Protocol

### Client to Server Messages

1. **Authentication**:
   ```json
   {
     "type": "auth",
     "id": "unique-message-id",
     "auth": {
       "apiKey": "your-client-auth-api-key"
     }
   }
   ```

2. **Tool Call**:
   ```json
   {
     "type": "tool_call",
     "id": "unique-message-id",
     "tool": "tool-name",
     "arguments": {
       "param1": "value1",
       "param2": "value2"
     }
   }
   ```

3. **Ping**:
   ```json
   {
     "type": "ping",
     "id": "unique-message-id"
   }
   ```

### Server to Client Messages

1. **Authentication Result**:
   ```json
   {
     "type": "auth_result",
     "id": "unique-message-id",
     "success": true
   }
   ```

2. **Tool Result**:
   ```json
   {
     "type": "tool_result",
     "id": "unique-message-id",
     "tool": "tool-name",
     "data": {
       "result": "tool-result-data"
     }
   }
   ```

3. **Error**:
   ```json
   {
     "type": "error",
     "id": "unique-message-id",
     "error": "Error message"
   }
   ```

4. **Status**:
   ```json
   {
     "type": "status",
     "id": "unique-message-id",
     "status": "Processing tool call: tool-name"
   }
   ```

5. **Pong**:
   ```json
   {
     "type": "pong",
     "id": "unique-message-id",
     "timestamp": 1622548800000
   }
   ```

## Development

To run the server locally:

1. Install dependencies: `npm install`
2. Create a `.env` file based on `.env.example`
3. Start the development server: `npm run dev`

## Building

To build the project:

```bash
npm run build
```

## Running in Production

To start the production server:

```bash
npm start
