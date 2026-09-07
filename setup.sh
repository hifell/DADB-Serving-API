#!/bin/bash

# Setup script for BADB Serving API Load Testing
# Prerequisites: Node.js, K6, Nginx

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== BADB Serving API - Load Testing Setup ==="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}✗${NC} $1 not found"
    return 1
  fi
  echo -e "${GREEN}✓${NC} $1 found"
  return 0
}

echo "Checking prerequisites..."
check_command node
check_command npm
check_command nginx

# Check K6 (optional)
if command -v k6 &> /dev/null; then
  echo -e "${GREEN}✓${NC} k6 found"
else
  echo -e "${YELLOW}!${NC} k6 not found. Install: https://k6.io/docs/getting-started/installation/"
fi

echo ""
echo "=== File Structure ==="
ls -lh "$SCRIPT_DIR/test-files/"

echo ""
echo "=== Available Commands ==="
echo ""
echo "1. Start Single Node (port 3001):"
echo "   PORT=3001 node $SCRIPT_DIR/server.js"
echo ""
echo "2. Start Multi-Node Cluster:"
echo "   PORT=3001 node $SCRIPT_DIR/server.js &"
echo "   PORT=3002 node $SCRIPT_DIR/server.js &"
echo "   PORT=3003 node $SCRIPT_DIR/server.js &"
echo ""
echo "3. Start Nginx Load Balancer:"
echo "   nginx -c $SCRIPT_DIR/nginx.conf"
echo ""
echo "4. Run Little's Law Test (single node):"
echo "   k6 run k6_littles_law.js -e TARGET_URL=http://localhost:3001"
echo ""
echo "5. Run Amdahl's Law Test (with LB):"
echo "   k6 run k6_amdahl.js -e TEST_TYPE=single -e SINGLE_NODE_URL=http://localhost:3001"
echo "   k6 run k6_amdahl.js -e TEST_TYPE=lb -e LB_URL=http://localhost:8080"
echo ""
echo "=== Quick Start ==="
echo ""
echo "# Terminal 1: Start single node"
echo "$ PORT=3001 node $SCRIPT_DIR/server.js"
echo ""
echo "# Terminal 2: Run test"
echo "$ k6 run $SCRIPT_DIR/k6_littles_law.js -e TARGET_URL=http://localhost:3001"
echo ""
