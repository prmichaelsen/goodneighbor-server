/**
 * Test WebSocket Natural Language Search with Improved Parsing
 * 
 * This script tests the improved natural language search functionality of the WebSocket server.
 * It connects to the WebSocket server, authenticates, and sends various natural language search queries
 * to test the improved parsing.
 * 
 * Usage:
 *   node test-websocket-nl-search-improved.js [query]
 *   node test-websocket-nl-search-improved.js --test-all
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

// Test queries to try
const TEST_QUERIES = [
  'cat posts',
  'posts about cats',
  'recent posts about safety',
  'comments by John',
  'events in Phoenix',
  'safety tips',
  'users named Sarah'
];

// Get the query from command line arguments or use the test queries
const testAll = process.argv.includes('--test-all');
const query = testAll ? null : (process.argv[2] || TEST_QUERIES[0]);

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

let currentQueryIndex = 0;
let isAuthenticated = false;

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log(`Received message: ${message.type}`);
  
  // Handle different message types
  switch (message.type) {
    case 'auth_result':
      if (message.success) {
        console.log('Authentication successful');
        isAuthenticated = true;
        
        if (testAll) {
          // Start testing all queries
          sendNextQuery();
        } else {
          // Send the single query
          sendNaturalLanguageSearch(query);
        }
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
        console.log('\n=== Search Parameters ===');
        console.log(JSON.stringify(message.searchParams, null, 2));
        
        // Print search results
        const results = message.searchResults;
        if (results && results.data && results.data.data) {
          const hits = results.data.data.hits || [];
          console.log(`\n=== Found ${hits.length} results ===`);
          
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
        
        if (testAll) {
          // Move to the next query
          currentQueryIndex++;
          if (currentQueryIndex < TEST_QUERIES.length) {
            setTimeout(() => {
              sendNextQuery();
            }, 1000); // Wait 1 second between queries
          } else {
            console.log('\nAll test queries completed!');
            ws.close();
          }
        } else {
          // Close the connection
          ws.close();
        }
      } else {
        console.error(`Search failed: ${message.error}`);
        
        if (testAll) {
          // Move to the next query even if this one failed
          currentQueryIndex++;
          if (currentQueryIndex < TEST_QUERIES.length) {
            setTimeout(() => {
              sendNextQuery();
            }, 1000); // Wait 1 second between queries
          } else {
            console.log('\nAll test queries completed!');
            ws.close();
          }
        } else {
          // Close the connection
          ws.close();
        }
      }
      break;
    
    case 'error':
      console.error(`Error: ${message.error}`);
      
      if (testAll) {
        // Move to the next query even if this one failed
        currentQueryIndex++;
        if (currentQueryIndex < TEST_QUERIES.length) {
          setTimeout(() => {
            sendNextQuery();
          }, 1000); // Wait 1 second between queries
        } else {
          console.log('\nAll test queries completed!');
          ws.close();
        }
      } else {
        // Close the connection
        ws.close();
      }
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

// Send the next query in the test list
function sendNextQuery() {
  if (currentQueryIndex < TEST_QUERIES.length) {
    const query = TEST_QUERIES[currentQueryIndex];
    console.log(`\n=== Testing query ${currentQueryIndex + 1}/${TEST_QUERIES.length}: "${query}" ===\n`);
    sendNaturalLanguageSearch(query);
  }
}

// Send a natural language search query
function sendNaturalLanguageSearch(query) {
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
