/**
 * Test WebSocket client for auto-execution of high-confidence tools
 * 
 * This script connects to the WebSocket server, authenticates, and sends a chat completion request
 * that should trigger a high-confidence tool suggestion (confidence >= 90%). The server should
 * automatically execute the tool without requiring a TOOL_SELECTION message.
 * 
 * Usage:
 * node test-websocket-auto-execute.js [search|other]
 * 
 * - If "search" is specified, it will test auto-execution of the search_posts tool
 * - If "other" is specified, it will test auto-execution of a non-search tool
 * - If no argument is provided, it defaults to "search"
 */

const WebSocket = require('ws');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
dotenv.config();

// Get test type from command line arguments
const testType = process.argv[2] || 'search';
console.log(`Running auto-execution test for ${testType} tool`);

// Configuration
const WS_URL = process.env.WS_URL || 'ws://localhost:4000/ws';
const API_KEY = process.env.CLIENT_AUTH_API_KEY || '';

if (!API_KEY) {
  console.error('CLIENT_AUTH_API_KEY environment variable is required');
  process.exit(1);
}

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
      
      case 'tool_suggestions':
        console.log('\nERROR: Received tool suggestions when auto-execution should have happened!');
        console.log('Tool suggestions:', message.suggestions);
        ws.close();
        break;
      
      case 'tool_result':
        handleToolResult(message);
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
    
    // Send chat completion request that should trigger high-confidence tool suggestion
    sendChatCompletionRequest();
  } else {
    console.error('Authentication failed:', message.error);
    ws.close();
  }
}

// Handle tool result (for all tools including search)
function handleToolResult(message) {
  console.log('\nSUCCESS: Tool was auto-executed!');
  console.log('------------------------');
  console.log(`Tool: ${message.tool}`);
  
  // Handle search_posts tool result specifically
  if (testType === 'search' && message.tool === 'search_posts') {
    console.log('\nSearch results:');
    
    if (message.data && message.data.data && message.data.data.hits) {
      const hits = message.data.data.hits || [];
      console.log(`Found ${hits.length} results`);
      
      hits.forEach((hit, index) => {
        if (index < 3) { // Show only first 3 results to avoid cluttering the console
          console.log(`\nResult ${index + 1}:`);
          console.log(`  ID: ${hit.objectID}`);
          console.log(`  Type: ${hit.type}`);
          if (hit.title) console.log(`  Title: ${hit.title}`);
          if (hit.search) console.log(`  Content: ${hit.search.substring(0, 100)}...`);
        }
      });
      
      if (hits.length > 3) {
        console.log(`\n... and ${hits.length - 3} more results`);
      }
    } else {
      console.log('No results found or unexpected result format');
    }
  } else {
    // For non-search tools
    console.log('Data:', message.data);
  }
  
  // Close the connection after receiving the result
  ws.close();
}

// Handle chat completion result (if no tool suggestions were provided)
function handleChatCompletionResult(message) {
  console.log('\nERROR: Received chat completion result when tool auto-execution was expected!');
  console.log('------------------------');
  
  const result = message.result;
  const choice = result.choices[0];
  
  console.log(choice.message.content);
  console.log('------------------------');
  console.log('Usage:', result.usage);
  
  // Close the connection after receiving the result
  ws.close();
}

// Send chat completion request
function sendChatCompletionRequest() {
  // Create a message that should trigger a high-confidence tool suggestion
  let userMessage;
  
  if (testType === 'search') {
    userMessage = 'I want to search for posts about community safety';
  } else {
    userMessage = 'I want to see my feed';
  }
  
  const chatCompletionMessage = {
    type: 'chat_completion',
    id: uuidv4(),
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: userMessage }
    ],
    stream: false,
    temperature: 0.7
  };
  
  console.log(`Sending chat completion request with message: "${userMessage}"`);
  console.log('This should trigger auto-execution of a high-confidence tool');
  
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
