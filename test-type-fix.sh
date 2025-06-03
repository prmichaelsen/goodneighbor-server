#!/bin/bash

# Test script for the WebSocket type fix
# This script starts the server in development mode and runs the test client

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting the GoodNeighbor WebSocket server in development mode...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop the server when testing is complete.${NC}"
echo ""

# Start the server in the background
npm run dev &
SERVER_PID=$!

# Wait for the server to start
echo -e "${YELLOW}Waiting for the server to start...${NC}"
sleep 5

# Run the test client
echo -e "${YELLOW}Running the WebSocket type check test client...${NC}"
echo -e "${YELLOW}This will test if the 'type' property is correctly included in messages.${NC}"
echo ""

node test-websocket-type-check-local.js

# Wait for the test to complete
echo ""
echo -e "${YELLOW}Test completed. Stopping the server...${NC}"

# Kill the server process
kill $SERVER_PID

echo -e "${GREEN}Done!${NC}"
