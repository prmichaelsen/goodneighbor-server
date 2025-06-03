/**
 * Test WebSocket client for chat completion
 * 
 * This script connects to the WebSocket server, authenticates, and sends a chat completion request.
 * It supports both streaming and non-streaming completions.
 * 
 * Usage:
 * node test-websocket-chat-completion.js [--stream]
 * 
 * Options:
 * --stream: Use streaming mode (default: false)
 */

const WebSocket = require('ws');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
dotenv.config();

// Configuration
const WS_URL = `ws://localhost:${process.env.PORT || 3000}${process.env.WS_PATH || '/ws'}`;
const API_KEY = process.env.CLIENT_AUTH_API_KEY;

// Check if streaming mode is enabled
const useStreaming = process.argv.includes('--stream');
console.log(`Using ${useStreaming ? 'streaming' : 'non-streaming'} mode`);

// Create WebSocket connection
const ws = new WebSocket(WS_URL);

// Message queue for sending messages after authentication
const messageQueue = [];

// Track if we're authenticated
let isAuthenticated = false;

// Connect to WebSocket server
ws.on('open', () => {
  console.log(`Connected to ${WS_URL}`);
  
  // Send authentication message
  const authMessage = {
    type: 'auth',
    id: uuidv4(),
    auth: {
      apiKey: API_KEY
    }
  };
  
  console.log('Sending authentication message...');
  ws.send(JSON.stringify(authMessage));
});

// Handle incoming messages
ws.on('message', (data) => {
  try {
    const message = JSON.parse(data);
    console.log(`Received message type: ${message.type}`);
    
    switch (message.type) {
      case 'auth_result':
        handleAuthResult(message);
        break;
      
      case 'chat_completion_chunk':
        handleChatCompletionChunk(message);
        break;
      
      case 'chat_completion_result':
        handleChatCompletionResult(message);
        break;
      
      case 'status':
        console.log(`Status: ${message.status}`);
        break;
      
      case 'error':
        console.error(`Error: ${message.error}`);
        break;
      
      default:
        console.log('Full message:', message);
    }
  } catch (err) {
    console.error('Error parsing message:', err);
  }
});

// Handle authentication result
function handleAuthResult(message) {
  if (message.success) {
    console.log('Authentication successful');
    isAuthenticated = true;
    
    // Send any queued messages
    while (messageQueue.length > 0) {
      const queuedMessage = messageQueue.shift();
      ws.send(JSON.stringify(queuedMessage));
    }
    
    // Send chat completion request
    sendChatCompletionRequest();
  } else {
    console.error('Authentication failed:', message.error);
    ws.close();
  }
}

// Handle chat completion chunk (streaming)
function handleChatCompletionChunk(message) {
  const chunk = message.chunk;
  const choice = chunk.choices[0];
  
  if (choice && choice.delta && choice.delta.content) {
    process.stdout.write(choice.delta.content);
  }
}

// Handle chat completion result (non-streaming)
function handleChatCompletionResult(message) {
  const result = message.result;
  const choice = result.choices[0];
  
  console.log('\nChat Completion Result:');
  console.log('------------------------');
  console.log(choice.message.content);
  console.log('------------------------');
  console.log('Usage:', result.usage);
  
  // Close the connection after receiving the result
  ws.close();
}

// Send chat completion request
function sendChatCompletionRequest() {
  const chatCompletionMessage = {
    type: 'chat_completion',
    id: uuidv4(),
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Tell me a short joke about programming.' }
    ],
    stream: useStreaming,
    temperature: 0.7
  };
  
  console.log('Sending chat completion request...');
  
  if (isAuthenticated) {
    ws.send(JSON.stringify(chatCompletionMessage));
  } else {
    messageQueue.push(chatCompletionMessage);
  }
}

// Handle WebSocket errors
ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Handle WebSocket close
ws.on('close', () => {
  console.log('Connection closed');
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Closing connection...');
  ws.close();
  process.exit(0);
});
