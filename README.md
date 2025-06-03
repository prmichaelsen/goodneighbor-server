# GoodNeighbor WebSocket Server

A TypeScript Node.js WebSocket server that acts as a bridge between the GoodNeighbor MCP server and client applications.

## Features

- WebSocket server for real-time bidirectional communication
- Authentication using API keys
- Connection management with automatic ping/pong
- Integration with GoodNeighbor MCP server
- Natural language search with Algolia integration
- AI-powered chat completions with DeepSeek
- Health check endpoints
- Docker containerization
- Google Cloud Run deployment configuration

## Prerequisites

- Node.js 18+ and npm
- Docker (for containerization)
- Google Cloud SDK (for deployment)

## Getting Started

### Installation

1. Clone the repository:

```bash
git clone https://github.com/your-username/goodneighbor-server.git
cd goodneighbor-server
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration values:

```
# Server Configuration
PORT=3000
NODE_ENV=development

# WebSocket Configuration
WS_PATH=/ws

# MCP Server Configuration
MCP_SERVER_URL=https://goodneighbor-mcp-868795766038.us-central1.run.app
MCP_SERVER_API_KEY=your-mcp-api-key-from-goodneighbor-mcp  # Key for authenticating with the MCP server

# Security
CLIENT_AUTH_API_KEY=your-client-auth-api-key  # Key for clients to authenticate with this server
```

### Development

Start the development server with hot reloading:

```bash
npm run dev
```

### Building

Build the project:

```bash
npm run build
```

### Running in Production

Start the production server:

```bash
npm start
```

## Docker

### Building the Docker Image

```bash
docker build -t goodneighbor-server .
```

### Running the Docker Container

```bash
docker run -p 3000:8080 \
  -e NODE_ENV=production \
  -e MCP_SERVER_API_KEY=your-mcp-api-key \
  -e CLIENT_AUTH_API_KEY=your-client-auth-api-key \
  -e MCP_SERVER_URL=https://goodneighbor-mcp-868795766038.us-central1.run.app \
  goodneighbor-server
```

## Google Cloud Run Deployment

### Setting Up Secrets

```bash
# Create secrets in Secret Manager
echo -n "your-mcp-api-key" | gcloud secrets create goodneighbor-debug-api-key --data-file=-
echo -n "your-client-auth-api-key" | gcloud secrets create goodneighbor-client-auth-key --data-file=-
```

### Manual Deployment

```bash
gcloud run deploy goodneighbor-server \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --min-instances 1 \
  --max-instances 10 \
  --memory 256Mi \
  --cpu 1 \
  --set-env-vars NODE_ENV=production,WS_PATH=/ws,MCP_SERVER_URL=https://goodneighbor-mcp-868795766038.us-central1.run.app \
  --set-secrets MCP_SERVER_API_KEY=goodneighbor-debug-api-key:latest,CLIENT_AUTH_API_KEY=goodneighbor-client-auth-key:latest
```

### Automated Deployment with Cloud Build

```bash
gcloud builds submit --config cloudbuild.yaml
```

## API Documentation

### HTTP Endpoints

- `GET /health` - Health check endpoint
- `GET /` - Server information

### WebSocket Endpoint

- `ws://localhost:3000/ws` - WebSocket endpoint (in development)
- `wss://your-cloud-run-url/ws` - WebSocket endpoint (in production)

### WebSocket Message Protocol

#### Client to Server Messages

1. Authentication:

```json
{
  "type": "auth",
  "id": "unique-message-id",
  "auth": {
    "apiKey": "your-client-auth-api-key"
  }
}
```

2. Tool Call:

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

3. Ping:

```json
{
  "type": "ping",
  "id": "unique-message-id"
}
```

4. Chat Completion:

```json
{
  "type": "chat_completion",
  "id": "unique-message-id",
  "model": "deepseek-chat",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello, how are you?"}
  ],
  "stream": false,
  "temperature": 0.7
}
```

5. Tool Selection:

```json
{
  "type": "tool_selection",
  "id": "unique-message-id",
  "toolName": "search_posts",
  "arguments": {
    "query": "community safety",
    "filters": "type:post"
  },
  "originalMessageId": "previous-message-id"
}
```

6. Natural Language Search:

```json
{
  "type": "natural_language_search",
  "id": "unique-message-id",
  "query": "Find recent posts about community safety in Phoenix",
  "options": {
    "enhanceExisting": false
  }
}
```

7. Enhance Existing Search:

```json
{
  "type": "natural_language_search",
  "id": "unique-message-id",
  "query": "only show posts from the last week",
  "options": {
    "enhanceExisting": true,
    "existingParams": {
      "query": "community safety",
      "filters": "type:post",
      "hitsPerPage": 20,
      "page": 0
    }
  }
}
```

#### Server to Client Messages

1. Authentication Result:

```json
{
  "type": "auth_result",
  "id": "unique-message-id",
  "success": true
}
```

2. Tool Result:

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

3. Error:

```json
{
  "type": "error",
  "id": "unique-message-id",
  "error": "Error message"
}
```

4. Status:

```json
{
  "type": "status",
  "id": "unique-message-id",
  "status": "Processing tool call: tool-name"
}
```

5. Pong:

```json
{
  "type": "pong",
  "id": "unique-message-id",
  "timestamp": 1622548800000
}
```

6. Chat Completion Chunk (for streaming):

```json
{
  "type": "chat_completion_chunk",
  "id": "unique-message-id",
  "chunk": {
    "id": "chunk-id",
    "object": "chat.completion.chunk",
    "created": 1622548800000,
    "model": "deepseek-chat",
    "choices": [
      {
        "index": 0,
        "delta": {
          "content": "Hello"
        },
        "finish_reason": null
      }
    ]
  }
}
```

7. Chat Completion Result (for non-streaming):

```json
{
  "type": "chat_completion_result",
  "id": "unique-message-id",
  "result": {
    "id": "result-id",
    "object": "chat.completion",
    "created": 1622548800000,
    "model": "deepseek-chat",
    "choices": [
      {
        "index": 0,
        "message": {
          "role": "assistant",
          "content": "Hello! How can I help you today?"
        },
        "finish_reason": "stop"
      }
    ],
    "usage": {
      "prompt_tokens": 20,
      "completion_tokens": 10,
      "total_tokens": 30
    }
  }
}
```

8. Tool Suggestions:

```json
{
  "type": "tool_suggestions",
  "id": "unique-message-id",
  "suggestions": [
    {
      "tool": "search_posts",
      "description": "Search posts using Algolia proxy",
      "confidence": 0.9,
      "suggestedArgs": {
        "query": "community safety",
        "hitsPerPage": 5
      }
    }
  ],
  "originalQuery": "Find posts about community safety"
}
```

9. Natural Language Search Result:

```json
{
  "type": "natural_language_search_result",
  "id": "unique-message-id",
  "success": true,
  "searchParams": {
    "query": "community safety",
    "filters": "type:post AND refs.hasViewer:\"public\"",
    "hitsPerPage": 20,
    "page": 0
  },
  "searchResults": {
    "status": 200,
    "data": {
      "hits": [
        {
          "objectID": "post-123",
          "type": "post",
          "title": "Community Safety Tips",
          "search": "Here are some tips for community safety..."
        }
      ],
      "nbHits": 10,
      "page": 0,
      "nbPages": 1,
      "hitsPerPage": 20,
      "processingTimeMS": 5
    }
  }
}
```

## Client Examples

### Basic Connection Example

Here's a simple example of how to connect to the WebSocket server from a client:

```javascript
// Connect to the WebSocket server
const socket = new WebSocket('ws://localhost:3000/ws');

// Generate a unique message ID
function generateMessageId() {
  return Date.now().toString();
}

// Handle connection open
socket.onopen = () => {
  console.log('Connected to WebSocket server');
  
  // Authenticate
  const authMessage = {
    type: 'auth',
    id: generateMessageId(),
    auth: {
      apiKey: 'your-client-auth-api-key'
    }
  };
  
  socket.send(JSON.stringify(authMessage));
};

// Handle messages from the server
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received message:', message);
  
  // Handle different message types
  switch (message.type) {
    case 'auth_result':
      if (message.success) {
        console.log('Authentication successful');
        
        // Call a tool
        const toolCallMessage = {
          type: 'tool_call',
          id: generateMessageId(),
          tool: 'example_tool',
          arguments: {
            param1: 'value1',
            param2: 'value2'
          }
        };
        
        socket.send(JSON.stringify(toolCallMessage));
      } else {
        console.error('Authentication failed:', message.error);
      }
      break;
    
    case 'tool_result':
      console.log('Tool result:', message.data);
      break;
    
    case 'error':
      console.error('Error:', message.error);
      break;
    
    case 'status':
      console.log('Status:', message.status);
      break;
    
    case 'pong':
      console.log('Pong received');
      break;
  }
};

// Handle errors
socket.onerror = (error) => {
  console.error('WebSocket error:', error);
};

// Handle connection close
socket.onclose = (event) => {
  console.log('Connection closed:', event.code, event.reason);
};
```

### Natural Language Search Example

```javascript
// Connect to the WebSocket server
const socket = new WebSocket('ws://localhost:3000/ws');

// Generate a unique message ID
function generateMessageId() {
  return Date.now().toString();
}

// Handle connection open
socket.onopen = () => {
  console.log('Connected to WebSocket server');
  
  // Authenticate
  const authMessage = {
    type: 'auth',
    id: generateMessageId(),
    auth: {
      apiKey: 'your-client-auth-api-key'
    }
  };
  
  socket.send(JSON.stringify(authMessage));
};

// Handle messages from the server
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received message:', message);
  
  // Handle different message types
  switch (message.type) {
    case 'auth_result':
      if (message.success) {
        console.log('Authentication successful');
        
        // Send natural language search query
        const searchMessage = {
          type: 'natural_language_search',
          id: generateMessageId(),
          query: 'Find recent posts about community safety in Phoenix',
          options: {
            enhanceExisting: false
          }
        };
        
        socket.send(JSON.stringify(searchMessage));
      } else {
        console.error('Authentication failed:', message.error);
      }
      break;
    
    case 'natural_language_search_result':
      if (message.success) {
        console.log('Search parameters:', message.searchParams);
        console.log('Search results:', message.searchResults);
      } else {
        console.error('Search failed:', message.error);
      }
      break;
    
    case 'error':
      console.error('Error:', message.error);
      break;
    
    case 'status':
      console.log('Status:', message.status);
      break;
  }
};

// Handle errors
socket.onerror = (error) => {
  console.error('WebSocket error:', error);
};

// Handle connection close
socket.onclose = (event) => {
  console.log('Connection closed:', event.code, event.reason);
};
```

## Testing

Use the provided test scripts to test the WebSocket server:

```bash
# Test basic WebSocket functionality
node test-websocket.js

# Test natural language search
node test-websocket-natural-language-search.js "Find posts about community safety"

# Test enhancing existing search parameters
node test-websocket-enhance-search.js "only show posts from the last week"

# Test chat completion
node test-websocket-chat-completion.js
```

## License

MIT
