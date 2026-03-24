---
name: "flow-nexus-neural"
description: "Train and deploy neural networks in distributed E2B sandboxes with Flow Nexus. Supports feedforward, LSTM, GAN, transformer architectures. Use when training models, running inference, or managing distributed clusters."
---

# Flow Nexus Neural Networks

Deploy, train, and manage neural networks in distributed E2B sandbox environments.

## Prerequisites

```bash
claude mcp add flow-nexus npx flow-nexus@latest mcp start
npx flow-nexus@latest register
npx flow-nexus@latest login
```

## Workflow

### Step 1: Train a Model

```javascript
mcp__flow-nexus__neural_train({
  config: {
    architecture: {
      type: "feedforward",  // feedforward | lstm | gan | autoencoder | transformer
      layers: [
        { type: "dense", units: 256, activation: "relu" },
        { type: "dropout", rate: 0.3 },
        { type: "dense", units: 128, activation: "relu" },
        { type: "dense", units: 10, activation: "softmax" }
      ]
    },
    training: { epochs: 100, batch_size: 32, learning_rate: 0.001, optimizer: "adam" }
  },
  tier: "small",  // nano | mini | small | medium | large
  user_id: "your_user_id"
})
```

### Step 2: Check Training Status

```javascript
mcp__flow-nexus__neural_training_status({ job_id: "job_training_xyz" })
// Returns: { status, progress, current_epoch, current_loss, estimated_completion }
```

### Step 3: Run Inference

```javascript
mcp__flow-nexus__neural_predict({
  model_id: "model_abc123",
  input: [[0.5, 0.3, 0.2, 0.1], [0.8, 0.1, 0.05, 0.05]],
  user_id: "your_user_id"
})
// Returns: { predictions, inference_time_ms, model_version }
```

## Architecture Quick Reference

| Architecture | Best For | Example |
|-------------|----------|---------|
| Feedforward | Classification, regression | `{ type: "feedforward", layers: [dense, dropout, dense] }` |
| LSTM | Time series, sequences | `{ type: "lstm", layers: [lstm, dropout, lstm, dense] }` |
| Transformer | NLP, attention tasks | `{ type: "transformer", layers: [embedding, transformer_encoder, dense] }` |
| GAN | Generative tasks, image synthesis | `{ type: "gan", generator_layers: [...], discriminator_layers: [...] }` |
| Autoencoder | Dimensionality reduction, anomaly detection | `{ type: "autoencoder", encoder_layers: [...], decoder_layers: [...] }` |

## Template Marketplace

```javascript
// Browse templates
mcp__flow-nexus__neural_list_templates({
  category: "classification",  // timeseries | regression | nlp | vision | anomaly | generative
  tier: "free",
  limit: 20
})

// Deploy a template
mcp__flow-nexus__neural_deploy_template({
  template_id: "sentiment-analysis-v2",
  custom_config: { training: { epochs: 50, learning_rate: 0.0001 } },
  user_id: "your_user_id"
})
```

## Distributed Training

```javascript
// 1. Initialize cluster
const cluster = await mcp__flow-nexus__neural_cluster_init({
  name: "large-model-cluster",
  architecture: "transformer",
  topology: "mesh",  // mesh | ring | star | hierarchical
  consensus: "proof-of-learning",
  daaEnabled: true,
  wasmOptimization: true
})

// 2. Deploy worker nodes
await mcp__flow-nexus__neural_node_deploy({
  cluster_id: cluster.cluster_id,
  node_type: "worker",
  model: "xl",
  capabilities: ["training", "inference"],
  autonomy: 0.9
})

// 3. Start distributed training
await mcp__flow-nexus__neural_train_distributed({
  cluster_id: cluster.cluster_id,
  dataset: "imagenet",
  epochs: 100,
  batch_size: 128,
  learning_rate: 0.001,
  optimizer: "adam",
  federated: true  // data stays on local nodes
})

// 4. Monitor
mcp__flow-nexus__neural_cluster_status({ cluster_id: cluster.cluster_id })

// 5. Terminate when done
mcp__flow-nexus__neural_cluster_terminate({ cluster_id: cluster.cluster_id })
```

## Model Management

```javascript
// List models
mcp__flow-nexus__neural_list_models({ user_id: "your_user_id", include_public: true })

// Benchmark performance
mcp__flow-nexus__neural_performance_benchmark({
  model_id: "model_abc123",
  benchmark_type: "comprehensive"  // inference | throughput | memory | comprehensive
})

// Publish to marketplace
mcp__flow-nexus__neural_publish_template({
  model_id: "model_abc123",
  name: "High-Accuracy Sentiment Classifier",
  description: "Fine-tuned BERT model for sentiment analysis with 94% accuracy",
  category: "nlp",
  price: 0,
  user_id: "your_user_id"
})
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Training stalled | Check `cluster_status`, terminate and restart if needed |
| Low accuracy | Increase epochs, adjust learning rate, add dropout |
| Out of memory | Reduce batch size, use smaller tier, enable distributed training |

## Related Skills

- `flow-nexus-sandbox` -- E2B sandbox management
- `flow-nexus-swarm` -- AI swarm orchestration
- `flow-nexus-workflow` -- Workflow automation
