/**
 * Test WebSocket client for chat completion with tool suggestions
 * 
 * This script connects to the WebSocket server, authenticates, and sends a chat completion request
 * that should trigger tool suggestions. It then selects a suggested tool and handles the result.
 * 
 * Usage:
 * node test-websocket-tool-suggestions.js
 */

const WebSocket = require('ws');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
dotenv.config();

// Configuration
const WS_URL = `ws://localhost:${process.env.PORT || 3000}${process.env.WS_PATH || '/ws'}`;
const API_KEY = process.env.CLIENT_AUTH_API_KEY;

// Create WebSocket connection
const ws = new WebSocket(WS_URL);

// Message queue for sending messages after authentication
const messageQueue = [];

// Track if we're authenticated
let isAuthenticated = false;

// Store the original message ID for correlation
let originalMessageId = '';

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
        handleToolSuggestions(message);
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
    
    // Send chat completion request that should trigger tool suggestions
    sendChatCompletionRequest();
  } else {
    console.error('Authentication failed:', message.error);
    ws.close();
  }
}

// Handle tool suggestions
function handleToolSuggestions(message) {
  console.log('\nReceived Tool Suggestions:');
  console.log('------------------------');
  
  const { suggestions, originalQuery, id } = message;
  
  // Store the original message ID for correlation
  originalMessageId = id;
  
  console.log(`Original query: "${originalQuery}"`);
  console.log(`Number of suggestions: ${suggestions.length}`);
  
  // Display each suggestion
  suggestions.forEach((suggestion, index) => {
    console.log(`\nSuggestion ${index + 1}:`);
    console.log(`Tool: ${suggestion.tool}`);
    console.log(`Description: ${suggestion.description || 'No description provided'}`);
    console.log(`Confidence: ${suggestion.confidence}`);
    console.log('Suggested arguments:', suggestion.suggestedArgs);
  });
  
  // Select the first suggested tool
  if (suggestions.length > 0) {
    const selectedTool = suggestions[0];
    console.log(`\nSelecting tool: ${selectedTool.tool}`);
    
    // Send tool selection message
    sendToolSelectionMessage(selectedTool.tool, selectedTool.suggestedArgs);
  } else {
    console.log('No tool suggestions received');
    ws.close();
  }
}

// Handle tool result
function handleToolResult(message) {
  console.log('\nTool Result:');
  console.log('------------------------');
  console.log(`Tool: ${message.tool}`);
  console.log('Data:', message.data);
  
  // Close the connection after receiving the result
  ws.close();
}

// Handle chat completion result (if no tool suggestions were provided)
function handleChatCompletionResult(message) {
  console.log('\nChat Completion Result (no tool suggestions):');
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
  // Create a message that should trigger tool suggestions
  // For example, asking about searching posts
  const chatCompletionMessage = {
    type: 'chat_completion',
    id: uuidv4(),
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'I want to search for posts about community building.' }
    ],
    stream: false,
    temperature: 0.7
  };
  
  console.log('Sending chat completion request that should trigger tool suggestions...');
  
  if (isAuthenticated) {
    ws.send(JSON.stringify(chatCompletionMessage));
  } else {
    messageQueue.push(chatCompletionMessage);
  }
}

// Send tool selection message
function sendToolSelectionMessage(toolName, args) {
  const toolSelectionMessage = {
    type: 'tool_selection',
    id: uuidv4(),
    toolName,
    arguments: args,
    originalMessageId
  };
  
  console.log('Sending tool selection message:', toolSelectionMessage);
  ws.send(JSON.stringify(toolSelectionMessage));
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
