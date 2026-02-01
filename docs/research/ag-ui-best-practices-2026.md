# AG-UI Protocol Best Practices Research Report (2025-2026)

**Research Date:** January 30, 2026
**Author:** Research Agent
**Version:** 1.0

---

## Executive Summary

AG-UI (Agent-User Interaction Protocol) is an open, lightweight, event-based protocol that standardizes real-time communication between AI agents and frontend applications. Introduced by the CopilotKit team in May 2025, AG-UI has rapidly gained adoption across the agentic ecosystem, with integrations from Microsoft, Google, Oracle, LangGraph, CrewAI, and Pydantic AI.

This research report analyzes current best practices for implementing AG-UI, covering the protocol specification, event taxonomy, transport mechanisms, state management, and production implementation patterns.

---

## Table of Contents

1. [Protocol Specification](#1-protocol-specification)
2. [Event Types Taxonomy](#2-event-types-taxonomy)
3. [State Management](#3-state-management)
4. [Transport Layer: SSE vs WebSocket](#4-transport-layer-sse-vs-websocket)
5. [Backpressure and Cancellation Patterns](#5-backpressure-and-cancellation-patterns)
6. [Human-in-the-Loop Workflows](#6-human-in-the-loop-workflows)
7. [Frontend Tools and Generative UI](#7-frontend-tools-and-generative-ui)
8. [Implementation Patterns](#8-implementation-patterns)
9. [SDK Usage](#9-sdk-usage)
10. [Real-World Implementations](#10-real-world-implementations)
11. [AG-UI vs MCP Comparison](#11-ag-ui-vs-mcp-comparison)
12. [Best Practices Summary](#12-best-practices-summary)
13. [Sources](#13-sources)

---

## 1. Protocol Specification

### Overview

AG-UI is an event-driven protocol that replaces the traditional Request-Response (RPC) model with an Event-Sourcing model. Instead of waiting for a final answer, agents send a continuous stream of events describing their actions in real-time.

**Protocol Version:** AG-UI/1.0 (released May 2025)

### Core Design Principles

1. **Event-Driven Architecture**: Lightweight event frames transmitted over standard HTTP transports
2. **Transport Agnostic**: Works with SSE, WebSockets, webhooks, or custom transports
3. **Bidirectional Communication**: Supports both agent-to-UI and UI-to-agent data flow
4. **Framework Agnostic**: Compatible with any agent backend (OpenAI, LangGraph, CrewAI, etc.)

### Protocol Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend Application                    │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ UI Renderer │  │ State Store  │  │ Event Processor    │ │
│  └─────────────┘  └──────────────┘  └────────────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          │ AG-UI Event Stream
                          │ (SSE / WebSocket / HTTP)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      Agent Backend                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ LLM Engine  │  │ Tool Runtime │  │ Event Emitter      │ │
│  └─────────────┘  └──────────────┘  └────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **Streaming Chat** | Live token and event streaming for responsive multi-turn sessions |
| **Multimodal Attachments** | Files, images, audio, transcripts with type safety |
| **Shared State** | Bidirectional synchronization with event-sourced diffs |
| **Tool Execution** | Client-side and server-side tool calls with streaming results |
| **Human-in-the-Loop** | Pause, approve, edit, retry, or escalate mid-flow |
| **Generative UI** | Agent-driven UI component rendering |

---

## 2. Event Types Taxonomy

AG-UI defines **19 standardized event types** organized into five categories:

### 2.1 Lifecycle Events

Control the flow and status of agent runs.

```typescript
enum EventType {
  RUN_STARTED = "RUN_STARTED",
  RUN_FINISHED = "RUN_FINISHED",
  RUN_ERROR = "RUN_ERROR",
  STEP_STARTED = "STEP_STARTED",
  STEP_FINISHED = "STEP_FINISHED"
}
```

| Event | Purpose | Key Fields |
|-------|---------|------------|
| `RUN_STARTED` | Initiates agent run | `threadId`, `runId`, `input` |
| `RUN_FINISHED` | Marks completion | `result`, `outcome` ("success" or "interrupt") |
| `RUN_ERROR` | Reports failures | `message`, `code` |
| `STEP_STARTED` | Begins sub-step | `stepId`, `name` |
| `STEP_FINISHED` | Completes sub-step | `stepId`, `result` |

### 2.2 Text Message Events

Stream generated text in real-time for the "typing" effect.

```typescript
// Event flow: START -> CONTENT* -> END
interface TextMessageStartEvent {
  type: "TEXT_MESSAGE_START";
  messageId: string;
  role: "assistant";
}

interface TextMessageContentEvent {
  type: "TEXT_MESSAGE_CONTENT";
  messageId: string;
  delta: string;  // Incremental text chunk
}

interface TextMessageEndEvent {
  type: "TEXT_MESSAGE_END";
  messageId: string;
}
```

**Example Event Sequence:**

```json
{"type": "TEXT_MESSAGE_START", "messageId": "msg_001", "role": "assistant"}
{"type": "TEXT_MESSAGE_CONTENT", "messageId": "msg_001", "delta": "Hello, "}
{"type": "TEXT_MESSAGE_CONTENT", "messageId": "msg_001", "delta": "how can "}
{"type": "TEXT_MESSAGE_CONTENT", "messageId": "msg_001", "delta": "I help you?"}
{"type": "TEXT_MESSAGE_END", "messageId": "msg_001"}
```

### 2.3 Tool Call Events

Report calls to external tools or APIs and stream their results.

```typescript
interface ToolCallStartEvent {
  type: "TOOL_CALL_START";
  toolCallId: string;
  toolCallName: string;
  parentMessageId?: string;
}

interface ToolCallArgsEvent {
  type: "TOOL_CALL_ARGS";
  toolCallId: string;
  delta: string;  // Streamed argument JSON
}

interface ToolCallEndEvent {
  type: "TOOL_CALL_END";
  toolCallId: string;
}

interface ToolCallResultEvent {
  type: "TOOL_CALL_RESULT";
  toolCallId: string;
  content: string;
  messageId: string;
}
```

**Key Insight:** AG-UI can stream tool arguments, allowing UIs to pre-fill forms before the agent finishes speaking.

### 2.4 State Management Events

Synchronize shared application state between agent and UI.

```typescript
interface StateSnapshotEvent {
  type: "STATE_SNAPSHOT";
  state: Record<string, unknown>;  // Complete state
}

interface StateDeltaEvent {
  type: "STATE_DELTA";
  delta: JsonPatchOperation[];  // RFC 6902 operations
}

interface MessagesSnapshotEvent {
  type: "MESSAGES_SNAPSHOT";
  messages: Message[];
}

interface ActivitySnapshotEvent {
  type: "ACTIVITY_SNAPSHOT";
  activity: ActivityMessage[];
  replace?: boolean;
}

interface ActivityDeltaEvent {
  type: "ACTIVITY_DELTA";
  delta: JsonPatchOperation[];
}
```

### 2.5 Special Events

```typescript
interface RawEvent {
  type: "RAW";
  event: unknown;
  source?: string;
}

interface CustomEvent {
  type: "CUSTOM";
  name: string;
  value: unknown;
}
```

---

## 3. State Management

### Bidirectional Synchronization

AG-UI state management enables real-time synchronization through a structured data object that:

- **Persists** across interactions within a thread
- **Shared** between agents and frontends
- **Synchronized** in real-time via events

### Two Synchronization Methods

#### 1. STATE_SNAPSHOT (Full Refresh)

Use for:
- Initial state hydration
- After connection recovery
- Major state changes

```typescript
// Server emits full state
emit({
  type: "STATE_SNAPSHOT",
  state: {
    user: { name: "Alice", preferences: {} },
    conversation: { topic: "Weather", turns: 5 },
    ui: { theme: "dark", sidebar: "collapsed" }
  }
});
```

**Client Behavior:** Replace existing state model entirely.

#### 2. STATE_DELTA (Incremental Updates)

Use for:
- Frequent small updates
- Large state objects
- Bandwidth-sensitive scenarios

```typescript
// Server emits RFC 6902 JSON Patch
emit({
  type: "STATE_DELTA",
  delta: [
    { op: "replace", path: "/conversation/turns", value: 6 },
    { op: "add", path: "/user/preferences/theme", value: "dark" }
  ]
});
```

### JSON Patch Operations (RFC 6902)

| Operation | Description | Example |
|-----------|-------------|---------|
| `add` | Insert value | `{ op: "add", path: "/items/-", value: "new" }` |
| `replace` | Overwrite value | `{ op: "replace", path: "/count", value: 42 }` |
| `remove` | Delete value | `{ op: "remove", path: "/temp" }` |
| `move` | Relocate value | `{ op: "move", from: "/a", path: "/b" }` |
| `copy` | Duplicate value | `{ op: "copy", from: "/a", path: "/b" }` |
| `test` | Validate value | `{ op: "test", path: "/version", value: 1 }` |

### Implementation Best Practices

```typescript
import { applyPatch } from "fast-json-patch";

class StateManager {
  private state: Record<string, unknown> = {};

  handleEvent(event: StateEvent) {
    switch (event.type) {
      case "STATE_SNAPSHOT":
        // Full replacement
        this.state = structuredClone(event.state);
        break;

      case "STATE_DELTA":
        // Atomic patch application
        const result = applyPatch(
          this.state,
          event.delta,
          false,  // Don't mutate original
          true    // Validate operations
        );
        if (result.every(r => r === null)) {
          this.state = result.newDocument;
        } else {
          // Request fresh snapshot on error
          this.requestSnapshot();
        }
        break;
    }
  }
}
```

---

## 4. Transport Layer: SSE vs WebSocket

AG-UI is transport-agnostic. Choose based on your requirements:

### Server-Sent Events (SSE)

**Characteristics:**
- Unidirectional (server to client)
- Built on HTTP/1.1 and HTTP/2
- Automatic reconnection
- Text-only data

**Best For:**
- Simple streaming scenarios
- Firewall-restricted environments
- Read-heavy applications

```typescript
// SSE Client Implementation
const eventSource = new EventSource("/agent/stream", {
  headers: { Authorization: `Bearer ${token}` }
});

eventSource.onmessage = (event) => {
  const agEvent = JSON.parse(event.data);
  processAGUIEvent(agEvent);
};

eventSource.onerror = () => {
  // Auto-reconnect is built-in
  console.log("Reconnecting...");
};
```

### WebSocket

**Characteristics:**
- Bidirectional (full-duplex)
- Custom protocol (ws://)
- Manual reconnection required
- Binary and text data

**Best For:**
- Chat applications
- Real-time collaboration
- Binary data streaming
- Client-to-server communication beyond initial request

```typescript
// WebSocket Client Implementation
const ws = new WebSocket("wss://api.example.com/agent");

ws.onmessage = (event) => {
  const agEvent = JSON.parse(event.data);
  processAGUIEvent(agEvent);
};

ws.onclose = () => {
  // Manual reconnection with exponential backoff
  setTimeout(() => reconnect(), backoff);
};
```

### Comparison Table

| Aspect | SSE | WebSocket |
|--------|-----|-----------|
| **Direction** | Server -> Client | Bidirectional |
| **Protocol** | HTTP | Custom (ws://) |
| **Reconnection** | Automatic | Manual |
| **Data Types** | Text only | Text + Binary |
| **Firewall Friendly** | Yes | Often blocked |
| **Complexity** | Low | Medium |
| **AG-UI Fit** | Default choice | When bidirectional needed |

### Recommendation

**Start with SSE** for most AG-UI implementations. SSE provides 80% of the functionality with 20% of the complexity. Upgrade to WebSocket only when you need:
- Bidirectional communication beyond the initial request
- Binary data streaming (audio, video)
- Mobile optimization at scale (100K+ users)

---

## 5. Backpressure and Cancellation Patterns

### Client Interrupts

AG-UI supports native interrupt/resume sequences for human-in-the-loop workflows:

```typescript
// Agent signals interrupt
emit({
  type: "RUN_FINISHED",
  outcome: "interrupt",
  interrupt: {
    id: "int_001",
    reason: "human_approval",
    payload: {
      action: "send_email",
      recipient: "user@example.com",
      content: "Draft email content..."
    }
  }
});

// Client resumes with decision
const response = await agent.runAgent({
  threadId: originalThreadId,
  resume: {
    interruptId: "int_001",
    payload: { approved: true, modifications: null }
  }
});
```

### Cancellation Pattern

```typescript
// Client-side cancellation
const controller = new AbortController();

const run = agent.runAgent({
  messages: [...],
  signal: controller.signal
});

// User clicks "Stop"
cancelButton.onclick = () => {
  controller.abort();
  // Server receives abort, emits RUN_ERROR or graceful termination
};
```

### Backpressure Handling

**Problem:** Fast agents can overwhelm slow clients.

**Solutions:**

1. **Streaming Backpressure (Default)**
```typescript
// AI SDK approach - consume stream to prevent backpressure
import { consumeStream } from "@ai-sdk/core";

const result = await streamText({ model, messages });

// Consume stream even if client disconnects
consumeStream(result.toDataStream());
```

2. **Token Buffering**
```typescript
class TokenBuffer {
  private buffer: string[] = [];
  private flushInterval = 50; // ms

  add(token: string) {
    this.buffer.push(token);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (!this.pending) {
      this.pending = setTimeout(() => {
        const batch = this.buffer.join("");
        this.buffer = [];
        this.emit(batch);
        this.pending = null;
      }, this.flushInterval);
    }
  }
}
```

3. **Client-Side Rate Limiting**
```typescript
// Debounce rapid state updates
const debouncedStateUpdate = debounce((state) => {
  renderUI(state);
}, 16); // ~60fps

eventSource.onmessage = (event) => {
  const agEvent = JSON.parse(event.data);
  if (agEvent.type === "STATE_DELTA") {
    debouncedStateUpdate(applyPatch(state, agEvent.delta));
  }
};
```

---

## 6. Human-in-the-Loop Workflows

### Use Cases

1. **Approval Gates**: Pause before sensitive operations (payments, deletions)
2. **Information Gathering**: Request additional context mid-execution
3. **Policy Enforcement**: Compliance-triggered pauses
4. **Error Recovery**: Human guidance on failures

### Implementation Pattern

```typescript
// Server-side: Emit interrupt for approval
async function executeWithApproval(action: Action) {
  if (action.requiresApproval) {
    emit({
      type: "RUN_FINISHED",
      outcome: "interrupt",
      interrupt: {
        id: generateId(),
        reason: "requires_approval",
        payload: {
          action: action.name,
          description: action.description,
          risk: action.riskLevel
        }
      }
    });

    // Wait for resume
    const approval = await waitForResume();
    if (!approval.payload.approved) {
      throw new UserRejectedError();
    }
  }

  return await action.execute();
}
```

```tsx
// Client-side: Render approval UI
function ApprovalDialog({ interrupt, onRespond }) {
  return (
    <Dialog open>
      <DialogTitle>Approval Required</DialogTitle>
      <DialogContent>
        <p>Action: {interrupt.payload.action}</p>
        <p>Risk: {interrupt.payload.risk}</p>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onRespond({ approved: false })}>
          Reject
        </Button>
        <Button onClick={() => onRespond({ approved: true })}>
          Approve
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

### Microsoft Agent Framework Pattern

```csharp
// .NET implementation using ApprovalRequiredAIFunction
[AIFunction(ApprovalMode = "always_require")]
public async Task<string> DeleteRecord(string recordId)
{
    // Function marked for approval - AG-UI middleware
    // automatically converts to client tool call
    await _database.DeleteAsync(recordId);
    return $"Deleted record {recordId}";
}
```

---

## 7. Frontend Tools and Generative UI

### Frontend Tools

Frontend tools execute on the client side, allowing agents to interact with the user's local environment.

**Flow:**
1. Client registers tools with names/descriptions
2. Server orchestrates when to call (via TOOL_CALL events)
3. Client executes and returns results

```typescript
// Client-side tool registration
const tools = [
  {
    name: "navigate",
    description: "Navigate to a URL in the browser",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" }
      }
    },
    execute: async ({ url }) => {
      window.location.href = url;
      return { success: true };
    }
  },
  {
    name: "setTheme",
    description: "Change the application theme",
    parameters: {
      type: "object",
      properties: {
        theme: { enum: ["light", "dark"] }
      }
    },
    execute: async ({ theme }) => {
      document.body.dataset.theme = theme;
      return { applied: theme };
    }
  }
];

const agent = new HttpAgent({
  url: "/api/agent",
  tools
});
```

### Generative UI Types

#### 1. Static Generative UI
Pre-built components, agent selects which to use.

```tsx
// Agent decides to show WeatherCard
useCopilotAction({
  name: "showWeather",
  render: ({ args }) => (
    <WeatherCard
      location={args.location}
      temperature={args.temp}
    />
  )
});
```

#### 2. Declarative Generative UI (A2UI)
Agent describes UI structure, client renders.

```json
{
  "type": "TOOL_CALL_RESULT",
  "content": {
    "a2ui": {
      "type": "card",
      "title": "Weather Report",
      "children": [
        { "type": "text", "value": "72°F" },
        { "type": "icon", "name": "sunny" }
      ]
    }
  }
}
```

#### 3. Open-Ended Generative UI
Agent generates complete UI (HTML, React, etc.).

```typescript
// Agent generates arbitrary UI
emit({
  type: "CUSTOM",
  name: "render_component",
  value: {
    html: "<div class='chart'>...</div>",
    script: "initChart(data)"
  }
});
```

---

## 8. Implementation Patterns

### Python Backend with FastAPI

```python
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from ag_ui_protocol import RunAgentInput, EventEncoder, EventType
import openai

app = FastAPI()

@app.post("/agent")
async def agent_endpoint(input_data: RunAgentInput, request: Request):
    encoder = EventEncoder(accept=request.headers.get("accept"))

    async def generate_events():
        # Emit run started
        yield encoder.encode({
            "type": EventType.RUN_STARTED,
            "threadId": input_data.thread_id,
            "runId": input_data.run_id
        })

        # Stream from OpenAI
        message_id = f"msg_{uuid4()}"
        yield encoder.encode({
            "type": EventType.TEXT_MESSAGE_START,
            "messageId": message_id,
            "role": "assistant"
        })

        response = await openai.chat.completions.create(
            model="gpt-4",
            messages=transform_messages(input_data.messages),
            stream=True
        )

        async for chunk in response:
            if chunk.choices[0].delta.content:
                yield encoder.encode({
                    "type": EventType.TEXT_MESSAGE_CONTENT,
                    "messageId": message_id,
                    "delta": chunk.choices[0].delta.content
                })

        yield encoder.encode({
            "type": EventType.TEXT_MESSAGE_END,
            "messageId": message_id
        })

        yield encoder.encode({
            "type": EventType.RUN_FINISHED,
            "outcome": "success"
        })

    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream"
    )
```

### TypeScript Backend with Express

```typescript
import express from "express";
import { EventType, RunAgentInput, validateInput } from "@ag-ui/core";
import OpenAI from "openai";

const app = express();
const openai = new OpenAI();

app.post("/agent", async (req, res) => {
  const input: RunAgentInput = validateInput(req.body);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const emit = (event: object) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    emit({ type: EventType.RUN_STARTED, threadId: input.threadId });

    const messageId = `msg_${Date.now()}`;
    emit({
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: "assistant"
    });

    const stream = await openai.chat.completions.create({
      model: "gpt-4",
      messages: input.messages,
      stream: true
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        emit({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: content
        });
      }
    }

    emit({ type: EventType.TEXT_MESSAGE_END, messageId });
    emit({ type: EventType.RUN_FINISHED, outcome: "success" });

  } catch (error) {
    emit({
      type: EventType.RUN_ERROR,
      message: error.message,
      code: "INTERNAL_ERROR"
    });
  }

  res.end();
});
```

### React Frontend with @ag-ui/client

```tsx
import { HttpAgent } from "@ag-ui/client";
import { useState, useCallback } from "react";

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);

  const agent = new HttpAgent({
    url: "/api/agent",
    headers: { Authorization: `Bearer ${token}` }
  });

  const sendMessage = useCallback(async (content: string) => {
    const userMessage = { role: "user", content };
    setMessages(prev => [...prev, userMessage]);
    setStreaming(true);

    try {
      const result = await agent.runAgent({
        messages: [...messages, userMessage],
        onEvent: (event) => {
          switch (event.type) {
            case "TEXT_MESSAGE_START":
              setMessages(prev => [...prev, {
                id: event.messageId,
                role: "assistant",
                content: ""
              }]);
              break;

            case "TEXT_MESSAGE_CONTENT":
              setMessages(prev => prev.map(m =>
                m.id === event.messageId
                  ? { ...m, content: m.content + event.delta }
                  : m
              ));
              break;

            case "STATE_DELTA":
              // Apply state patches
              applyStateDelta(event.delta);
              break;
          }
        }
      });
    } finally {
      setStreaming(false);
    }
  }, [messages]);

  return (
    <div className="chat">
      <MessageList messages={messages} />
      <MessageInput onSend={sendMessage} disabled={streaming} />
    </div>
  );
}
```

---

## 9. SDK Usage

### @ag-ui/core

Core types and validation for AG-UI events.

```bash
npm install @ag-ui/core
```

```typescript
import { EventSchemas, EventType, Message, Tool } from "@ag-ui/core";

// Validate incoming events
const validated = EventSchemas.parse({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: "msg_123",
  delta: "Hello!"
});

// Type-safe message construction
const message: Message = {
  role: "user",
  content: "What's the weather?"
};
```

### @ag-ui/client

Client SDK for connecting to AG-UI servers.

```bash
npm install @ag-ui/client
```

```typescript
import { HttpAgent, FilterToolCallsMiddleware } from "@ag-ui/client";

const agent = new HttpAgent({
  url: "https://api.example.com/agent",
  headers: { Authorization: "Bearer token" }
});

// Add middleware
agent.use(
  // Logging middleware
  (input, next) => {
    console.log("Run started:", input.runId);
    return next.run(input);
  },
  // Filter allowed tools
  new FilterToolCallsMiddleware({
    allowedToolCalls: ["search", "calculate"]
  })
);

// Execute
const result = await agent.runAgent({
  messages: [{ role: "user", content: "Hello!" }]
});

console.log(result.newMessages);
```

### Python SDK

```bash
pip install ag-ui-protocol
```

```python
from ag_ui_protocol import (
    RunAgentInput,
    EventEncoder,
    EventType,
    Message
)

# Parse input
input_data = RunAgentInput.parse_obj(request_json)

# Encode events
encoder = EventEncoder(accept="text/event-stream")
event = encoder.encode({
    "type": EventType.TEXT_MESSAGE_CONTENT,
    "messageId": "msg_001",
    "delta": "Hello!"
})
```

---

## 10. Real-World Implementations

### Framework Integrations

| Framework | Integration Status | Documentation |
|-----------|-------------------|---------------|
| **CopilotKit** | Native (creator) | [copilotkit.ai/ag-ui](https://www.copilotkit.ai/ag-ui) |
| **LangGraph** | Official adapter | [docs.copilotkit.ai/langgraph](https://docs.copilotkit.ai/langgraph/) |
| **CrewAI** | Official adapter | [CopilotKit Blog](https://www.copilotkit.ai/blog/how-to-add-a-frontend-to-any-crewai-agent-using-ag-ui-protocol) |
| **Microsoft Agent Framework** | Official integration | [Microsoft Learn](https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/) |
| **Pydantic AI** | AGUIAdapter | [ai.pydantic.dev/ui/ag-ui](https://ai.pydantic.dev/ui/ag-ui/) |
| **Google ADK** | Middleware | [Google Blog](https://developers.googleblog.com/en/delight-users-by-combining-adk-agents-with-fancy-frontends-using-ag-ui/) |
| **Oracle Agent Spec** | Integration | [Oracle Blog](https://blogs.oracle.com/ai-and-datascience/announcing-ag-ui-integration-for-agent-spec) |

### Ecosystem Adoption

- **GitHub Repository**: 11.6k+ stars, 1.1k+ forks
- **Community Clients**: Kotlin, Java, Go, Rust, CLI
- **Production Usage**: Enterprises using CopilotKit for agent-powered applications

### Case Study: Stock Portfolio Agent

A complete AG-UI implementation example using LangGraph:

```python
# Backend: LangGraph agent with AG-UI events
from langgraph.graph import StateGraph
from ag_ui_protocol import EventEncoder, EventType

class PortfolioState(TypedDict):
    portfolio: dict
    messages: list

def analyze_portfolio(state: PortfolioState):
    # Emit state for frontend sync
    emit({
        "type": EventType.STATE_SNAPSHOT,
        "state": {"portfolio": state["portfolio"]}
    })

    # Analysis logic...
    return {"messages": [...]}

graph = StateGraph(PortfolioState)
graph.add_node("analyze", analyze_portfolio)
```

```tsx
// Frontend: React with CopilotKit
import { useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";

function PortfolioDashboard() {
  const [portfolio, setPortfolio] = useState({});

  // Sync state from agent
  useCopilotReadable({
    description: "Current portfolio holdings",
    value: portfolio
  });

  // Register UI action
  useCopilotAction({
    name: "showPortfolioChart",
    render: ({ args }) => (
      <PortfolioChart data={args.data} />
    )
  });

  return <div>...</div>;
}
```

---

## 11. AG-UI vs MCP Comparison

### Protocol Stack

```
┌─────────────────────────────────────────┐
│             User Interface              │
├─────────────────────────────────────────┤
│               AG-UI                     │  <- Agent <-> UI
├─────────────────────────────────────────┤
│               A2A                       │  <- Agent <-> Agent
├─────────────────────────────────────────┤
│               MCP                       │  <- Agent <-> Tools
├─────────────────────────────────────────┤
│           Agent Runtime                 │
└─────────────────────────────────────────┘
```

### Comparison

| Aspect | AG-UI | MCP |
|--------|-------|-----|
| **Purpose** | Agent-User communication | Agent-Tool/Data access |
| **Focus** | Real-time UI streaming | Context and capabilities |
| **Transport** | SSE, WebSocket, HTTP | JSON-RPC over stdio/HTTP |
| **Key Feature** | Event-sourced updates | Tool definitions |
| **Use Case** | Chat UIs, collaboration | Database queries, API calls |

### Complementary Usage

```
User Request
     │
     ▼
┌─────────┐    AG-UI Events     ┌────────────┐
│   UI    │◄──────────────────►│   Agent    │
└─────────┘                     └─────┬──────┘
                                      │
                               MCP Tool Calls
                                      │
                                      ▼
                               ┌────────────┐
                               │   Tools    │
                               │ (DB, APIs) │
                               └────────────┘
```

**Example Workflow:**
1. User asks about customer order (via AG-UI)
2. Agent streams "Looking up order..." (TEXT_MESSAGE_CONTENT)
3. Agent calls database tool (via MCP)
4. Agent streams results with state update (STATE_DELTA)
5. Agent generates chart UI (TOOL_CALL with A2UI payload)

---

## 12. Best Practices Summary

### Protocol Implementation

1. **Emit Lifecycle Events**: Always send RUN_STARTED/RUN_FINISHED
2. **Use Message IDs Consistently**: Link related events with messageId
3. **Prefer Deltas Over Snapshots**: Reduce bandwidth with STATE_DELTA
4. **Handle Errors Gracefully**: Emit RUN_ERROR with actionable messages

### Transport Selection

5. **Start with SSE**: Simpler, firewall-friendly, auto-reconnect
6. **Use WebSocket for Bidirectional**: Only when you need it
7. **Implement Reconnection Logic**: Exponential backoff for WebSocket

### State Management

8. **Apply Patches Atomically**: All-or-nothing patch application
9. **Request Snapshot on Error**: Recovery mechanism for inconsistencies
10. **Use fast-json-patch**: Proven RFC 6902 implementation

### Frontend Tools

11. **Register Tools Declaratively**: Clear names and descriptions
12. **Execute Locally, Report Results**: Client handles execution
13. **Support Generative UI**: Prepare for agent-driven components

### Human-in-the-Loop

14. **Design Clear Interrupt Payloads**: Include action details
15. **Preserve Thread Context**: Resume with same threadId
16. **Echo Interrupt IDs**: Required for proper correlation

### Error Handling

17. **Implement Exponential Backoff**: For retries and reconnection
18. **Distinguish Transient vs Persistent**: Different retry strategies
19. **Return Partial Results**: Graceful degradation on failures
20. **Log Events Verbosely**: AG-UI events are self-describing

### Testing

21. **Test Streaming Behavior**: Race conditions, timing issues
22. **Simulate Network Conditions**: 3G, corporate proxies, disconnects
23. **Load Test Concurrency**: 50+ tabs, multiple users

---

## 13. Sources

### Official Documentation

- [AG-UI Official Documentation](https://docs.ag-ui.com/)
- [AG-UI GitHub Repository](https://github.com/ag-ui-protocol/ag-ui)
- [CopilotKit AG-UI Page](https://www.copilotkit.ai/ag-ui)
- [AG-UI Events Reference](https://docs.ag-ui.com/sdk/js/core/events)
- [AG-UI State Management](https://docs.ag-ui.com/concepts/state)
- [AG-UI Build Quickstart](https://docs.ag-ui.com/quickstart/build)
- [AG-UI Interrupts Draft](https://docs.ag-ui.com/drafts/interrupts)

### Framework Integrations

- [Microsoft Agent Framework + AG-UI](https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/)
- [Pydantic AI + AG-UI](https://ai.pydantic.dev/ui/ag-ui/)
- [Google ADK + AG-UI](https://google.github.io/adk-docs/tools/third-party/ag-ui/)
- [CopilotKit LangGraph Integration](https://docs.copilotkit.ai/langgraph/)
- [Oracle Agent Spec + AG-UI](https://blogs.oracle.com/ai-and-datascience/announcing-ag-ui-integration-for-agent-spec)

### Tutorials and Guides

- [DataCamp: AG-UI Overview Tutorial](https://www.datacamp.com/tutorial/ag-ui)
- [CopilotKit: Introducing AG-UI](https://webflow.copilotkit.ai/blog/introducing-ag-ui-the-protocol-where-agents-meet-users)
- [CopilotKit: 17 AG-UI Event Types](https://www.copilotkit.ai/blog/master-the-17-ag-ui-event-types-for-building-agents-the-right-way)
- [CopilotKit: CrewAI + AG-UI](https://www.copilotkit.ai/blog/how-to-add-a-frontend-to-any-crewai-agent-using-ag-ui-protocol)
- [CopilotKit: LangGraph + AG-UI](https://www.copilotkit.ai/blog/build-a-fullstack-stock-portfolio-agent-with-langgraph-and-ag-ui)
- [Microsoft: Human-in-the-Loop with AG-UI](https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/human-in-the-loop)
- [Microsoft: Frontend Tool Rendering](https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/frontend-tools)

### Comparison Articles

- [CopilotKit: AG-UI vs MCP-UI vs A2A](https://www.copilotkit.ai/blog/the-state-of-agentic-ui-comparing-ag-ui-mcp-ui-and-a2ui-protocols)
- [DataGuy: AG-UI vs MCP vs A2A Protocol Stack](https://dataguy.in/artificial-intelligence/ai-agent-protocol-stack-mcp-a2a-ag-ui/)
- [A2A Protocol: Comparison Guide](https://a2aprotocol.ai/docs/guide/a2a-mcp-ag-ui)
- [AG-UI Docs: Agentic Protocols](https://docs.ag-ui.com/agentic-protocols)

### NPM Packages

- [@ag-ui/core on npm](https://www.npmjs.com/package/@ag-ui/core)
- [@ag-ui/client on npm](https://www.npmjs.com/package/@ag-ui/client)

### Community Resources

- [Medium: AG-UI Human-Agent Collaboration](https://medium.com/@jatingargiitk/ag-ui-the-interface-protocol-for-human-agent-collaboration-a93025ab327c)
- [Medium: AG-UI Frontend Protocol](https://medium.com/@roi235/ag-ui-when-the-frontend-got-an-ai-protocol-9223cf904fc4)
- [DEV.to: LangGraph + AG-UI Streaming Guide](https://dev.to/ajay_gupta_60a0393643f3e9/ag-ui-langgraph-streaming-technical-implementation-guide-kbl)
- [DeepWiki: AG-UI Protocol Analysis](https://deepwiki.com/ag-ui-protocol/ag-ui)

### Transport & Patterns

- [Ably: WebSockets vs SSE](https://ably.com/blog/websockets-vs-sse)
- [SoftwareMill: SSE vs WebSockets](https://softwaremill.com/sse-vs-websockets-comparing-real-time-communication-protocols/)
- [WebSocket.org: SSE Comparison](https://websocket.org/comparisons/sse/)
- [AI SDK: Backpressure Handling](https://ai-sdk.dev/docs/advanced/backpressure)

---

*Report generated: January 30, 2026*
*Protocol Version Analyzed: AG-UI/1.0*
