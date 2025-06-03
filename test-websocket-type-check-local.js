const WebSocket = require('ws');

// Create a WebSocket connection to the local server
const ws = new WebSocket('ws://localhost:3000/ws');

// Connection opened
ws.on('open', function() {
  console.log('Connected to local WebSocket server');
  
  // Send an authentication message
  // Note: Use the API key from your local .env file
  const apiKey = process.env.CLIENT_AUTH_API_KEY || 'feb4a497786cbcfb0627bd71f3c1299c';
  console.log('Using API key:', apiKey);
  
  const authMessage = {
    type: 'auth',
    id: 'auth-' + Date.now(),
    auth: {
      apiKey: apiKey
    }
  };
  
  console.log('Sending auth message:', JSON.stringify(authMessage));
  ws.send(JSON.stringify(authMessage));
});

// Listen for messages
ws.on('message', function(data) {
  try {
    const message = JSON.parse(data.toString());
    
    // Check if the message has a type property
    if (message.type) {
      console.log(`✅ Received message with type: ${message.type}`);
    } else {
      console.error('❌ Received message WITHOUT type property:', data.toString());
    }
    
    // Log the full message
    console.log('Full message:', JSON.stringify(message, null, 2));
    
    if (message.type === 'auth_result' && message.success) {
      console.log('Authentication successful');
      
      // Send a tool call message
      const toolCallMessage = {
        type: 'tool_call',
        id: 'tool-' + Date.now(),
        tool: 'get_feeds',
        arguments: {
          type: 'user',
          limit: 5
        }
      };
      
      console.log('Sending tool call message:', JSON.stringify(toolCallMessage));
      ws.send(JSON.stringify(toolCallMessage));
    }
    
    if (message.type === 'tool_result') {
      console.log('Tool call successful');
      console.log('Tool result data:', JSON.stringify(message.data, null, 2));
      
      // Close the connection after receiving the tool result
      console.log('Closing connection...');
      ws.close();
    }
    
    if (message.type === 'error') {
      console.error('Error from server:', message.error);
      
      // Close the connection after receiving an error
      console.log('Closing connection...');
      ws.close();
    }
  } catch (err) {
    console.error('Error parsing message:', err);
  }
});

// Listen for errors
ws.on('error', function(error) {
  console.error('WebSocket error:', error);
});

// Connection closed
ws.on('close', function(code, reason) {
  console.log('Connection closed:', code, reason ? reason.toString() : '');
});

// Close the connection after 10 seconds (timeout)
setTimeout(() => {
  console.log('Timeout reached. Closing connection...');
  ws.close();
}, 10000);
