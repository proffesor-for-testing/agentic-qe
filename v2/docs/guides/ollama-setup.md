# Ollama Setup Guide

## Overview

Ollama enables free, local LLM inference with privacy and zero cloud costs. This guide covers installation, model selection, and integration with Agentic QE Fleet.

**Benefits**:
- Complete privacy (data never leaves your machine)
- Zero ongoing costs
- Works offline
- Fast local inference with GPU acceleration
- Full control over model selection

## Installation

### macOS

```bash
# Method 1: Download installer
# Visit https://ollama.com/download and download Ollama-darwin.zip

# Method 2: Homebrew
brew install ollama

# Start Ollama service
ollama serve
```

The macOS app will start automatically and run in the background.

### Linux

```bash
# Install script (Ubuntu, Debian, Fedora, etc.)
curl -fsSL https://ollama.com/install.sh | sh

# Or manual installation
# 1. Download binary
sudo curl -L https://ollama.com/download/ollama-linux-amd64 -o /usr/bin/ollama
sudo chmod +x /usr/bin/ollama

# 2. Create service user
sudo useradd -r -s /bin/false -m -d /usr/share/ollama ollama

# 3. Create systemd service
sudo tee /etc/systemd/system/ollama.service > /dev/null <<EOF
[Unit]
Description=Ollama Service
After=network-online.target

[Service]
ExecStart=/usr/bin/ollama serve
User=ollama
Group=ollama
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

# 4. Start service
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl start ollama
```

### Windows

```powershell
# Download installer from https://ollama.com/download
# Run OllamaSetup.exe

# Or use Windows Subsystem for Linux (WSL)
wsl --install
# Then follow Linux instructions
```

### Docker

```bash
# Run Ollama in Docker
docker run -d \
  --name ollama \
  -p 11434:11434 \
  -v ollama:/root/.ollama \
  --gpus all \
  ollama/ollama

# Pull a model
docker exec -it ollama ollama pull qwen3-coder:30b

# Check running models
docker exec -it ollama ollama list
```

## Hardware Requirements

### Minimum Requirements

| Component | Requirement | Notes |
|-----------|-------------|-------|
| **RAM** | 8GB | For 3B-7B parameter models |
| **Storage** | 10GB+ free | Model sizes vary (3GB-40GB per model) |
| **CPU** | Modern x64 | 4+ cores recommended |
| **GPU** | Optional | Nvidia GPU with 8GB+ VRAM for acceleration |

### Recommended Requirements

| Model Size | RAM | GPU VRAM | Speed Estimate |
|------------|-----|----------|----------------|
| **3B params** | 8GB | 4GB+ | 20-30 tokens/sec |
| **7B params** | 16GB | 8GB+ | 15-25 tokens/sec |
| **13B params** | 32GB | 16GB+ | 10-15 tokens/sec |
| **30B params** | 64GB | 24GB+ | 5-10 tokens/sec |
| **70B params** | 128GB | 48GB+ | 2-5 tokens/sec |

### GPU Acceleration

Ollama automatically uses GPU if available:

```bash
# Check GPU support
ollama run llama3.3:70b --verbose

# Output shows GPU layers offloaded
# GPU: NVIDIA GeForce RTX 4090 (24GB)
# Offloaded: 80/80 layers to GPU
# Speed: 25.4 tokens/sec
```

**Supported GPUs**:
- **Nvidia**: GTX 1060+, RTX series (CUDA)
- **AMD**: RX 6000+ series (ROCm on Linux)
- **Apple Silicon**: M1/M2/M3 (Metal acceleration)

## Model Selection

### Recommended Models for AQE

| Model | Size | Context | Best For | Download |
|-------|------|---------|----------|----------|
| **qwen3-coder:30b** | 30B | 32K | Primary coding model | `ollama pull qwen3-coder:30b` |
| **llama3.3:70b** | 70B | 128K | Large general-purpose | `ollama pull llama3.3:70b` |
| **devstral-small:24b** | 24B | 128K | Efficient coding | `ollama pull devstral-small:24b` |
| **rnj-1:8b** | 8B | 128K | Edge deployment | `ollama pull rnj-1:8b` |
| **deepseek-coder-v2:16b** | 16B | 128K | Code-specific | `ollama pull deepseek-coder-v2:16b` |

### Model Categories

#### Coding Models (Recommended for AQE)

```bash
# PRIMARY: Qwen 3 Coder - 30B, excellent for test generation
ollama pull qwen3-coder:30b

# ALTERNATIVE: DeepSeek Coder V2 - 16B, lightweight
ollama pull deepseek-coder-v2:16b

# EFFICIENT: Devstral Small - 24B, fast inference
ollama pull devstral-small:24b

# EDGE: RNJ-1 - 8B, minimal resources
ollama pull rnj-1:8b
```

#### General-Purpose Models

```bash
# LARGE: Llama 3.3 - 70B, best quality
ollama pull llama3.3:70b

# BALANCED: Llama 3.2 - 13B, good performance
ollama pull llama3.2:13b

# SMALL: Llama 3.2 - 3B, fast responses
ollama pull llama3.2:3b

# VISION: Llama 3.2 Vision - 11B, multimodal
ollama pull llama3.2-vision:11b
```

#### Specialized Models

```bash
# MATH: DeepSeek Math
ollama pull deepseek-math:7b

# FUNCTION CALLING: Llama 3.1
ollama pull llama3.1:8b

# LONG CONTEXT: Gemma 2 - 9B, 8K context
ollama pull gemma2:9b
```

### Model Size vs Performance

```
Small (3B-8B):
├─ Pros: Fast inference, low memory, quick responses
├─ Cons: Lower quality, simpler reasoning
└─ Use: Simple tasks, edge deployment

Medium (13B-24B):
├─ Pros: Good balance, reasonable memory
├─ Cons: Slower than small, needs more RAM
└─ Use: Most coding tasks, general development

Large (30B-70B):
├─ Pros: High quality, complex reasoning
├─ Cons: Slow inference, high memory
└─ Use: Complex tasks, production quality
```

## Quick Start

### 1. Install Ollama

```bash
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh
```

### 2. Pull Models

```bash
# Download recommended coding model (30B)
ollama pull qwen3-coder:30b

# Or start with smaller model (8B)
ollama pull rnj-1:8b
```

### 3. Start Server

```bash
# Start Ollama service
ollama serve

# Or run in background (Linux/macOS)
ollama serve > /dev/null 2>&1 &
```

### 4. Verify Installation

```bash
# List downloaded models
ollama list

# Test inference
ollama run qwen3-coder:30b "Write a hello world function"

# Check API
curl http://localhost:11434/api/tags
```

### 5. Configure AQE

```typescript
import { LLMProviderFactory } from 'agentic-qe';

const factory = new LLMProviderFactory({
  defaultProvider: 'ruvllm',  // Use local Ollama
  ruvllm: {
    defaultModel: 'qwen3-coder:30b',
    baseUrl: 'http://localhost:11434',
    enableTRM: true,  // Test-time reasoning
    enableSONA: true  // Self-learning
  }
});

await factory.initialize();
```

## Configuration

### Basic Configuration

```typescript
const provider = new OllamaProvider({
  baseUrl: 'http://localhost:11434',
  defaultModel: 'qwen3-coder:30b',
  keepAlive: true,           // Keep model in memory
  keepAliveDuration: 300,    // 5 minutes
  timeout: 120000            // 2 minute timeout
});

await provider.initialize();
```

### Advanced Configuration

```typescript
const provider = new OllamaProvider({
  baseUrl: process.env.OLLAMA_HOST || 'http://localhost:11434',
  defaultModel: 'qwen3-coder:30b',

  // Performance tuning
  keepAlive: true,
  keepAliveDuration: 600,    // 10 minutes for long sessions

  // Reliability
  timeout: 180000,           // 3 minutes for complex queries
  maxRetries: 2,

  // Debugging
  debug: process.env.DEBUG === 'true'
});
```

### Environment Variables

```bash
# Ollama host (for remote servers)
export OLLAMA_HOST=http://gpu-server:11434

# Ollama models directory
export OLLAMA_MODELS=/mnt/ssd/ollama-models

# GPU configuration
export CUDA_VISIBLE_DEVICES=0,1  # Use GPUs 0 and 1

# Debug mode
export OLLAMA_DEBUG=1
```

## Usage with AQE

### Basic Test Generation

```typescript
import { LLMProviderFactory } from 'agentic-qe';

const factory = new LLMProviderFactory({
  defaultProvider: 'ruvllm',
  ruvllm: {
    defaultModel: 'qwen3-coder:30b'
  }
});

await factory.initialize();

const response = await factory.executeWithFallback(
  provider => provider.complete({
    model: 'qwen3-coder:30b',
    messages: [{
      role: 'user',
      content: 'Generate unit tests for UserService with 95% coverage'
    }],
    maxTokens: 2048
  })
);

console.log(response.content[0].text);
```

### Streaming Responses

```typescript
const provider = factory.getProvider('ruvllm');

for await (const chunk of provider.streamComplete({
  model: 'qwen3-coder:30b',
  messages: [{ role: 'user', content: 'Generate tests...' }]
})) {
  if (chunk.type === 'content_block_delta') {
    process.stdout.write(chunk.delta.text);
  }
}
```

### Model Hot-Swapping

```typescript
// Start with small model
const provider = new OllamaProvider({
  defaultModel: 'rnj-1:8b'
});

// Switch to larger model for complex task
await provider.setModel('qwen3-coder:30b');

// Switch back to small model
await provider.setModel('rnj-1:8b');
```

## Performance Optimization

### 1. Keep Models Loaded

```typescript
// Keep model in memory between requests
const provider = new OllamaProvider({
  keepAlive: true,
  keepAliveDuration: 600  // 10 minutes
});
```

### 2. Use GPU Acceleration

```bash
# Linux: Install NVIDIA drivers
sudo apt install nvidia-driver-535

# Verify GPU detected
ollama run qwen3-coder:30b --verbose
# Should show: "GPU: NVIDIA ... Offloaded: XX/XX layers"
```

### 3. Optimize Model Size

```bash
# Use quantized models for faster inference
ollama pull qwen3-coder:30b-q4_0  # 4-bit quantization
ollama pull qwen3-coder:30b-q5_K_M  # 5-bit quantization

# vs full precision
ollama pull qwen3-coder:30b-fp16
```

### 4. Batch Requests

```typescript
// Process multiple requests in parallel
const requests = [
  'Generate tests for UserService',
  'Generate tests for PaymentService',
  'Generate tests for AuthService'
];

const responses = await Promise.all(
  requests.map(content =>
    provider.complete({
      model: 'qwen3-coder:30b',
      messages: [{ role: 'user', content }]
    })
  )
);
```

### 5. Adjust Context Size

```bash
# Create custom model with smaller context (faster)
ollama create my-qwen-8k <<EOF
FROM qwen3-coder:30b
PARAMETER num_ctx 8192
EOF

ollama run my-qwen-8k
```

## Troubleshooting

### Ollama Server Not Running

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# If not running:
# macOS: Open Ollama.app
# Linux: sudo systemctl start ollama
# Windows: Start Ollama from Start Menu

# Or run manually
ollama serve
```

### Model Not Found

```bash
# List available models
ollama list

# Pull missing model
ollama pull qwen3-coder:30b

# Verify download
ollama list | grep qwen3-coder
```

### Out of Memory

```bash
# Check model size
ollama show qwen3-coder:30b --modelfile

# Use smaller model
ollama pull rnj-1:8b  # 8B instead of 30B

# Or enable quantization
ollama pull qwen3-coder:30b-q4_0  # 4-bit quantized
```

### Slow Inference

```bash
# Check GPU usage
nvidia-smi  # Linux
Activity Monitor > GPU History  # macOS

# Ensure GPU layers offloaded
ollama run qwen3-coder:30b --verbose
# Look for: "Offloaded: 80/80 layers to GPU"

# If CPU-only, consider:
# 1. Smaller model
# 2. Quantized model
# 3. Reduce context size
```

### Connection Refused

```bash
# Check Ollama is listening
netstat -an | grep 11434
# Should show: tcp 0.0.0.0:11434 LISTEN

# Check firewall
sudo ufw allow 11434/tcp  # Linux
# macOS: System Settings > Security > Firewall

# Remote server: Update baseUrl
export OLLAMA_HOST=http://your-server:11434
```

### Model Download Fails

```bash
# Check disk space
df -h

# Check internet connection
curl -I https://ollama.com

# Retry with verbose output
ollama pull qwen3-coder:30b --verbose

# Use alternative mirror (if available)
# Set OLLAMA_MODELS to different location
export OLLAMA_MODELS=/mnt/external/ollama
```

## Advanced Topics

### Custom Models

```bash
# Create custom model with modified parameters
ollama create my-custom-model <<EOF
FROM qwen3-coder:30b
PARAMETER temperature 0.8
PARAMETER top_p 0.9
PARAMETER num_ctx 16384
SYSTEM "You are an expert test generator specializing in Jest."
EOF

ollama run my-custom-model
```

### Remote Ollama Server

```bash
# Run Ollama on GPU server
# Server:
ollama serve --host 0.0.0.0:11434

# Client (development machine):
export OLLAMA_HOST=http://gpu-server.local:11434

const provider = new OllamaProvider({
  baseUrl: 'http://gpu-server.local:11434',
  defaultModel: 'qwen3-coder:30b'
});
```

### Model Management

```bash
# List all models
ollama list

# Show model details
ollama show qwen3-coder:30b

# Remove unused models
ollama rm llama3.2:3b

# Update model to latest version
ollama pull qwen3-coder:30b

# Copy model
ollama cp qwen3-coder:30b my-qwen-backup
```

### Docker Deployment

```yaml
# docker-compose.yml
version: '3.8'

services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

volumes:
  ollama_data:
```

```bash
# Start services
docker-compose up -d

# Pull models
docker exec ollama ollama pull qwen3-coder:30b

# Test
curl http://localhost:11434/api/tags
```

## Best Practices

### 1. Model Selection

- **Development**: Use `rnj-1:8b` or `qwen3-coder:30b-q4_0` (fast)
- **Production**: Use `qwen3-coder:30b` (best quality)
- **Testing**: Use `rnj-1:8b` (cheapest resource usage)

### 2. Resource Management

```typescript
// Keep model loaded during active work
const provider = new OllamaProvider({
  keepAlive: true,
  keepAliveDuration: 600  // 10 minutes
});

// Unload when done
await provider.shutdown();  // Stops keeping model in memory
```

### 3. Monitoring

```bash
# Monitor GPU usage
watch -n 1 nvidia-smi

# Monitor Ollama logs
journalctl -u ollama -f  # Linux
tail -f ~/Library/Logs/Ollama/server.log  # macOS

# Monitor model memory
ollama ps
```

### 4. Updates

```bash
# Update Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Update models
ollama pull qwen3-coder:30b

# Check versions
ollama --version
```

## Next Steps

- **Free Tier Guide**: [Free Cloud Deployment](./free-tier-guide.md)
- **Provider Guide**: [LLM Providers Overview](./llm-providers-guide.md)
- **Configuration**: [Provider Config Schema](../reference/provider-config-schema.md)

## Resources

- **Ollama Website**: https://ollama.com
- **Model Library**: https://ollama.com/library
- **GitHub**: https://github.com/ollama/ollama
- **Discord**: https://discord.gg/ollama
