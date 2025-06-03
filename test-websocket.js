const WebSocket = require('ws');

// Create a WebSocket connection
const ws = new WebSocket('wss://goodneighbor-server-868795766038.us-central1.run.app/ws');

// Connection opened
ws.on('open', function() {
  console.log('Connected to WebSocket server');
  
  // Send an authentication message
  const authMessage = {
    type: 'auth',
    id: 'test-' + Date.now(),
    auth: {
      apiKey: 'feb4a497786cbcfb0627bd71f3c1299c'
    }
  };
  
  console.log('Sending auth message:', JSON.stringify(authMessage));
  ws.send(JSON.stringify(authMessage));
  
  // Send a ping message after 2 seconds
  setTimeout(() => {
    const pingMessage = {
      type: 'ping',
      id: 'ping-' + Date.now()
    };
    
    console.log('Sending ping message:', JSON.stringify(pingMessage));
    ws.send(JSON.stringify(pingMessage));
  }, 2000);
});

// Listen for messages
ws.on('message', function(data) {
  console.log('Received message:', data.toString());
});

// Listen for errors
ws.on('error', function(error) {
  console.error('WebSocket error:', error);
});

// Connection closed
ws.on('close', function(code, reason) {
  console.log('Connection closed:', code, reason);
});

// Close the connection after 10 seconds
setTimeout(() => {
  console.log('Closing connection...');
  ws.close();
}, 10000);
