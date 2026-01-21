#!/bin/bash
# OTEL Stack Verification Script
# Agentic QE Fleet - Issue #71

set -e

echo "========================================="
echo "OTEL Stack Verification"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is running
echo "Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker is not running${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"
echo ""

# Check if services are running
echo "Checking OTEL stack services..."

services=("agentic-qe-otel-collector" "agentic-qe-prometheus" "agentic-qe-jaeger" "agentic-qe-grafana")
all_running=true

for service in "${services[@]}"; do
    if docker ps --filter "name=$service" --filter "status=running" | grep -q "$service"; then
        echo -e "${GREEN}✓ $service is running${NC}"
    else
        echo -e "${RED}✗ $service is not running${NC}"
        all_running=false
    fi
done
echo ""

if [ "$all_running" = false ]; then
    echo -e "${YELLOW}Some services are not running. Start them with:${NC}"
    echo "  docker-compose -f config/docker-compose.otel.yml up -d"
    echo ""
fi

# Check service health endpoints
echo "Checking service health endpoints..."

# OTEL Collector
if curl -s -f http://localhost:13133/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ OTEL Collector health check OK${NC}"
else
    echo -e "${RED}✗ OTEL Collector health check failed${NC}"
fi

# Prometheus
if curl -s -f http://localhost:9090/-/healthy > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Prometheus health check OK${NC}"
else
    echo -e "${RED}✗ Prometheus health check failed${NC}"
fi

# Jaeger
if curl -s -f http://localhost:14269/ > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Jaeger health check OK${NC}"
else
    echo -e "${RED}✗ Jaeger health check failed${NC}"
fi

# Grafana
if curl -s -f http://localhost:3001/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Grafana health check OK${NC}"
else
    echo -e "${RED}✗ Grafana health check failed${NC}"
fi
echo ""

# Check OTLP endpoints
echo "Checking OTLP endpoints..."

# OTLP HTTP
if curl -s -o /dev/null -w "%{http_code}" http://localhost:4318/ 2>&1 | grep -q "200\|404\|405"; then
    echo -e "${GREEN}✓ OTLP HTTP endpoint (4318) is accessible${NC}"
else
    echo -e "${RED}✗ OTLP HTTP endpoint (4318) is not accessible${NC}"
fi

# OTLP gRPC (just check if port is open)
if nc -z localhost 4317 2>/dev/null; then
    echo -e "${GREEN}✓ OTLP gRPC endpoint (4317) is accessible${NC}"
else
    echo -e "${RED}✗ OTLP gRPC endpoint (4317) is not accessible${NC}"
fi
echo ""

# Check Prometheus targets
echo "Checking Prometheus scrape targets..."
targets_response=$(curl -s http://localhost:9090/api/v1/targets 2>/dev/null || echo "")
if echo "$targets_response" | grep -q "otel-collector"; then
    echo -e "${GREEN}✓ Prometheus is scraping OTEL Collector${NC}"
else
    echo -e "${YELLOW}⚠ Prometheus may not be scraping OTEL Collector yet${NC}"
fi
echo ""

# Display service URLs
echo "========================================="
echo "Service URLs:"
echo "========================================="
echo -e "${GREEN}Grafana:${NC}          http://localhost:3001 (admin/admin)"
echo -e "${GREEN}Prometheus:${NC}       http://localhost:9090"
echo -e "${GREEN}Jaeger:${NC}           http://localhost:16686"
echo -e "${GREEN}OTEL Collector:${NC}   http://localhost:13133/health"
echo ""
echo -e "${GREEN}OTLP Endpoints:${NC}"
echo "  gRPC:           localhost:4317"
echo "  HTTP:           localhost:4318"
echo ""

# Display quick start commands
echo "========================================="
echo "Quick Commands:"
echo "========================================="
echo "Start stack:     docker-compose -f config/docker-compose.otel.yml up -d"
echo "Stop stack:      docker-compose -f config/docker-compose.otel.yml down"
echo "View logs:       docker-compose -f config/docker-compose.otel.yml logs -f"
echo "Check status:    docker-compose -f config/docker-compose.otel.yml ps"
echo ""
