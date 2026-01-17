#!/bin/bash

# RuVector Docker Management Script
# Easily start, stop, and manage RuVector containers for Agentic QE Fleet

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker/docker-compose.ruvector.yml"
PROJECT_NAME="agentic-qe"
DEFAULT_PROFILE="production"

# Helper functions
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo ""
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Check if docker-compose file exists
check_compose_file() {
    if [ ! -f "$COMPOSE_FILE" ]; then
        print_error "Docker Compose file not found: $COMPOSE_FILE"
        print_info "Please ensure you're running this script from the project root."
        exit 1
    fi
}

# Create required directories
create_directories() {
    local data_dir="${RUVECTOR_DATA_PATH:-./data/ruvector}"
    local models_dir="${RUVECTOR_MODELS_PATH:-./data/ruvector-models}"

    print_info "Creating data directories..."
    mkdir -p "$data_dir" "$models_dir"
    print_success "Data directories created"
}

# Start RuVector
start_ruvector() {
    local profile="${1:-$DEFAULT_PROFILE}"

    print_header "Starting RuVector ($profile)"

    check_docker
    check_compose_file
    create_directories

    print_info "Starting RuVector container with profile: $profile"

    if [ "$profile" = "development" ]; then
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" --profile development up -d ruvector-dev
    else
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" --profile production up -d ruvector
    fi

    print_success "RuVector started successfully"
    print_info "REST API: http://localhost:8080"
    print_info "gRPC: localhost:9090"

    if [ "$profile" = "development" ]; then
        print_info "Profiling: http://localhost:6060/debug/pprof"
    fi

    echo ""
    print_info "Checking container health..."
    sleep 5

    if docker ps | grep -q "agentic-qe-ruvector"; then
        print_success "Container is running"
        show_logs "10"
    else
        print_error "Container failed to start. Check logs with: $0 logs"
        exit 1
    fi
}

# Stop RuVector
stop_ruvector() {
    print_header "Stopping RuVector"

    check_docker
    check_compose_file

    print_info "Stopping RuVector container..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down

    print_success "RuVector stopped"
}

# Restart RuVector
restart_ruvector() {
    local profile="${1:-$DEFAULT_PROFILE}"

    print_header "Restarting RuVector"

    stop_ruvector
    sleep 2
    start_ruvector "$profile"
}

# Show logs
show_logs() {
    local lines="${1:-50}"

    check_docker

    if docker ps -a | grep -q "agentic-qe-ruvector"; then
        print_info "Showing last $lines lines of logs..."
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs --tail="$lines" -f
    else
        print_error "RuVector container not found"
        exit 1
    fi
}

# Show status
show_status() {
    print_header "RuVector Status"

    check_docker

    if docker ps | grep -q "agentic-qe-ruvector"; then
        print_success "RuVector is running"

        echo ""
        print_info "Container details:"
        docker ps | grep "agentic-qe-ruvector"

        echo ""
        print_info "Health check:"
        curl -s http://localhost:8080/health | jq '.' 2>/dev/null || echo "Health check endpoint not responding"

        echo ""
        print_info "Resource usage:"
        docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" | grep "agentic-qe-ruvector"
    else
        print_warning "RuVector is not running"
    fi
}

# Execute health check
health_check() {
    print_header "Health Check"

    print_info "Checking REST API health..."
    if curl -f -s http://localhost:8080/health > /dev/null 2>&1; then
        print_success "REST API is healthy"
        curl -s http://localhost:8080/health | jq '.'
    else
        print_error "REST API health check failed"
        exit 1
    fi

    echo ""
    print_info "Checking gRPC endpoint..."
    if nc -z localhost 9090 2>/dev/null; then
        print_success "gRPC endpoint is accessible"
    else
        print_error "gRPC endpoint is not accessible"
        exit 1
    fi
}

# Clean up volumes
clean_volumes() {
    print_header "Clean Volumes"

    print_warning "This will remove all RuVector data and models!"
    read -p "Are you sure? (yes/no): " confirm

    if [ "$confirm" = "yes" ]; then
        print_info "Stopping containers..."
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down -v

        print_info "Removing local data directories..."
        rm -rf ./data/ruvector ./data/ruvector-models

        print_success "Volumes cleaned"
    else
        print_info "Operation cancelled"
    fi
}

# Show usage
show_usage() {
    cat << EOF
RuVector Docker Management Script

Usage: $0 <command> [options]

Commands:
  start [profile]     Start RuVector (default: production)
                      Profiles: production, development

  stop                Stop RuVector

  restart [profile]   Restart RuVector with specified profile

  logs [lines]        Show logs (default: 50 lines)
                      Use 'follow' to stream logs

  status              Show container status and health

  health              Run health checks

  clean               Remove all volumes and data (destructive!)

  help                Show this help message

Examples:
  $0 start                    # Start in production mode
  $0 start development        # Start in development mode
  $0 logs 100                 # Show last 100 lines
  $0 logs follow              # Stream logs
  $0 restart production       # Restart in production mode

Environment Variables:
  RUVECTOR_DATA_PATH          Path for data volume (default: ./data/ruvector)
  RUVECTOR_MODELS_PATH        Path for models volume (default: ./data/ruvector-models)

EOF
}

# Main script
main() {
    local command="${1:-help}"

    case "$command" in
        start)
            start_ruvector "${2:-production}"
            ;;
        stop)
            stop_ruvector
            ;;
        restart)
            restart_ruvector "${2:-production}"
            ;;
        logs)
            if [ "$2" = "follow" ]; then
                show_logs "50"
            else
                show_logs "${2:-50}"
            fi
            ;;
        status)
            show_status
            ;;
        health)
            health_check
            ;;
        clean)
            clean_volumes
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            print_error "Unknown command: $command"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
