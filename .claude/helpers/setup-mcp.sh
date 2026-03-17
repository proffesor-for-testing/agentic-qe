#!/bin/bash
# Setup MCP server for Claude Flow

echo "🚀 Setting up Claude Flow MCP server..."

# Check if claude command exists
if ! command -v claude &> /dev/null; then
    echo "❌ Error: Claude Code CLI not found"
    echo "Please install Claude Code first"
    exit 1
fi

# Add MCP server
echo "📦 Adding ruflo MCP server..."
claude mcp add ruflo npx ruflo mcp start

echo "✅ MCP server setup complete!"
echo "🎯 You can now use mcp__ruflo__ tools in Claude Code"
