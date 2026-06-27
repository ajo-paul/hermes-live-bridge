#!/bin/bash
export GEMINI_API_KEY="dummy_key"
export HERMES_TOKEN="dummy_token"
export AGENT_URL="http://localhost:8080"

# Start server
python3 /app/hermes-live-bridge/bridge_server/main.py > server.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
echo "Waiting for server to start..."
for i in {1..10}; do
    if curl -s http://localhost:8000/health > /dev/null; then
        echo "Server is up!"
        break
    fi
    sleep 1
    if [ $i -eq 10 ]; then
        echo "Server failed to start. Log:"
        cat server.log
        kill $SERVER_PID
        exit 1
    fi
done

# Run tests
python3 /app/hermes-live-bridge/tests/integration_test.py
TEST_EXIT=$?

# Cleanup
kill $SERVER_PID
exit $TEST_EXIT
