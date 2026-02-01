# A2A (Agent-to-Agent) Protocol: Best Practices 2025-2026

> **Research Report** | Generated: 2026-01-30
> **Author**: Research Agent (Agentic QE)
> **Version**: 1.0

---

## Executive Summary

The Agent2Agent (A2A) Protocol is an open standard for AI agent interoperability, introduced by Google in April 2025 and now governed by the Linux Foundation. This report provides comprehensive best practices for implementing A2A in production systems, covering protocol specification, Agent Cards, task negotiation, agent discovery, security, and integration patterns with MCP (Model Context Protocol).

**Key Findings:**
- A2A v0.3 (released July 2025) adds gRPC support, signed security cards, and 150+ organizational partners
- A2A complements rather than competes with Anthropic's MCP protocol
- 78% of organizations use AI tools, with 85% integrating agents into workflows
- Gossip protocols provide emergent coordination capabilities that complement A2A's structured messaging

---

## Table of Contents

1. [Protocol Specification](#1-protocol-specification)
2. [Agent Capability Cards](#2-agent-capability-cards)
3. [Task Negotiation Protocol](#3-task-negotiation-protocol)
4. [Agent Discovery](#4-agent-discovery)
5. [JSON-RPC 2.0 Implementation](#5-json-rpc-20-implementation)
6. [A2A vs MCP Comparison](#6-a2a-vs-mcp-comparison)
7. [Gossip Protocols for Distributed Coordination](#7-gossip-protocols-for-distributed-coordination)
8. [Security Best Practices](#8-security-best-practices)
9. [Enterprise Deployment Patterns](#9-enterprise-deployment-patterns)
10. [Code Examples](#10-code-examples)
11. [Sources](#11-sources)

---

## 1. Protocol Specification

### 1.1 Overview

The A2A Protocol is an open standard designed to facilitate communication and interoperability between independent, potentially opaque AI agent systems. It enables agents built on different frameworks to:

- **Discover capabilities** through standardized Agent Cards
- **Negotiate interaction modes** (text, files, structured data)
- **Collaborate on tasks** with defined lifecycle states
- **Exchange information securely** without exposing internal state

### 1.2 Core Actors

| Actor | Description |
|-------|-------------|
| **User** | Human or automated entity initiating requests |
| **A2A Client (Client Agent)** | Application acting on user's behalf, initiating protocol communication |
| **A2A Server (Remote Agent)** | HTTP-exposed AI agent processing requests; operates as opaque system |

### 1.3 Protocol Bindings

A2A v0.3 supports three equally-capable transport protocols:

| Binding | Use Case | Features |
|---------|----------|----------|
| **JSON-RPC 2.0** | Web services, REST-like APIs | Method-based RPC, SSE streaming |
| **gRPC** | High-performance services | Bidirectional streaming, strong typing |
| **HTTP+JSON/REST** | Simple integrations | Standard HTTP verbs, URL-based routing |

### 1.4 Protocol Version History

| Version | Release Date | Key Features |
|---------|--------------|--------------|
| 0.1 | April 2025 | Initial release with core concepts |
| 0.2 | June 2025 | Stateless interactions, OpenAPI-like auth schema |
| 0.3 | July 2025 | gRPC support, signed security cards, extended Python SDK |

---

## 2. Agent Capability Cards

### 2.1 Overview

An **Agent Card** is a JSON metadata document that serves as a digital "business card" for A2A servers. It describes identity, capabilities, skills, service endpoints, and authentication requirements.

### 2.2 Schema Specification

#### Required Fields

```json
{
  "name": "string (required)",
  "description": "string (required)",
  "url": "string (required)",
  "version": "string (required)",
  "capabilities": "object (required)",
  "skills": "array (required)"
}
```

#### Complete Agent Card Schema

```typescript
interface AgentCard {
  // Identity
  name: string;                    // Human-readable name
  description: string;             // Detailed description
  version: string;                 // Semantic version (e.g., "1.0.0")
  url: string;                     // Service endpoint URL

  // Provider Information
  provider?: {
    organization: string;
    url: string;
  };

  // Documentation
  documentationUrl?: string;

  // Capabilities
  capabilities: {
    streaming?: boolean;           // Supports SSE streaming
    pushNotifications?: boolean;   // Supports webhook notifications
    stateTransitionHistory?: boolean; // Exposes task state history
  };

  // Skills
  skills: AgentSkill[];

  // I/O Modes
  defaultInputModes?: string[];    // e.g., ["text/plain", "application/json"]
  defaultOutputModes?: string[];   // e.g., ["text/plain", "application/json"]

  // Security
  securitySchemes?: SecurityScheme[];
  supportsAuthenticatedExtendedCard?: boolean;
}

interface AgentSkill {
  id: string;                      // Unique skill identifier
  name: string;                    // Human-readable name
  description: string;             // What the skill does
  tags?: string[];                 // Categorization keywords
  examples?: string[];             // Sample prompts or use cases
  inputModes?: string[];           // Supported input media types
  outputModes?: string[];          // Supported output media types
}
```

### 2.3 Hosting Location

Agent Cards MUST be discoverable at the well-known URI per [RFC 8615](https://tools.ietf.org/html/rfc8615):

```
https://<base_url>/.well-known/agent.json
```

### 2.4 Signed Agent Cards

Agent Cards MAY be digitally signed using JSON Web Signature (JWS) per [RFC 7515](https://tools.ietf.org/html/rfc7515) to ensure authenticity and integrity:

```json
{
  "protected": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9",
  "payload": "eyJuYW1lIjoiTXlBZ2VudCIsInZlcnNpb24iOiIxLjAuMCJ9",
  "signature": "abc123..."
}
```

### 2.5 Example Agent Card

```json
{
  "name": "Travel Booking Agent",
  "description": "AI agent for booking flights, hotels, and rental cars",
  "url": "https://travel-agent.example.com/a2a",
  "version": "2.1.0",
  "provider": {
    "organization": "Acme Travel Inc.",
    "url": "https://acmetravel.example.com"
  },
  "documentationUrl": "https://docs.acmetravel.example.com/a2a",
  "capabilities": {
    "streaming": true,
    "pushNotifications": true,
    "stateTransitionHistory": false
  },
  "skills": [
    {
      "id": "flight-search",
      "name": "Flight Search",
      "description": "Search for available flights between destinations",
      "tags": ["travel", "flights", "booking"],
      "examples": [
        "Find flights from NYC to LAX on March 15",
        "Search for round-trip flights to Tokyo"
      ],
      "inputModes": ["text/plain", "application/json"],
      "outputModes": ["application/json"]
    },
    {
      "id": "hotel-booking",
      "name": "Hotel Booking",
      "description": "Search and book hotel accommodations",
      "tags": ["travel", "hotels", "accommodation"],
      "examples": [
        "Book a hotel in Paris for 3 nights",
        "Find hotels near Times Square under $200/night"
      ]
    }
  ],
  "defaultInputModes": ["text/plain"],
  "defaultOutputModes": ["application/json"],
  "securitySchemes": [
    {
      "type": "oauth2",
      "flows": {
        "clientCredentials": {
          "tokenUrl": "https://auth.example.com/oauth/token",
          "scopes": {
            "travel:read": "Read travel data",
            "travel:book": "Make bookings"
          }
        }
      }
    }
  ],
  "supportsAuthenticatedExtendedCard": true
}
```

---

## 3. Task Negotiation Protocol

### 3.1 Task Lifecycle

A **Task** represents a unit of work with a unique identifier that progresses through defined lifecycle states:

```
                    +-------------+
                    |  submitted  |
                    +------+------+
                           |
              +------------+------------+
              |                         |
              v                         v
        +----------+             +-----------+
        | rejected |             |  working  |
        +----------+             +-----+-----+
                                       |
                    +------------------+------------------+
                    |                  |                  |
                    v                  v                  v
             +------------+    +---------------+   +-----------+
             | completed  |    | input_required|   |  failed   |
             +------------+    +-------+-------+   +-----------+
                                       |
                                       v
                               +---------------+
                               | auth_required |
                               +---------------+
```

#### Task States

| State | Terminal | Description |
|-------|----------|-------------|
| `submitted` | No | Initial state when task is created |
| `working` | No | Agent is actively processing |
| `input_required` | No | Agent needs additional input from user |
| `auth_required` | No | Additional authentication required |
| `completed` | Yes | Task finished successfully |
| `failed` | Yes | Task failed with error |
| `canceled` | Yes | Task was canceled by client |
| `rejected` | Yes | Agent rejected the task |

### 3.2 Message Structure

Messages represent bidirectional communication turns between client and agent:

```typescript
interface Message {
  role: "user" | "agent";     // Who sent the message
  parts: Part[];              // Content containers
  contextId?: string;         // Groups related tasks
  taskId?: string;            // References specific task
  referenceTaskIds?: string[]; // Related task references
  metadata?: Record<string, any>;
}

// Part Types
interface TextPart {
  type: "text";
  text: string;
}

interface FilePart {
  type: "file";
  file: {
    name: string;
    mimeType: string;
    bytes?: string;           // Base64-encoded inline
    uri?: string;             // External reference
  };
}

interface DataPart {
  type: "data";
  data: Record<string, any>;  // Structured JSON
}

type Part = TextPart | FilePart | DataPart;
```

### 3.3 Artifacts

Artifacts represent concrete outputs generated during task processing:

```typescript
interface Artifact {
  id: string;                 // Unique identifier
  name: string;               // Human-readable name
  description?: string;
  parts: Part[];              // Content pieces
  index?: number;             // Ordering hint
  append?: boolean;           // Append to existing artifact
  lastChunk?: boolean;        // Final chunk in stream
  metadata?: Record<string, any>;
}
```

### 3.4 Task Request/Response Patterns

#### Synchronous Request

```json
// Request
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [
        {
          "type": "text",
          "text": "Find flights from NYC to LAX on March 15"
        }
      ]
    }
  }
}

// Response
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "result": {
    "task": {
      "id": "task-abc123",
      "status": "completed",
      "artifacts": [
        {
          "id": "artifact-001",
          "name": "Flight Results",
          "parts": [
            {
              "type": "data",
              "data": {
                "flights": [
                  {"airline": "UA", "departure": "07:00", "price": 299},
                  {"airline": "AA", "departure": "09:30", "price": 279}
                ]
              }
            }
          ]
        }
      ]
    }
  }
}
```

#### Streaming with SSE

```json
// Request
{
  "jsonrpc": "2.0",
  "id": "req-002",
  "method": "message/stream",
  "params": {
    "message": {
      "role": "user",
      "parts": [{"type": "text", "text": "Analyze this dataset"}]
    }
  }
}

// SSE Events
event: task.status
data: {"taskId": "task-xyz", "status": "working"}

event: task.artifact
data: {"taskId": "task-xyz", "artifact": {"id": "a1", "parts": [...], "lastChunk": false}}

event: task.artifact
data: {"taskId": "task-xyz", "artifact": {"id": "a1", "parts": [...], "lastChunk": true}}

event: task.status
data: {"taskId": "task-xyz", "status": "completed"}
```

### 3.5 Multi-Turn Interactions

Context management enables coherent multi-turn workflows:

```json
// Turn 1
{
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [{"type": "text", "text": "Search hotels in Paris"}]
    }
  }
}

// Response includes contextId
{
  "result": {
    "task": {
      "id": "task-001",
      "contextId": "ctx-session-abc",
      "status": "completed"
    }
  }
}

// Turn 2 - Reference context
{
  "method": "message/send",
  "params": {
    "contextId": "ctx-session-abc",
    "message": {
      "role": "user",
      "parts": [{"type": "text", "text": "Show me ones under $200/night"}]
    }
  }
}
```

---

## 4. Agent Discovery

### 4.1 Discovery Methods

| Method | Description | Best For |
|--------|-------------|----------|
| **Well-Known URI** | Fetch from `/.well-known/agent.json` | Open/public agents |
| **Curated Registry** | Query centralized registry service | Enterprise marketplaces |
| **Direct Configuration** | Hardcoded in config/environment | Known integrations |
| **DNS-SD/mDNS** | Local network discovery (Zeroconf) | Edge/local deployments |
| **Kubernetes Service Discovery** | Query K8s API for labeled services | Cloud-native deployments |

### 4.2 Well-Known URI Discovery

Per [RFC 8615](https://tools.ietf.org/html/rfc8615), clients discover agents at:

```bash
GET https://agent.example.com/.well-known/agent.json
Accept: application/json
```

### 4.3 Registry-Based Discovery

```typescript
// Registry Query API (community proposal)
interface RegistryQuery {
  skills?: string[];          // Filter by skill IDs
  tags?: string[];            // Filter by tags
  capabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
  };
  provider?: string;          // Filter by provider
  verified?: boolean;         // Only verified agents
}

// Example query
const agents = await registry.search({
  skills: ["flight-search", "hotel-booking"],
  tags: ["travel"],
  capabilities: { streaming: true },
  verified: true
});
```

### 4.4 Kubernetes Discovery

```yaml
# Agent Service with discovery labels
apiVersion: v1
kind: Service
metadata:
  name: travel-agent
  labels:
    app: a2a-agent
    a2a.protocol.org/version: "0.3"
    a2a.protocol.org/skills: "flight-search,hotel-booking"
spec:
  selector:
    app: travel-agent
  ports:
    - port: 8080
      targetPort: 8080
```

```typescript
// K8s Discovery Client
async function discoverAgents(namespace: string): Promise<AgentCard[]> {
  const services = await k8sApi.listNamespacedService(namespace, {
    labelSelector: 'app=a2a-agent'
  });

  const agents: AgentCard[] = [];
  for (const svc of services.body.items) {
    const endpoint = `http://${svc.metadata.name}.${namespace}.svc.cluster.local`;
    try {
      const card = await fetch(`${endpoint}/.well-known/agent.json`);
      agents.push(await card.json());
    } catch (e) {
      console.warn(`Failed to fetch agent card from ${endpoint}`);
    }
  }
  return agents;
}
```

### 4.5 Local Network Discovery (LAD-A2A)

For local network scenarios (hotels, offices, hospitals), LAD-A2A uses mDNS/DNS-SD:

```typescript
// Advertise agent via mDNS
import { Bonjour } from 'bonjour-service';

const bonjour = new Bonjour();
bonjour.publish({
  name: 'Local Assistant Agent',
  type: 'a2a',
  port: 8080,
  txt: {
    version: '0.3',
    skills: 'room-service,concierge'
  }
});

// Discover local agents
bonjour.find({ type: 'a2a' }, (service) => {
  console.log(`Found agent: ${service.name} at ${service.host}:${service.port}`);
});
```

---

## 5. JSON-RPC 2.0 Implementation

### 5.1 Message Envelope

All A2A operations use standard JSON-RPC 2.0 structure:

```typescript
// Request
interface JsonRpcRequest {
  jsonrpc: "2.0";             // MUST be exactly "2.0"
  id: string | number | null; // Request identifier
  method: string;             // A2A method name
  params?: object;            // Method parameters
}

// Success Response
interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result: any;                // Method-specific result
}

// Error Response
interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;             // Error code
    message: string;          // Human-readable message
    data?: any;               // Additional error details
  };
}
```

### 5.2 A2A Methods

| Method | Description |
|--------|-------------|
| `message/send` | Send message, receive complete response |
| `message/stream` | Send message, stream responses via SSE |
| `tasks/get` | Retrieve task status and artifacts |
| `tasks/list` | List tasks with filtering |
| `tasks/cancel` | Request task cancellation |
| `tasks/subscribe` | Subscribe to task updates via SSE |
| `tasks/pushNotification/set` | Configure webhook notifications |
| `tasks/pushNotification/get` | Get notification configuration |
| `tasks/pushNotification/list` | List notification configurations |
| `tasks/pushNotification/delete` | Remove notification configuration |
| `agent/card` | Get extended (authenticated) agent card |

### 5.3 Error Codes

| Code | Category | Description |
|------|----------|-------------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid request | Not valid JSON-RPC |
| -32601 | Method not found | Unknown method |
| -32602 | Invalid params | Invalid method parameters |
| -32603 | Internal error | Server internal error |
| -32000 to -32099 | Server error | A2A-specific errors |

### 5.4 A2A-Specific Error Codes

```typescript
enum A2AErrorCode {
  // Authentication (401)
  AUTHENTICATION_REQUIRED = -32001,
  INVALID_CREDENTIALS = -32002,

  // Authorization (403)
  INSUFFICIENT_PERMISSIONS = -32003,
  SKILL_ACCESS_DENIED = -32004,

  // Resource (404)
  TASK_NOT_FOUND = -32010,
  CONTEXT_NOT_FOUND = -32011,
  SKILL_NOT_FOUND = -32012,

  // Validation (400)
  INVALID_MESSAGE = -32020,
  UNSUPPORTED_CONTENT_TYPE = -32021,

  // Rate Limiting (429)
  RATE_LIMIT_EXCEEDED = -32030,
  QUOTA_EXCEEDED = -32031,

  // Task State (409)
  TASK_ALREADY_COMPLETED = -32040,
  TASK_CANCELED = -32041,
  INVALID_STATE_TRANSITION = -32042
}
```

### 5.5 HTTP Headers

```http
POST /a2a HTTP/1.1
Host: agent.example.com
Content-Type: application/json
Accept: application/json
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
A2A-Version: 0.3
X-Request-ID: req-abc123
traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
```

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | `application/json` |
| `Accept` | Yes | `application/json` or `text/event-stream` |
| `Authorization` | Conditional | Authentication credentials |
| `A2A-Version` | Recommended | Protocol version (e.g., "0.3") |
| `X-Request-ID` | Recommended | Correlation identifier |
| `traceparent` | Recommended | W3C Trace Context |

---

## 6. A2A vs MCP Comparison

### 6.1 Protocol Focus

| Aspect | A2A | MCP |
|--------|-----|-----|
| **Primary Focus** | Agent-to-agent collaboration | Agent-to-tool integration |
| **Communication Direction** | Horizontal (peer-to-peer) | Vertical (agent-to-resource) |
| **Interaction Type** | Stateful, multi-turn dialogues | Stateless, discrete function calls |
| **Use Cases** | Task delegation, negotiation | Tool invocation, API access |
| **Opacity** | Agents are opaque black boxes | Tools expose structured I/O |

### 6.2 When to Use Each

#### Use A2A When:
- Multiple autonomous agents need to collaborate
- Tasks require negotiation and delegation
- Long-running operations with status updates
- Cross-organization agent communication
- Complex workflows spanning multiple domains

#### Use MCP When:
- Single agent needs tool/resource access
- Well-defined, structured inputs and outputs
- Stateless function calls (calculators, APIs)
- Internal agent capability extension
- Database queries, file operations

### 6.3 Complementary Architecture

```
+------------------+          A2A           +------------------+
|   Agent A        |<---------------------->|    Agent B       |
|                  |   (task delegation)    |                  |
|  +------------+  |                        |  +------------+  |
|  |   MCP      |  |                        |  |   MCP      |  |
|  | Connection |  |                        |  | Connection |  |
|  +-----+------+  |                        |  +-----+------+  |
|        |         |                        |        |         |
+--------|--------+                        +--------|--------+
         |                                          |
         v                                          v
   +----------+                               +----------+
   |  Tool 1  |                               |  Tool 2  |
   | (via MCP)|                               | (via MCP)|
   +----------+                               +----------+
```

### 6.4 Real-World Example: Auto Repair Shop

| Interaction | Protocol | Description |
|-------------|----------|-------------|
| Customer to Shop | A2A | Request repair estimate |
| Manager to Mechanic | A2A | Delegate inspection task |
| Mechanic to Diagnostic Tool | MCP | Run vehicle diagnostics |
| Mechanic to Parts Catalog | MCP | Query part availability |
| Mechanic to Supplier Agent | A2A | Order replacement parts |
| Shop to Customer | A2A | Deliver repair report |

### 6.5 Protocol Interoperability

```typescript
// Agent using both A2A and MCP
class HybridAgent {
  private a2aClient: A2AClient;
  private mcpClient: MCPClient;

  async handleTask(task: A2ATask): Promise<A2AArtifact[]> {
    // Use MCP to access tools
    const analysis = await this.mcpClient.invoke('analyze_data', {
      data: task.message.parts[0].data
    });

    // Delegate subtask to another agent via A2A
    const expertResult = await this.a2aClient.sendTask({
      agentUrl: 'https://expert-agent.example.com',
      message: {
        role: 'user',
        parts: [{ type: 'data', data: analysis }]
      }
    });

    // Return combined results
    return [
      {
        id: 'result-001',
        name: 'Combined Analysis',
        parts: [{ type: 'data', data: { analysis, expertResult } }]
      }
    ];
  }
}
```

---

## 7. Gossip Protocols for Distributed Coordination

### 7.1 Overview

Gossip protocols provide decentralized, fault-tolerant communication through epidemic-style information spread. Research in 2025-2026 shows they effectively complement A2A's structured messaging for emergent coordination scenarios.

### 7.2 How Gossip Complements A2A

| Capability | A2A | Gossip |
|------------|-----|--------|
| **Coordination** | Pre-defined roles, explicit routing | Emergent, self-organizing |
| **Fault Tolerance** | Requires external mechanisms | Built-in through redundancy |
| **Peer Discovery** | Static registries, well-known URIs | Dynamic through continuous exchange |
| **Load Distribution** | Explicit task routing | Emergent through local capacity bidding |
| **Convergence** | Immediate consistency | Eventual consistency (O(log N) rounds) |

### 7.3 Hybrid Architecture

```
+------------------------------------------------------------------+
|                    Agentic Ecosystem                               |
|                                                                    |
|  +---------------------------+    +---------------------------+   |
|  |      A2A Layer            |    |     Gossip Layer          |   |
|  |  (Intentional Messaging)  |    |  (Emergent Coordination)  |   |
|  |                           |    |                           |   |
|  |  - Task delegation        |    |  - Service discovery      |   |
|  |  - Structured negotiation |    |  - Health monitoring      |   |
|  |  - Artifact exchange      |    |  - Load balancing         |   |
|  |  - Authentication         |    |  - Failure detection      |   |
|  +---------------------------+    +---------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### 7.4 When to Use Gossip vs A2A

#### Use Gossip For:
- Service discovery in dynamic networks
- Task pooling and load balancing across swarms
- Failure detection and self-healing
- Knowledge sharing prioritizing availability over consistency
- Large-scale agent coordination (100+ agents)

#### Use A2A For:
- Targeted, semantic task delegation
- Strict event ordering requirements
- Immediate consistency needs
- Sensitive data requiring access controls
- Authenticated, auditable interactions

### 7.5 Gossip Implementation Pattern

```typescript
interface GossipState {
  agentId: string;
  timestamp: number;
  capabilities: string[];
  load: number;              // 0.0 - 1.0
  health: 'healthy' | 'degraded' | 'unhealthy';
  knownPeers: string[];
}

class GossipAgent {
  private state: GossipState;
  private peers: Map<string, GossipState> = new Map();

  // Periodic gossip exchange
  async gossipRound() {
    // Select random peers
    const selectedPeers = this.selectRandomPeers(3);

    for (const peer of selectedPeers) {
      // Exchange state
      const peerState = await this.exchangeState(peer, this.state);

      // Merge with local knowledge (CRDT-style)
      this.mergeState(peerState);
    }
  }

  // Merge states using last-write-wins
  private mergeState(remote: GossipState) {
    const existing = this.peers.get(remote.agentId);
    if (!existing || remote.timestamp > existing.timestamp) {
      this.peers.set(remote.agentId, remote);
    }
  }

  // Find available agents for task
  findAvailableAgents(skill: string): GossipState[] {
    return Array.from(this.peers.values())
      .filter(p => p.capabilities.includes(skill))
      .filter(p => p.health === 'healthy')
      .sort((a, b) => a.load - b.load);
  }
}
```

### 7.6 A2A + Gossip Integration

```typescript
class HybridCoordinator {
  private a2aClient: A2AClient;
  private gossipAgent: GossipAgent;

  async delegateTask(task: A2ATask, requiredSkill: string) {
    // Use gossip to find best available agent
    const candidates = this.gossipAgent.findAvailableAgents(requiredSkill);

    if (candidates.length === 0) {
      throw new Error(`No agents available with skill: ${requiredSkill}`);
    }

    // Select lowest-load agent
    const target = candidates[0];

    // Delegate via A2A for formal task execution
    return await this.a2aClient.sendTask({
      agentUrl: target.agentId,
      message: task.message
    });
  }
}
```

---

## 8. Security Best Practices

### 8.1 Transport Security

- **HTTPS Required**: All production deployments MUST use HTTPS
- **TLS Version**: TLS 1.2 or higher with strong cipher suites
- **Certificate Validation**: Validate server certificates against trusted CAs

### 8.2 Authentication Schemes

A2A supports multiple authentication schemes declared in Agent Cards:

```json
{
  "securitySchemes": [
    {
      "type": "apiKey",
      "name": "X-API-Key",
      "in": "header"
    },
    {
      "type": "http",
      "scheme": "bearer",
      "bearerFormat": "JWT"
    },
    {
      "type": "oauth2",
      "flows": {
        "clientCredentials": {
          "tokenUrl": "https://auth.example.com/oauth/token",
          "scopes": {
            "agent:read": "Read agent data",
            "agent:write": "Modify agent data"
          }
        },
        "authorizationCode": {
          "authorizationUrl": "https://auth.example.com/authorize",
          "tokenUrl": "https://auth.example.com/oauth/token",
          "scopes": {
            "user:delegate": "Act on behalf of user"
          }
        }
      }
    },
    {
      "type": "openIdConnect",
      "openIdConnectUrl": "https://auth.example.com/.well-known/openid-configuration"
    },
    {
      "type": "mutualTLS"
    }
  ]
}
```

### 8.3 OAuth 2.0 Implementation

```typescript
// Client Credentials Flow (machine-to-machine)
async function getAccessToken(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  scopes: string[]
): Promise<string> {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: scopes.join(' ')
    })
  });

  const data = await response.json();
  return data.access_token;
}

// Using token with A2A request
async function sendAuthenticatedRequest(
  agentUrl: string,
  token: string,
  message: A2AMessage
) {
  return fetch(`${agentUrl}/a2a`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'A2A-Version': '0.3'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'message/send',
      params: { message }
    })
  });
}
```

### 8.4 Authorization Best Practices

1. **Skill-Level Access Control**: Map OAuth scopes to specific skills
2. **Principle of Least Privilege**: Grant only necessary permissions
3. **Token Lifetime**: Use short-lived tokens (15-60 minutes)
4. **Token Rotation**: Implement refresh token rotation
5. **Scope Validation**: Validate scopes before skill execution

```typescript
// Skill-level authorization middleware
function authorizeSkill(requiredScope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const decoded = jwt.verify(token, publicKey) as JWTPayload;

    if (!decoded.scope?.includes(requiredScope)) {
      return res.status(403).json({
        jsonrpc: '2.0',
        id: req.body.id,
        error: {
          code: -32003,
          message: `Insufficient permissions. Required scope: ${requiredScope}`
        }
      });
    }
    next();
  };
}
```

### 8.5 Security Checklist

- [ ] HTTPS enabled with TLS 1.2+
- [ ] Agent Cards do not contain static secrets
- [ ] OAuth tokens have appropriate lifetimes
- [ ] Skill-level authorization implemented
- [ ] Input validation on all message parts
- [ ] Rate limiting configured
- [ ] Audit logging enabled
- [ ] Sensitive data protected in transit and at rest

---

## 9. Enterprise Deployment Patterns

### 9.1 Observability

#### OpenTelemetry Integration

```typescript
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('a2a-agent');

async function handleA2ARequest(request: A2ARequest): Promise<A2AResponse> {
  // Extract trace context from incoming request
  const parentContext = propagator.extract(
    context.active(),
    request.headers
  );

  return await context.with(parentContext, async () => {
    const span = tracer.startSpan('a2a.message.process', {
      attributes: {
        'a2a.method': request.body.method,
        'a2a.task_id': request.body.params?.taskId,
        'a2a.context_id': request.body.params?.contextId
      }
    });

    try {
      const result = await processMessage(request);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

#### Metrics

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('a2a-agent');

const requestCounter = meter.createCounter('a2a.requests.total', {
  description: 'Total A2A requests received'
});

const requestDuration = meter.createHistogram('a2a.request.duration', {
  description: 'A2A request duration in milliseconds',
  unit: 'ms'
});

const activeTasksGauge = meter.createObservableGauge('a2a.tasks.active', {
  description: 'Number of active tasks'
});
```

### 9.2 API Gateway Integration

```yaml
# Kong Gateway A2A Plugin Configuration
plugins:
  - name: a2a-auth
    config:
      agent_card_path: /.well-known/agent.json
      oauth2_introspection_url: https://auth.example.com/introspect
      rate_limit: 100
      rate_limit_window: 60

  - name: a2a-routing
    config:
      skill_routes:
        - skill: flight-search
          upstream: travel-agent-svc
        - skill: hotel-booking
          upstream: travel-agent-svc
        - skill: analytics
          upstream: analytics-agent-svc
```

### 9.3 Data Protection

```typescript
// Data sensitivity classification
interface DataClassification {
  level: 'public' | 'internal' | 'confidential' | 'restricted';
  regulations: ('GDPR' | 'CCPA' | 'HIPAA')[];
  retention: string;          // ISO 8601 duration
  encryption: 'transit' | 'rest' | 'both';
}

// Message part with classification
interface ClassifiedPart extends Part {
  classification?: DataClassification;
}

// Enforcement middleware
function enforceDataProtection(part: ClassifiedPart): void {
  if (part.classification?.level === 'restricted') {
    // Ensure additional encryption
    // Log access for audit
    // Apply retention policies
  }
}
```

### 9.4 High Availability Architecture

```yaml
# Kubernetes deployment for HA
apiVersion: apps/v1
kind: Deployment
metadata:
  name: a2a-agent
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      containers:
        - name: agent
          image: my-a2a-agent:v1.0.0
          ports:
            - containerPort: 8080
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          readinessProbe:
            httpGet:
              path: /.well-known/agent.json
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 20
---
apiVersion: v1
kind: Service
metadata:
  name: a2a-agent
  labels:
    app: a2a-agent
    a2a.protocol.org/version: "0.3"
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 8080
  selector:
    app: a2a-agent
```

---

## 10. Code Examples

### 10.1 Python A2A Server

```python
"""
Complete A2A Server Implementation in Python
Using the official a2a-sdk
"""

from a2a.server import A2AServer
from a2a.types import (
    AgentCard,
    AgentSkill,
    AgentCapabilities,
    Message,
    Part,
    TextPart,
    Task,
    TaskStatus,
    Artifact
)
import uuid
from datetime import datetime

# Define skills
flight_search_skill = AgentSkill(
    id='flight-search',
    name='Flight Search',
    description='Search for available flights between destinations',
    tags=['travel', 'flights', 'booking'],
    examples=[
        'Find flights from NYC to LAX on March 15',
        'Search for round-trip flights to Tokyo'
    ],
    input_modes=['text/plain', 'application/json'],
    output_modes=['application/json']
)

hotel_booking_skill = AgentSkill(
    id='hotel-booking',
    name='Hotel Booking',
    description='Search and book hotel accommodations',
    tags=['travel', 'hotels'],
    examples=['Book a hotel in Paris for 3 nights']
)

# Define agent card
agent_card = AgentCard(
    name='Travel Booking Agent',
    description='AI agent for booking flights and hotels',
    url='http://localhost:8080',
    version='1.0.0',
    capabilities=AgentCapabilities(
        streaming=True,
        push_notifications=False,
        state_transition_history=True
    ),
    skills=[flight_search_skill, hotel_booking_skill],
    default_input_modes=['text/plain'],
    default_output_modes=['application/json'],
    supports_authenticated_extended_card=True
)


class TravelAgent:
    """Agent executor implementing business logic."""

    def __init__(self):
        self.tasks: dict[str, Task] = {}

    async def handle_message(self, message: Message, context_id: str = None) -> Task:
        """Process incoming message and return task."""
        task_id = str(uuid.uuid4())

        # Extract text from message
        text = ''
        for part in message.parts:
            if isinstance(part, TextPart):
                text = part.text
                break

        # Route to appropriate skill
        if 'flight' in text.lower():
            return await self._search_flights(task_id, text, context_id)
        elif 'hotel' in text.lower():
            return await self._search_hotels(task_id, text, context_id)
        else:
            return Task(
                id=task_id,
                context_id=context_id,
                status=TaskStatus.FAILED,
                error={'message': 'Unknown request type'}
            )

    async def _search_flights(
        self,
        task_id: str,
        query: str,
        context_id: str
    ) -> Task:
        """Search for flights."""
        # Simulate flight search
        flights = [
            {'airline': 'UA', 'flight': 'UA123', 'departure': '07:00', 'price': 299},
            {'airline': 'AA', 'flight': 'AA456', 'departure': '09:30', 'price': 279},
            {'airline': 'DL', 'flight': 'DL789', 'departure': '14:15', 'price': 319}
        ]

        artifact = Artifact(
            id=str(uuid.uuid4()),
            name='Flight Results',
            parts=[
                Part(type='data', data={'flights': flights, 'query': query})
            ]
        )

        return Task(
            id=task_id,
            context_id=context_id or str(uuid.uuid4()),
            status=TaskStatus.COMPLETED,
            artifacts=[artifact]
        )

    async def _search_hotels(
        self,
        task_id: str,
        query: str,
        context_id: str
    ) -> Task:
        """Search for hotels."""
        hotels = [
            {'name': 'Grand Hotel', 'rating': 4.5, 'price': 199},
            {'name': 'City Inn', 'rating': 4.0, 'price': 149},
            {'name': 'Luxury Suites', 'rating': 5.0, 'price': 399}
        ]

        artifact = Artifact(
            id=str(uuid.uuid4()),
            name='Hotel Results',
            parts=[
                Part(type='data', data={'hotels': hotels, 'query': query})
            ]
        )

        return Task(
            id=task_id,
            context_id=context_id or str(uuid.uuid4()),
            status=TaskStatus.COMPLETED,
            artifacts=[artifact]
        )


# Create and run server
if __name__ == '__main__':
    agent = TravelAgent()
    server = A2AServer(
        agent_card=agent_card,
        message_handler=agent.handle_message
    )
    server.run(host='0.0.0.0', port=8080)
```

### 10.2 TypeScript A2A Client

```typescript
/**
 * Complete A2A Client Implementation in TypeScript
 * Using @a2a/client SDK
 */

import { A2AClient, Message, Task, Part } from '@a2a/client';

interface FlightResult {
  airline: string;
  flight: string;
  departure: string;
  price: number;
}

interface HotelResult {
  name: string;
  rating: number;
  price: number;
}

class TravelBookingClient {
  private client: A2AClient;
  private contextId?: string;

  constructor(agentUrl: string, token?: string) {
    this.client = new A2AClient({
      baseUrl: agentUrl,
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
  }

  /**
   * Discover agent capabilities
   */
  async discoverAgent() {
    const agentCard = await this.client.getAgentCard();
    console.log('Agent:', agentCard.name);
    console.log('Version:', agentCard.version);
    console.log('Skills:', agentCard.skills.map(s => s.id));
    return agentCard;
  }

  /**
   * Search for flights
   */
  async searchFlights(
    from: string,
    to: string,
    date: string
  ): Promise<FlightResult[]> {
    const message: Message = {
      role: 'user',
      parts: [
        {
          type: 'text',
          text: `Find flights from ${from} to ${to} on ${date}`
        }
      ]
    };

    const task = await this.client.sendMessage({
      message,
      contextId: this.contextId
    });

    // Store context for multi-turn
    this.contextId = task.contextId;

    if (task.status === 'completed' && task.artifacts?.length) {
      const data = task.artifacts[0].parts[0] as { type: 'data'; data: { flights: FlightResult[] } };
      return data.data.flights;
    }

    throw new Error(`Task failed: ${task.error?.message}`);
  }

  /**
   * Search for hotels with streaming
   */
  async searchHotelsStreaming(
    location: string,
    onUpdate: (partial: Partial<Task>) => void
  ): Promise<HotelResult[]> {
    const message: Message = {
      role: 'user',
      parts: [
        {
          type: 'text',
          text: `Find hotels in ${location}`
        }
      ]
    };

    return new Promise((resolve, reject) => {
      this.client.streamMessage({
        message,
        contextId: this.contextId,
        onStatusUpdate: (status) => {
          console.log('Status:', status);
          onUpdate({ status });
        },
        onArtifactUpdate: (artifact) => {
          console.log('Artifact chunk:', artifact.id);
          onUpdate({ artifacts: [artifact] });
        },
        onComplete: (task) => {
          this.contextId = task.contextId;
          if (task.artifacts?.length) {
            const data = task.artifacts[0].parts[0] as { type: 'data'; data: { hotels: HotelResult[] } };
            resolve(data.data.hotels);
          } else {
            reject(new Error('No results'));
          }
        },
        onError: (error) => {
          reject(error);
        }
      });
    });
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<Task> {
    return this.client.getTask(taskId);
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId: string): Promise<void> {
    await this.client.cancelTask(taskId);
  }
}

// Usage example
async function main() {
  const client = new TravelBookingClient(
    'https://travel-agent.example.com',
    process.env.A2A_TOKEN
  );

  // Discover capabilities
  const agent = await client.discoverAgent();
  console.log('Connected to:', agent.name);

  // Search flights
  const flights = await client.searchFlights('NYC', 'LAX', '2026-03-15');
  console.log('Found flights:', flights);

  // Search hotels with streaming
  const hotels = await client.searchHotelsStreaming('Los Angeles', (update) => {
    console.log('Update received:', update);
  });
  console.log('Found hotels:', hotels);
}

main().catch(console.error);
```

### 10.3 A2A Server with OAuth 2.0 (Node.js)

```typescript
/**
 * A2A Server with OAuth 2.0 Authentication
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { A2AServer, AgentCard, SecurityScheme } from '@a2a/server';

const app = express();
app.use(express.json());

// OAuth 2.0 configuration
const OAUTH_CONFIG = {
  issuer: 'https://auth.example.com',
  audience: 'a2a-travel-agent',
  jwksUri: 'https://auth.example.com/.well-known/jwks.json'
};

// Security schemes for Agent Card
const securitySchemes: SecurityScheme[] = [
  {
    type: 'oauth2',
    flows: {
      clientCredentials: {
        tokenUrl: 'https://auth.example.com/oauth/token',
        scopes: {
          'travel:read': 'Read travel data',
          'travel:book': 'Make bookings',
          'travel:cancel': 'Cancel bookings'
        }
      }
    }
  },
  {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT'
  }
];

// Agent Card with security
const agentCard: AgentCard = {
  name: 'Secure Travel Agent',
  description: 'OAuth 2.0 protected travel booking agent',
  url: 'https://travel-agent.example.com',
  version: '2.0.0',
  capabilities: {
    streaming: true,
    pushNotifications: true
  },
  skills: [
    {
      id: 'flight-search',
      name: 'Flight Search',
      description: 'Search flights',
      securityScopes: ['travel:read']
    },
    {
      id: 'flight-book',
      name: 'Flight Booking',
      description: 'Book flights',
      securityScopes: ['travel:book']
    }
  ],
  securitySchemes,
  supportsAuthenticatedExtendedCard: true
};

// JWT verification middleware
async function verifyToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      jsonrpc: '2.0',
      id: req.body?.id,
      error: {
        code: -32001,
        message: 'Authentication required'
      }
    });
  }

  const token = authHeader.slice(7);

  try {
    // In production, use JWKS validation
    const decoded = jwt.verify(token, process.env.JWT_PUBLIC_KEY!, {
      issuer: OAUTH_CONFIG.issuer,
      audience: OAUTH_CONFIG.audience
    });

    (req as any).auth = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      jsonrpc: '2.0',
      id: req.body?.id,
      error: {
        code: -32002,
        message: 'Invalid or expired token'
      }
    });
  }
}

// Scope verification middleware
function requireScope(scope: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const auth = (req as any).auth;
    const scopes = auth?.scope?.split(' ') || [];

    if (!scopes.includes(scope)) {
      return res.status(403).json({
        jsonrpc: '2.0',
        id: req.body?.id,
        error: {
          code: -32003,
          message: `Insufficient permissions. Required scope: ${scope}`
        }
      });
    }

    next();
  };
}

// Public endpoint: Agent Card
app.get('/.well-known/agent.json', (req, res) => {
  res.json(agentCard);
});

// Protected endpoint: Extended Agent Card
app.get('/agent/card', verifyToken, (req, res) => {
  // Return extended card with additional details
  res.json({
    ...agentCard,
    extended: {
      rateLimits: {
        requestsPerMinute: 100,
        requestsPerDay: 10000
      },
      supportContact: 'support@example.com'
    }
  });
});

// A2A endpoint with authentication
app.post('/a2a', verifyToken, async (req, res) => {
  const { method, params, id } = req.body;

  // Route based on method and required scopes
  switch (method) {
    case 'message/send':
      // Determine required scope from message content
      const text = params?.message?.parts?.[0]?.text?.toLowerCase() || '';

      if (text.includes('book') || text.includes('reserve')) {
        return requireScope('travel:book')(req, res, () => handleMessage(req, res));
      } else {
        return requireScope('travel:read')(req, res, () => handleMessage(req, res));
      }

    case 'tasks/get':
      return requireScope('travel:read')(req, res, () => handleGetTask(req, res));

    case 'tasks/cancel':
      return requireScope('travel:cancel')(req, res, () => handleCancelTask(req, res));

    default:
      res.status(400).json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`
        }
      });
  }
});

async function handleMessage(req: express.Request, res: express.Response) {
  // Implementation
  res.json({
    jsonrpc: '2.0',
    id: req.body.id,
    result: {
      task: {
        id: 'task-123',
        status: 'completed',
        artifacts: []
      }
    }
  });
}

async function handleGetTask(req: express.Request, res: express.Response) {
  // Implementation
}

async function handleCancelTask(req: express.Request, res: express.Response) {
  // Implementation
}

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`A2A Server running on port ${PORT}`);
  console.log(`Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
});
```

### 10.4 A2A + MCP Hybrid Agent

```typescript
/**
 * Hybrid Agent using both A2A and MCP protocols
 */

import { A2AClient, Task, Message } from '@a2a/client';
import { MCPClient, Tool } from '@anthropic/mcp-client';

interface AnalysisResult {
  summary: string;
  confidence: number;
  details: Record<string, any>;
}

class HybridAnalysisAgent {
  private a2aClients: Map<string, A2AClient> = new Map();
  private mcpClient: MCPClient;

  constructor(mcpServerUrl: string) {
    this.mcpClient = new MCPClient({ serverUrl: mcpServerUrl });
  }

  /**
   * Register peer agents for A2A communication
   */
  async registerPeerAgent(name: string, agentUrl: string) {
    const client = new A2AClient({ baseUrl: agentUrl });
    const card = await client.getAgentCard();
    console.log(`Registered peer: ${card.name} (${card.skills.map(s => s.id).join(', ')})`);
    this.a2aClients.set(name, client);
  }

  /**
   * Perform analysis using MCP tools and A2A collaboration
   */
  async analyzeData(data: Record<string, any>): Promise<AnalysisResult> {
    // Step 1: Use MCP to access local tools
    const preprocessed = await this.mcpClient.invoke('preprocess_data', { data });

    // Step 2: Use MCP to run local analysis
    const localAnalysis = await this.mcpClient.invoke('analyze', {
      data: preprocessed.result
    });

    // Step 3: Delegate to specialist agent via A2A
    const specialistClient = this.a2aClients.get('data-specialist');
    if (specialistClient) {
      const expertTask = await specialistClient.sendMessage({
        message: {
          role: 'user',
          parts: [
            {
              type: 'data',
              data: {
                request: 'deep_analysis',
                localFindings: localAnalysis.result,
                rawData: preprocessed.result
              }
            }
          ]
        }
      });

      if (expertTask.status === 'completed') {
        // Step 4: Use MCP to combine results
        const combined = await this.mcpClient.invoke('merge_analysis', {
          local: localAnalysis.result,
          expert: expertTask.artifacts?.[0]?.parts[0]
        });

        return combined.result as AnalysisResult;
      }
    }

    // Fallback to local analysis only
    return localAnalysis.result as AnalysisResult;
  }

  /**
   * Orchestrate multi-agent workflow
   */
  async orchestrateWorkflow(
    workflowId: string,
    steps: Array<{ agent: string; action: string; input: any }>
  ): Promise<Map<string, any>> {
    const results = new Map<string, any>();

    for (const step of steps) {
      const client = this.a2aClients.get(step.agent);
      if (!client) {
        throw new Error(`Unknown agent: ${step.agent}`);
      }

      // Check if step needs results from previous steps
      const resolvedInput = this.resolveInputReferences(step.input, results);

      const task = await client.sendMessage({
        message: {
          role: 'user',
          parts: [
            { type: 'text', text: step.action },
            { type: 'data', data: resolvedInput }
          ]
        }
      });

      if (task.status !== 'completed') {
        throw new Error(`Step failed: ${step.agent}/${step.action}`);
      }

      results.set(`${step.agent}.${step.action}`, task.artifacts);
    }

    return results;
  }

  private resolveInputReferences(
    input: any,
    results: Map<string, any>
  ): any {
    if (typeof input === 'string' && input.startsWith('$ref:')) {
      const ref = input.slice(5);
      return results.get(ref);
    }

    if (typeof input === 'object' && input !== null) {
      const resolved: Record<string, any> = {};
      for (const [key, value] of Object.entries(input)) {
        resolved[key] = this.resolveInputReferences(value, results);
      }
      return resolved;
    }

    return input;
  }
}

// Usage
async function main() {
  const agent = new HybridAnalysisAgent('http://localhost:3000/mcp');

  // Register peer agents
  await agent.registerPeerAgent('data-specialist', 'https://data-agent.example.com');
  await agent.registerPeerAgent('validator', 'https://validator-agent.example.com');

  // Simple analysis
  const result = await agent.analyzeData({
    type: 'sales',
    period: '2026-Q1',
    metrics: ['revenue', 'growth', 'churn']
  });

  console.log('Analysis result:', result);

  // Complex workflow
  const workflowResults = await agent.orchestrateWorkflow('quarterly-report', [
    { agent: 'data-specialist', action: 'extract', input: { source: 'database' } },
    { agent: 'data-specialist', action: 'transform', input: '$ref:data-specialist.extract' },
    { agent: 'validator', action: 'validate', input: '$ref:data-specialist.transform' }
  ]);

  console.log('Workflow results:', workflowResults);
}

main();
```

---

## 11. Sources

### Official Documentation
- [A2A Protocol Official Site](https://a2a-protocol.org/latest/)
- [A2A Protocol Specification (DRAFT v1.0)](https://a2a-protocol.org/latest/specification/)
- [A2A GitHub Repository](https://github.com/a2aproject/A2A)
- [Google Developers Blog - Announcing A2A](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)
- [Google Cloud Blog - A2A Protocol Upgrade](https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade)
- [A2A Python Quickstart Tutorial](https://a2a-protocol.org/latest/tutorials/python/1-introduction/)
- [A2A Agent Skills & Agent Card](https://a2a-protocol.org/latest/tutorials/python/3-agent-skills-and-card/)
- [A2A Key Concepts](https://a2a-protocol.org/latest/topics/key-concepts/)
- [A2A Agent Discovery](https://a2a-protocol.org/latest/topics/agent-discovery/)
- [A2A Enterprise Features](https://a2a-protocol.org/latest/topics/enterprise-ready/)
- [A2A and MCP Comparison](https://a2a-protocol.org/latest/topics/a2a-and-mcp/)

### Industry Analysis
- [IBM - What Is Agent2Agent Protocol?](https://www.ibm.com/think/topics/agent2agent-protocol)
- [InfoQ - Google Open-Sources A2A Protocol](https://www.infoq.com/news/2025/04/google-agentic-a2a/)
- [Linux Foundation - A2A Protocol Launch](https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents)
- [Google Developers Blog - Agents, ADK, and A2A Enhancements](https://developers.googleblog.com/agents-adk-agent-engine-a2a-enhancements-google-io/)

### Protocol Comparisons
- [TrueFoundry - MCP vs A2A Key Differences](https://www.truefoundry.com/blog/mcp-vs-a2a)
- [Clarifai - MCP vs A2A Clearly Explained](https://www.clarifai.com/blog/mcp-vs-a2a-clearly-explained)
- [Auth0 - MCP vs A2A Guide](https://auth0.com/blog/mcp-vs-a2a/)
- [Stride - A2A vs MCP When to Use Which](https://www.stride.build/blog/agent-to-agent-a2a-vs-model-context-protocol-mcp-when-to-use-which)
- [Analytics Vidhya - A2A vs MCP vs AP2](https://www.analyticsvidhya.com/blog/2025/10/a2a-vs-mcp-vs-ap2/)
- [Composio - MCP vs A2A Everything You Need to Know](https://composio.dev/blog/mcp-vs-a2a-everything-you-need-to-know)
- [Logto - A2A and MCP Complementary Protocols](https://blog.logto.io/a2a-mcp)

### Implementation Guides
- [A2A Protocol TypeScript Guide](https://a2aprotocol.ai/blog/a2a-typescript-guide)
- [Apono - What is A2A Protocol and How to Adopt it](https://www.apono.io/blog/what-is-agent2agent-a2a-protocol-and-how-to-adopt-it/)
- [Google Codelabs - Getting Started with A2A](https://codelabs.developers.google.com/intro-a2a-purchasing-concierge)
- [LangChain A2A Endpoint Documentation](https://docs.langchain.com/langsmith/server-a2a)
- [AWS Blog - Inter-Agent Communication on A2A](https://aws.amazon.com/blogs/opensource/open-protocols-for-agent-interoperability-part-4-inter-agent-communication-on-a2a/)
- [AWS Bedrock A2A Protocol Contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a-protocol-contract.html)
- [Python A2A Library](https://github.com/themanojdesai/python-a2a)
- [Google ADK A2A Quickstart](https://google.github.io/adk-docs/a2a/quickstart-exposing/)

### Security
- [Auth0 - Secure A2A Authentication with Google Cloud](https://auth0.com/blog/auth0-google-a2a/)
- [Semgrep - Security Engineer's Guide to A2A](https://semgrep.dev/blog/2025/a-security-engineers-guide-to-the-a2a-protocol/)
- [Christian Posta - Configuring A2A OAuth User Delegation](https://blog.christianposta.com/setting-up-a2a-oauth-user-delegation/)
- [zBrain - A2A Protocol Security Best Practices](https://zbrain.ai/understanding-the-a2a-protocol/)
- [Medium - Securing A2A with Keycloak OAuth2](https://medium.com/google-cloud/how-to-secure-your-a2a-server-agent-with-keycloak-oauth2-6112810ec7bb)

### Agent Discovery
- [Solo.io - Agent Discovery, Naming, and Resolution](https://www.solo.io/blog/agent-discovery-naming-and-resolution---the-missing-pieces-to-a2a)
- [LAD-A2A - Local Agent Discovery](https://lad-a2a.org/)
- [GitHub Discussion - Agent Registry Proposal](https://github.com/a2aproject/A2A/discussions/741)
- [GitHub Issue - A2A Protocol Mesh Extension](https://github.com/a2aproject/A2A/issues/499)

### Gossip Protocols & Distributed Coordination
- [arXiv - Revisiting Gossip Protocols for Emergent Coordination](https://arxiv.org/html/2508.01531v1)
- [arXiv - Gossip-Enhanced Communication Substrate for Agentic AI](https://arxiv.org/html/2512.03285)
- [Fractal Analytics - Orchestrating Multi-Agent Systems with A2A](https://fractal.ai/blog/orchestrating-heterogeneous-and-distributed-multi-agent-systems-using-agent-to-agent-a2a-protocol)

### Additional Resources
- [Agent Card v1.0 Schema Specification](https://gist.github.com/SecureAgentTools/0815a2de9cc31c71468afd3d2eef260a)
- [HuggingFace - A2A Protocol Explained](https://huggingface.co/blog/1bo/a2a-protocol-explained)
- [GoCodeo - Inside A2A: How Google's Protocol Works](https://www.gocodeo.com/post/how-googles-agent2agent-protocol-actually-works)
- [Platform Engineering - Google Cloud A2A Standard](https://platformengineering.com/editorial-calendar/best-of-2025/google-cloud-unveils-agent2agent-protocol-a-new-standard-for-ai-agent-interoperability-2/)

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **A2A** | Agent-to-Agent Protocol - Open standard for AI agent interoperability |
| **MCP** | Model Context Protocol - Anthropic's standard for agent-to-tool communication |
| **Agent Card** | JSON metadata document describing agent identity, capabilities, and requirements |
| **Task** | Stateful unit of work with defined lifecycle (submitted, working, completed, etc.) |
| **Artifact** | Concrete output generated during task processing |
| **Part** | Content container within messages (TextPart, FilePart, DataPart) |
| **Skill** | Discrete capability or function an agent can perform |
| **Context** | Logical grouping of related tasks across interactions |
| **Gossip Protocol** | Decentralized communication mechanism using epidemic-style information spread |
| **SSE** | Server-Sent Events - HTTP-based real-time streaming |
| **JSON-RPC** | Remote procedure call protocol encoded in JSON |

---

## Appendix B: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-30 | Initial research report |

---

*This research report was generated by the Agentic QE Research Agent. For updates and corrections, please submit issues to the project repository.*
