/**
 * Test WebSocket Natural Language Search
 * 
 * This script tests the natural language search functionality of the WebSocket server.
 * It connects to the WebSocket server, authenticates, and sends a natural language search query.
 * 
 * Usage:
 *   node test-websocket-natural-language-search.js
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Configuration
const WS_URL = process.env.WS_URL || 'ws://localhost:4000/ws';
const API_KEY = process.env.CLIENT_AUTH_API_KEY || '';

if (!API_KEY) {
  console.error('CLIENT_AUTH_API_KEY environment variable is required');
  process.exit(1);
}

// Connect to WebSocket server
console.log(`Connecting to WebSocket server at ${WS_URL}...`);
const ws = new WebSocket(WS_URL);

// Handle WebSocket events
ws.on('open', () => {
  console.log('Connected to WebSocket server');
  
  // Authenticate
  sendMessage({
    type: 'auth',
    id: uuidv4(),
    auth: {
      apiKey: API_KEY
    }
  });
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log(`Received message: ${message.type}`);
  
  // Handle different message types
  switch (message.type) {
    case 'auth_result':
      if (message.success) {
        console.log('Authentication successful');
        
        // Send natural language search query
        sendNaturalLanguageSearch();
      } else {
        console.error(`Authentication failed: ${message.error}`);
        ws.close();
      }
      break;
    
    case 'status':
      console.log(`Status: ${message.status}`);
      break;
    
    case 'natural_language_search_result':
      if (message.success) {
        console.log('Natural language search successful');
        console.log('Search parameters:', JSON.stringify(message.searchParams, null, 2));
        
        // Print search results
        const results = message.searchResults;
        if (results && results.data && results.data.data) {
          const hits = results.data.data.hits || [];
          console.log(`Found ${hits.length} results`);
          
          hits.forEach((hit, index) => {
            console.log(`\nResult ${index + 1}:`);
            console.log(`  ID: ${hit.objectID}`);
            console.log(`  Type: ${hit.type}`);
            if (hit.title) console.log(`  Title: ${hit.title}`);
            if (hit.search) console.log(`  Content: ${hit.search.substring(0, 100)}...`);
          });
        } else {
          console.log('No results found or unexpected result format');
          console.log('Raw results:', JSON.stringify(results, null, 2));
        }
      } else {
        console.error(`Search failed: ${message.error}`);
      }
      
      // Close the connection
      ws.close();
      break;
    
    case 'error':
      console.error(`Error: ${message.error}`);
      break;
    
    default:
      console.log('Full message:', JSON.stringify(message, null, 2));
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('Connection closed');
});

// Send a message to the server
function sendMessage(message) {
  console.log(`Sending message: ${message.type}`);
  ws.send(JSON.stringify(message));
}

// Send a natural language search query
function sendNaturalLanguageSearch() {
  // Get the query from command line arguments or use a default query
  const query = process.argv[2] || 'Find recent posts about community safety in Phoenix';
  
  console.log(`Sending natural language search query: "${query}"`);
  
  sendMessage({
    type: 'natural_language_search',
    id: uuidv4(),
    query,
    options: {
      enhanceExisting: false
    }
  });
}
