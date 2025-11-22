#!/bin/bash
# Test Express REST API Server

echo "🚀 Testing Express REST API Server"
echo ""

# Start the server in background using Node directly
echo "📡 Starting REST API server on port 3001..."
node -e "
const { RestApiServer } = require('./dist/visualization/api/RestEndpoints');
const { EventStore } = require('./dist/persistence/event-store');
const { ReasoningStore } = require('./dist/persistence/reasoning-store');

const eventStore = new EventStore();
const reasoningStore = new ReasoningStore();
const server = new RestApiServer(eventStore, reasoningStore, { port: 3001 });

server.start().then(() => {
  console.log('✅ Server started on port 3001');
  console.log('🔍 Server is ready for testing');
}).catch(err => {
  console.error('❌ Failed to start server:', err.message);
  process.exit(1);
});

// Keep server running
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down server...');
  await server.stop();
  process.exit(0);
});
" &

SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server to start
sleep 3

echo ""
echo "🧪 Testing endpoints:"
echo ""

# Test 1: GET /api/visualization/events
echo "1️⃣  Testing GET /api/visualization/events"
curl -s -w "\nHTTP Status: %{http_code}\n" http://localhost:3001/api/visualization/events | head -20
echo ""

# Test 2: GET /api/visualization/metrics
echo "2️⃣  Testing GET /api/visualization/metrics"
curl -s -w "\nHTTP Status: %{http_code}\n" http://localhost:3001/api/visualization/metrics | head -20
echo ""

# Test 3: Check CORS headers
echo "3️⃣  Testing CORS headers"
curl -s -i http://localhost:3001/api/visualization/events | grep -i "access-control"
echo ""

# Test 4: Check port binding
echo "4️⃣  Checking port binding"
netstat -an 2>/dev/null | grep 3001 || ss -an 2>/dev/null | grep 3001 || lsof -i :3001 2>/dev/null
echo ""

# Test 5: Test 404 handling
echo "5️⃣  Testing 404 handling"
curl -s -w "\nHTTP Status: %{http_code}\n" http://localhost:3001/api/notfound
echo ""

# Cleanup
echo "🛑 Stopping server..."
kill $SERVER_PID 2>/dev/null || true
sleep 1

echo ""
echo "✨ Tests completed!"
