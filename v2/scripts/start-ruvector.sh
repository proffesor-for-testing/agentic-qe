#!/bin/bash
# RuVector Docker Startup Script
# Phase 0.5: GNN Self-Learning Integration
#
# Usage:
#   ./scripts/start-ruvector.sh [--dev|--prod] [--wait]
#
# Options:
#   --dev   Start in development mode (default)
#   --prod  Start in production mode
#   --wait  Wait for health check to pass before exiting

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_FILE="$PROJECT_ROOT/docker/docker-compose.ruvector.yml"

# Default settings
MODE="development"
WAIT_FOR_HEALTH=false
HEALTH_TIMEOUT=60

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dev)
            MODE="development"
            shift
            ;;
        --prod)
            MODE="production"
            shift
            ;;
        --wait)
            WAIT_FOR_HEALTH=true
            shift
            ;;
        --help|-h)
            echo "RuVector Docker Startup Script"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dev   Start in development mode (default)"
            echo "  --prod  Start in production mode"
            echo "  --wait  Wait for health check to pass"
            echo "  -h, --help  Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     RuVector Docker Startup - Phase 0.5 GNN Learning      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed or not in PATH${NC}"
    exit 1
fi

# Check docker compose is available
if ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not available${NC}"
    exit 1
fi

# Check if docker-compose file exists
if [ ! -f "$DOCKER_FILE" ]; then
    echo -e "${RED}Error: Docker Compose file not found: $DOCKER_FILE${NC}"
    exit 1
fi

# Create data directories
echo -e "${YELLOW}Creating data directories...${NC}"
mkdir -p "$PROJECT_ROOT/data/ruvector"
mkdir -p "$PROJECT_ROOT/data/ruvector-models"

# Set environment variables
export RUVECTOR_DATA_PATH="$PROJECT_ROOT/data/ruvector"
export RUVECTOR_MODELS_PATH="$PROJECT_ROOT/data/ruvector-models"

# Stop any existing containers
echo -e "${YELLOW}Stopping existing RuVector containers...${NC}"
docker compose -f "$DOCKER_FILE" --profile development down 2>/dev/null || true
docker compose -f "$DOCKER_FILE" --profile production down 2>/dev/null || true

# Start the appropriate profile
echo -e "${GREEN}Starting RuVector in ${MODE} mode...${NC}"
if [ "$MODE" == "development" ]; then
    docker compose -f "$DOCKER_FILE" --profile development up -d
    CONTAINER_NAME="agentic-qe-ruvector-dev"
else
    docker compose -f "$DOCKER_FILE" --profile production up -d
    CONTAINER_NAME="agentic-qe-ruvector"
fi

echo ""
echo -e "${GREEN}RuVector container started!${NC}"
echo ""

# Show container status
echo -e "${BLUE}Container Status:${NC}"
docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

# Wait for health check if requested
if [ "$WAIT_FOR_HEALTH" = true ]; then
    echo -e "${YELLOW}Waiting for RuVector to be healthy (timeout: ${HEALTH_TIMEOUT}s)...${NC}"

    HEALTH_URL="http://localhost:8080/health"
    START_TIME=$(date +%s)

    while true; do
        CURRENT_TIME=$(date +%s)
        ELAPSED=$((CURRENT_TIME - START_TIME))

        if [ $ELAPSED -ge $HEALTH_TIMEOUT ]; then
            echo -e "${RED}Health check timeout after ${HEALTH_TIMEOUT}s${NC}"
            echo -e "${YELLOW}Container logs:${NC}"
            docker logs --tail 20 "$CONTAINER_NAME"
            exit 1
        fi

        # Try health check
        if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
            echo -e "${GREEN}RuVector is healthy!${NC}"
            break
        fi

        echo -n "."
        sleep 2
    done
    echo ""
fi

# Display configuration info
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    RuVector Configuration                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}Mode:${NC}           $MODE"
echo -e "  ${GREEN}REST API:${NC}       http://localhost:8080"
echo -e "  ${GREEN}gRPC:${NC}           localhost:9090"
echo -e "  ${GREEN}Health Check:${NC}   http://localhost:8080/health"
if [ "$MODE" == "development" ]; then
    echo -e "  ${GREEN}Profiling:${NC}      http://localhost:6060"
fi
echo ""
echo -e "${BLUE}GNN Self-Learning Features:${NC}"
echo -e "  • GNN-enhanced vector search with multi-head attention"
echo -e "  • LoRA (Low-Rank Adaptation) for efficient fine-tuning"
echo -e "  • EWC++ (Elastic Weight Consolidation) for anti-forgetting"
echo -e "  • HNSW index for O(log n) similarity search"
echo ""
echo -e "${BLUE}Quick Test Commands:${NC}"
echo -e "  ${YELLOW}# Health check:${NC}"
echo -e "  curl http://localhost:8080/health | jq"
echo ""
echo -e "  ${YELLOW}# View logs:${NC}"
echo -e "  docker logs -f $CONTAINER_NAME"
echo ""
echo -e "  ${YELLOW}# Stop RuVector:${NC}"
echo -e "  docker compose -f $DOCKER_FILE --profile $MODE down"
echo ""
echo -e "${GREEN}RuVector is ready for Phase 0.5 GNN self-learning!${NC}"
