const WebSocket = require('ws');

// Create a WebSocket connection
const ws = new WebSocket('wss://goodneighbor-server-868795766038.us-central1.run.app/ws');

// Connection opened
ws.on('open', function() {
  console.log('Connected to WebSocket server');
  
  // Send an authentication message
  const apiKey = 'feb4a497786cbcfb0627bd71f3c1299c';
  console.log('Using API key:', apiKey);
  
  const authMessage = {
    type: 'auth',
    id: 'test-' + Date.now(),
    auth: {
      apiKey: apiKey
    }
  };
  
  console.log('Sending auth message:', JSON.stringify(authMessage));
  ws.send(JSON.stringify(authMessage));
});

// Listen for messages
ws.on('message', function(data) {
  console.log('Received message:', data.toString());
  
  try {
    const message = JSON.parse(data.toString());
    
    if (message.type === 'auth_result' && !message.success) {
      console.error('Authentication failed:', message.error);
      
      // Try with a different format
      console.log('Trying with a different format...');
      
      const authMessage2 = {
        type: 'auth',
        id: 'test2-' + Date.now(),
        auth: {
          apiKey: 'feb4a497786cbcfb0627bd71f3c1299c',
          key: 'feb4a497786cbcfb0627bd71f3c1299c'
        }
      };
      
      console.log('Sending auth message 2:', JSON.stringify(authMessage2));
      ws.send(JSON.stringify(authMessage2));
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

// Close the connection after 10 seconds
setTimeout(() => {
  console.log('Closing connection...');
  ws.close();
}, 10000);
