#!/bin/bash
# Hermes-Live Bridge Reproducible Setup & Test Script

set -e

echo "--- 🚀 Starting Setup and Verification ---"

# 1. Environment Check
echo "Checking environment variables..."
if [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ ERROR: GEMINI_API_KEY is not set."
    exit 1
fi

if [ -z "$HERMES_TOKEN" ]; then
    echo "❌ ERROR: HERMES_TOKEN is not set."
    exit 1
fi

# 2. Docker Setup
echo "Building and starting containers..."
cd /app/hermes-live-bridge
docker-compose up --build -d

# 3. Health Check
echo "Waiting for Bridge Server to be healthy..."
MAX_RETRIES=10
COUNT=0
until $(curl --output /dev/null --silent --head --fail http://localhost:8000/health); do
    printf '.'
    sleep 3
    COUNT=$((COUNT+1))
    if [ $COUNT -ge $MAX_RETRIES ]; then
        echo "❌ ERROR: Bridge Server failed to start in time."
        exit 1
    fi
done
echo "✅ Bridge Server is healthy!"

# 4. Integration Tests
echo "Running integration tests..."
bash /app/hermes-live-bridge/tests/run_tests.sh

if [ $? -eq 0 ]; then
    echo "✅ All integration tests passed!"
else
    echo "❌ Integration tests failed."
    exit 1
fi

echo "--- ✨ Setup and Verification Complete ---"
