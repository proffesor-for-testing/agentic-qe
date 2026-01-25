#!/bin/bash
# RuVector Setup Verification Script
# Checks Docker service availability and runs basic health check

set -e

RUVECTOR_URL="${RUVECTOR_URL:-http://localhost:8080}"
DOCKER_IMAGE="${RUVECTOR_DOCKER_IMAGE:-ruvector/server:latest}"

echo "🔍 RuVector Setup Verification"
echo "================================"
echo ""

# Check if Docker is running
echo "📦 Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    echo "   https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker daemon not running. Please start Docker."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Check if RuVector container is running
echo "🐳 Checking for RuVector container..."
CONTAINER_ID=$(docker ps -q -f ancestor=$DOCKER_IMAGE)

if [ -z "$CONTAINER_ID" ]; then
    echo "⚠️  RuVector container not found"
    echo ""
    echo "Starting RuVector Docker container..."
    docker run -d -p 8080:8080 $DOCKER_IMAGE

    echo "⏳ Waiting for service to start (15 seconds)..."
    sleep 15

    CONTAINER_ID=$(docker ps -q -f ancestor=$DOCKER_IMAGE)
    if [ -z "$CONTAINER_ID" ]; then
        echo "❌ Failed to start RuVector container"
        echo "   Check Docker logs: docker logs <container-id>"
        exit 1
    fi

    echo "✅ RuVector container started: $CONTAINER_ID"
else
    echo "✅ RuVector container running: $CONTAINER_ID"
fi

echo ""

# Check if port 8080 is accessible
echo "🌐 Checking port 8080..."
if ! lsof -i:8080 &> /dev/null && ! netstat -an | grep 8080 &> /dev/null; then
    echo "⚠️  Port 8080 not listening. Container may still be starting."
    echo "   Waiting 10 more seconds..."
    sleep 10
fi

# Health check
echo "🏥 Checking RuVector health endpoint..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" $RUVECTOR_URL/health || echo "failed")

if [[ "$HEALTH_RESPONSE" == *"200"* ]] || [[ "$HEALTH_RESPONSE" == *"healthy"* ]]; then
    echo "✅ RuVector service is healthy"
    echo ""
    echo "$HEALTH_RESPONSE" | grep -v '^[0-9]*$' | jq '.' 2>/dev/null || echo "$HEALTH_RESPONSE" | grep -v '^[0-9]*$'
else
    echo "❌ Health check failed"
    echo "   Response: $HEALTH_RESPONSE"
    echo "   URL: $RUVECTOR_URL/health"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check container logs: docker logs $CONTAINER_ID"
    echo "  2. Verify port mapping: docker ps"
    echo "  3. Try different port: docker run -d -p 9090:8080 $DOCKER_IMAGE"
    exit 1
fi

echo ""
echo "================================"
echo "✅ RuVector Setup Verified!"
echo ""
echo "You can now run the tests:"
echo "  npm run test:integration -- RuVector.SelfLearning"
echo ""
echo "Or use mock mode (no Docker):"
echo "  RUVECTOR_MOCK=true npm run test:integration -- RuVector.SelfLearning"
echo ""
echo "Container info:"
echo "  ID: $CONTAINER_ID"
echo "  URL: $RUVECTOR_URL"
echo "  Stop: docker stop $CONTAINER_ID"
echo "  Logs: docker logs $CONTAINER_ID"
