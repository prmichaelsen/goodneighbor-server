#!/bin/bash

# Script to test the health endpoint of the GoodNeighbor WebSocket Server

# Set colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default URL
DEFAULT_URL="https://goodneighbor-server-868795766038.us-central1.run.app/health"
URL=${1:-$DEFAULT_URL}

echo -e "${YELLOW}Testing health endpoint at: ${URL}${NC}"

# Make the request and save the response
echo -e "${GREEN}Sending request...${NC}"
RESPONSE=$(curl -s $URL)

# Check if the request was successful
if [ $? -ne 0 ]; then
  echo -e "${RED}Error: Failed to connect to the server${NC}"
  exit 1
fi

# Print the response
echo -e "${GREEN}Response received:${NC}"
echo $RESPONSE | jq . || echo $RESPONSE

# Check if the response contains an error
if echo $RESPONSE | grep -q "error"; then
  echo -e "${RED}Health check failed!${NC}"
  
  # Extract and display the error message if possible
  ERROR=$(echo $RESPONSE | jq -r '.error' 2>/dev/null)
  if [ $? -eq 0 ] && [ "$ERROR" != "null" ]; then
    echo -e "${RED}Error message: $ERROR${NC}"
  fi
  
  # Check DeepSeek service status
  DEEPSEEK_STATUS=$(echo $RESPONSE | jq -r '.services.deepseek.status' 2>/dev/null)
  if [ $? -eq 0 ] && [ "$DEEPSEEK_STATUS" != "null" ]; then
    echo -e "${YELLOW}DeepSeek service status: $DEEPSEEK_STATUS${NC}"
    
    # If DeepSeek has an error, show more details
    if [ "$DEEPSEEK_STATUS" = "error" ] || [ "$DEEPSEEK_STATUS" = "unhealthy" ]; then
      echo -e "${YELLOW}DeepSeek error details:${NC}"
      echo $RESPONSE | jq '.services.deepseek' 2>/dev/null || echo "No detailed error information available"
    fi
  fi
else
  echo -e "${GREEN}Health check passed!${NC}"
fi

echo -e "${GREEN}Test completed.${NC}"
