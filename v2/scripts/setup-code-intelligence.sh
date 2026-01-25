#!/bin/bash
# Complete setup script for Code Intelligence System

set -e

echo "🚀 Code Intelligence System Setup"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo "ℹ️  $1"
}

# Check Node.js version
print_info "Checking Node.js version..."
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -ge 18 ]; then
    print_success "Node.js $(node --version) is installed"
else
    print_error "Node.js 18+ required, found $(node --version)"
    exit 1
fi

# Check if npm packages are installed
print_info "Checking npm packages..."
if [ -d "node_modules/tree-sitter" ]; then
    print_success "Tree-sitter packages installed"
else
    print_error "Tree-sitter packages not found. Run: npm install"
    exit 1
fi

# Check Docker
print_info "Checking Docker..."
if command -v docker &> /dev/null; then
    print_success "Docker is installed"
else
    print_warning "Docker not found. RuVector database will not be available."
fi

# Setup RuVector database if Docker is available
if command -v docker &> /dev/null; then
    print_info "Setting up RuVector database..."

    # Check if container already exists
    if docker ps -a | grep -q "agentic-qe-ruvector-dev"; then
        if docker ps | grep -q "agentic-qe-ruvector-dev"; then
            print_success "RuVector container already running"
        else
            print_info "Starting existing RuVector container..."
            docker start agentic-qe-ruvector-dev
            sleep 3
            print_success "RuVector container started"
        fi
    else
        print_info "Creating RuVector container..."
        docker run -d \
            --name agentic-qe-ruvector-dev \
            -p 5432:5432 \
            -e POSTGRES_PASSWORD=ruvector \
            ruvnet/ruvector:latest
        sleep 5
        print_success "RuVector container created and started"
    fi

    # Verify database connection
    print_info "Verifying database connection..."
    if docker exec agentic-qe-ruvector-dev psql -U ruvector -d ruvector_db -c "SELECT 1;" &> /dev/null; then
        print_success "Database connection verified"
    else
        print_error "Database connection failed"
        exit 1
    fi
fi

# Check Ollama (optional)
print_info "Checking Ollama..."
if command -v ollama &> /dev/null; then
    print_success "Ollama is installed"

    # Check if Ollama service is running
    if curl -s http://localhost:11434/api/tags &> /dev/null; then
        print_success "Ollama service is running"

        # Check for nomic-embed-text model
        if ollama list | grep -q "nomic-embed-text"; then
            print_success "nomic-embed-text model is available"
        else
            print_warning "nomic-embed-text model not found"
            print_info "Installing nomic-embed-text model..."
            ollama pull nomic-embed-text
            print_success "nomic-embed-text model installed"
        fi
    else
        print_warning "Ollama service not running. Start with: ollama serve"
        print_info "You can use OpenAI embeddings instead of local Ollama"
    fi
else
    print_warning "Ollama not installed (optional)"
    print_info "Install from: https://ollama.ai"
    print_info "Or use OpenAI embeddings instead"
fi

# Verify directory structure
print_info "Verifying directory structure..."
DIRS=(
    "src/code-intelligence/config"
    "src/code-intelligence/parser"
    "src/code-intelligence/chunking"
    "src/code-intelligence/embeddings"
    "src/code-intelligence/indexing"
    "src/code-intelligence/graph"
    "src/code-intelligence/search"
    "src/code-intelligence/rag"
    "src/code-intelligence/visualization"
)

for dir in "${DIRS[@]}"; do
    if [ -d "$dir" ]; then
        print_success "Directory exists: $dir"
    else
        print_error "Directory missing: $dir"
        exit 1
    fi
done

# Verify configuration files
print_info "Verifying configuration files..."
FILES=(
    "src/code-intelligence/config/environment.ts"
    "src/code-intelligence/config/index.ts"
    "scripts/setup-ollama.sh"
    "docs/setup/code-intelligence-prerequisites.md"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        print_success "File exists: $file"
    else
        print_error "File missing: $file"
        exit 1
    fi
done

# Run full validation
print_info "Running full validation..."
echo ""
npx tsx scripts/validate-code-intelligence-setup.ts

echo ""
echo "=================================="
print_success "Setup Complete!"
echo ""
echo "Next Steps:"
echo "  1. Review docs/setup/code-intelligence-quick-start.md"
echo "  2. Configure environment variables (optional)"
echo "  3. Proceed to Wave 2: Parser Implementation"
echo ""
