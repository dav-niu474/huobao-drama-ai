#!/bin/bash
cd /home/z/my-project/huobao-drama-ai

# Start server in background
npx next dev -p 3099 > /tmp/dev.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
echo "Waiting for server..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3099/api/health > /dev/null 2>&1; then
    echo "Server ready after ${i}s"
    break
  fi
  sleep 1
done

# Run test
echo "Running test..."
node scripts/test-output.js 2>&1

# Kill server
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
echo "Server stopped"
