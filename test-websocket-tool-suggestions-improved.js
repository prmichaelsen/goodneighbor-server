/**
 * Test WebSocket Tool Suggestions with No Tool Intent Detection
 * 
 * This script tests the improved tool suggestion functionality that takes into account
 * whether the user is trying to use a tool or not.
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// Configuration
const WS_URL = 'ws://localhost:4000/ws';
const API_KEY = 'feb4a497786cbcfb0627bd71f3c1299c';

// Create WebSocket connection
const ws = new WebSocket(WS_URL);

// Handle connection open
ws.on('open', () => {
  console.log('Connected to WebSocket server');
  
  // Send authentication message
  console.log('Sending authentication message...');
  ws.send(JSON.stringify({
    type: 'auth',
    id: uuidv4(),
    auth: {
      apiKey: API_KEY
    }
  }));
});

// Handle messages from server
ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log(`Received message type: ${message.type}`);
  
  // Handle authentication result
  if (message.type === 'auth_result' && message.success) {
    console.log('Authentication successful, sending test messages...');
    
    // Send a message with likely tool intent
    console.log('Sending chat completion with likely tool intent...');
    ws.send(JSON.stringify({
      type: 'chat_completion',
      id: uuidv4(),
      model: 'default',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Can you search for posts about community building?' }
      ],
      stream: false
    }));
    
    // Wait 5 seconds before sending the next message
    setTimeout(() => {
      // Send a message with no tool intent
      console.log('Sending chat completion with no tool intent...');
      ws.send(JSON.stringify({
        type: 'chat_completion',
        id: uuidv4(),
        model: 'default',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France?' }
        ],
        stream: false
      }));
    }, 5000);
  }
  
  // Handle tool suggestions
  if (message.type === 'tool_suggestions') {
    console.log('\n=== TOOL SUGGESTIONS ===');
    console.log(`Original query: "${message.originalQuery}"`);
    console.log(`No tool intent score: ${message.no_tool_intent}`);
    console.log('Suggestions:');
    message.suggestions.forEach((suggestion, index) => {
      console.log(`  ${index + 1}. ${suggestion.tool} (confidence: ${suggestion.confidence})`);
      console.log(`     Description: ${suggestion.description}`);
      console.log(`     Suggested args: ${JSON.stringify(suggestion.suggestedArgs)}`);
    });
    console.log('=======================\n');
  }
  
  // Handle chat completion result
  if (message.type === 'chat_completion_result') {
    console.log('\n=== CHAT COMPLETION RESULT ===');
    console.log(`Content: "${message.result.choices[0].message.content}"`);
    console.log('==============================\n');
    
    // Close the connection after receiving the chat completion result
    setTimeout(() => {
      console.log('Disconnecting from WebSocket server');
      ws.close();
    }, 1000);
  }
});

// Handle errors
ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Handle connection close
ws.on('close', () => {
  console.log('Disconnected from WebSocket server');
});
