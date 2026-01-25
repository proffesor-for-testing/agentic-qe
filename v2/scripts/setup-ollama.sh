#!/bin/bash
# Setup script for nomic-embed-text embeddings via Ollama

set -e

echo "🔧 Setting up Ollama for Code Intelligence System"
echo ""

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama not found."
    echo ""
    echo "Install Ollama from: https://ollama.ai"
    echo "  curl -fsSL https://ollama.ai/install.sh | sh"
    echo ""
    exit 1
fi

echo "✅ Ollama is installed"
echo ""

# Check if Ollama is running
echo "Checking if Ollama service is running..."
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "⚠️  Ollama service not detected. Starting Ollama..."
    echo ""
    echo "Run this in a separate terminal:"
    echo "  ollama serve"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "✅ Ollama service is running"
echo ""

# Pull nomic-embed-text model
echo "📥 Pulling nomic-embed-text model..."
echo "   This may take a few minutes..."
ollama pull nomic-embed-text

echo ""

# Verify model is available
if ollama list | grep -q "nomic-embed-text"; then
    echo "✅ nomic-embed-text model ready!"
    echo ""
    echo "Model details:"
    ollama show nomic-embed-text
    echo ""
    echo "Test embedding generation:"
    echo '  curl http://localhost:11434/api/embeddings -d '"'"'{"model": "nomic-embed-text", "prompt": "Hello world"}'"'"''
    echo ""
    echo "🎉 Setup complete! Code Intelligence System is ready to use."
else
    echo "❌ Failed to pull nomic-embed-text model"
    exit 1
fi
