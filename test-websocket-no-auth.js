const WebSocket = require('ws');

// Create a WebSocket connection
const ws = new WebSocket('wss://goodneighbor-server-868795766038.us-central1.run.app/ws');

// Connection opened
ws.on('open', function() {
  console.log('Connected to WebSocket server');
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

// Close the connection after 5 seconds
setTimeout(() => {
  console.log('Closing connection...');
  ws.close();
}, 5000);
