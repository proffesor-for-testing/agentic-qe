# A2UI (Agent-to-UI) Best Practices and Implementation Guide 2026

**Research Date:** January 30, 2026
**Author:** Agentic QE Research Team
**Version:** 1.0

---

## Executive Summary

A2UI (Agent-to-User Interface) is an open-source protocol developed by Google that enables AI agents to generate rich, interactive user interfaces through a declarative JSON format. Released publicly in December 2025 and currently at v0.8 (Public Preview), A2UI represents a paradigm shift in how AI agents communicate with frontend applications, moving from text-only responses to dynamic, native UI generation.

This research report covers the A2UI protocol specification, component catalog, accessibility compliance, rendering patterns, state synchronization, and interactive patterns based on the latest 2025-2026 developments.

---

## Table of Contents

1. [Protocol Specification](#1-protocol-specification)
2. [Core Architecture](#2-core-architecture)
3. [Component Catalog](#3-component-catalog)
4. [Message Types and Communication](#4-message-types-and-communication)
5. [Data Binding and State Management](#5-data-binding-and-state-management)
6. [Rendering Patterns](#6-rendering-patterns)
7. [State Synchronization with AG-UI](#7-state-synchronization-with-ag-ui)
8. [Accessibility Compliance](#8-accessibility-compliance)
9. [Interactive Patterns](#9-interactive-patterns)
10. [Security Model](#10-security-model)
11. [Implementation Examples](#11-implementation-examples)
12. [Best Practices](#12-best-practices)
13. [Production Deployments](#13-production-deployments)
14. [Ecosystem and Tooling](#14-ecosystem-and-tooling)
15. [Sources and References](#15-sources-and-references)

---

## 1. Protocol Specification

### 1.1 What is A2UI?

A2UI is a declarative UI protocol that allows AI agents to "speak UI." Instead of returning plain text or HTML, agents send structured JSON messages describing the *intent* of the UI. The client application then renders this using its own native component library.

**Key Definition from Google:**
> "A2UI is an open standard and set of libraries that allows agents to 'speak UI.' Agents send a declarative JSON format describing the intent of the UI. The client application then renders this using its own native component library (Flutter, Angular, Lit, etc.)."

### 1.2 Design Principles

| Principle | Description |
|-----------|-------------|
| **Security-First** | Declarative data format, not executable code. Agents can only use pre-approved components from the client's catalog. |
| **LLM-Friendly** | Flat component lists with ID references enable incremental generation and streaming. |
| **Framework-Agnostic** | Same JSON renders across Web, Flutter, React, Angular, SwiftUI, and more. |
| **Separation of Concerns** | Distinct layers for structure, state, and rendering. |

### 1.3 What A2UI Is NOT

- Not a UI framework
- Not an HTML replacement
- Not a robust styling system
- Not executable code

A2UI is specifically designed for agent-generated interfaces requiring multi-platform portability.

---

## 2. Core Architecture

### 2.1 Architectural Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   AI Agent      │────>│   Transport     │────>│   Client        │
│   (Gemini/LLM)  │     │   (A2A/AG-UI)   │     │   Renderer      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        │ Generate A2UI JSON                           │ Parse & Render
        │                                               │
        v                                               v
┌─────────────────┐                           ┌─────────────────┐
│  A2UI Response  │                           │  Native Widgets │
│  (JSON Payload) │                           │  (Platform UI)  │
└─────────────────┘                           └─────────────────┘
```

### 2.2 Processing Steps

1. **Generation**: Agent produces A2UI Response (JSON payload describing UI components)
2. **Transport**: Payload transmitted via A2A Protocol, AG-UI, SSE, or WebSockets
3. **Resolution**: Client renderer parses JSON and validates against schema
4. **Rendering**: Abstract component types map to native widget implementations

### 2.3 Key Concepts

| Concept | Description |
|---------|-------------|
| **Surfaces** | Canvases for component placement (dialogs, sidebars, main views) |
| **Components** | UI elements like Button, TextField, Card, DateTimeInput |
| **Data Model** | Application state supporting reactive component binding |
| **Messages** | JSON objects defining UI updates, data changes, and rendering instructions |
| **Catalog** | Client-defined registry of trusted, pre-approved UI components |

---

## 3. Component Catalog

### 3.1 Standard Component Categories

A2UI organizes components into four main categories:

#### Layout Components
Arrange other components spatially.

```json
{
  "id": "main-layout",
  "component": {
    "Column": {
      "children": {"explicitList": ["header", "content", "footer"]}
    }
  }
}
```

**Available:** `Row`, `Column`, `List`

#### Display Components
Show information to users.

```json
{
  "id": "greeting",
  "component": {
    "Text": {
      "text": {"literalString": "Welcome to the Dashboard"},
      "usageHint": "h1"
    }
  }
}
```

**Available:** `Text`, `Image`, `Icon`, `Video`, `Divider`

#### Interactive Components
Handle user input.

```json
{
  "id": "email-input",
  "component": {
    "TextField": {
      "label": {"literalString": "Email Address"},
      "value": {"path": "/user/email"},
      "inputType": "email"
    }
  }
}
```

**Available:** `Button`, `TextField`, `CheckBox`, `DateTimeInput`, `Slider`, `MultipleChoice`

#### Container Components
Group and organize content.

```json
{
  "id": "user-card",
  "component": {
    "Card": {
      "title": {"path": "/user/name"},
      "children": {"explicitList": ["avatar", "details", "actions"]}
    }
  }
}
```

**Available:** `Card`, `Tabs`, `Modal`, `Accordion`, `Panel`

### 3.2 Component Structure

Each component follows a consistent structure:

```json
{
  "id": "unique-component-id",
  "component": {
    "ComponentType": {
      "property1": {"literalString": "static value"},
      "property2": {"path": "/data/dynamic/value"},
      "children": {"explicitList": ["child1", "child2"]}
    }
  }
}
```

### 3.3 Adjacency List Model

A2UI uses a flat adjacency list rather than nested JSON trees. This design:

- Enables incremental LLM generation
- Simplifies updates to specific components
- Supports progressive rendering
- Allows easy component reordering

```json
{
  "surfaceUpdate": {
    "surfaceId": "main",
    "components": [
      {"id": "root", "component": {"Column": {"children": {"explicitList": ["greeting", "buttons"]}}}},
      {"id": "greeting", "component": {"Text": {"text": {"literalString": "Hello"}}}},
      {"id": "buttons", "component": {"Row": {"children": {"explicitList": ["btn-save", "btn-cancel"]}}}}
    ]
  }
}
```

### 3.4 Custom Components

Beyond the standard catalog, clients can define custom components:

```json
{
  "id": "stock-widget",
  "component": {
    "StockTicker": {
      "symbol": {"path": "/portfolio/selectedStock"},
      "showChart": true,
      "timeRange": "1D"
    }
  }
}
```

**Custom component examples:**
- Domain-specific widgets (stock tickers, medical charts, CAD viewers)
- Third-party integrations (Google Maps, payment forms)
- Data visualizations (charts, graphs, dashboards)

---

## 4. Message Types and Communication

### 4.1 Server-to-Client Messages

#### surfaceUpdate
Delivers component definitions as a flat adjacency list.

```json
{
  "surfaceUpdate": {
    "surfaceId": "booking-form",
    "components": [
      {
        "id": "datetime",
        "component": {
          "DateTimeInput": {
            "value": {"path": "/booking/date"},
            "enableDate": true,
            "enableTime": true
          }
        }
      },
      {
        "id": "submit-btn",
        "component": {
          "Button": {
            "label": {"literalString": "Book Now"},
            "action": {"name": "submit_booking"}
          }
        }
      }
    ]
  }
}
```

#### dataModelUpdate
Manages application state separately from structure.

```json
{
  "dataModelUpdate": {
    "surfaceId": "booking-form",
    "data": {
      "booking": {
        "date": "2026-02-15",
        "time": "14:00",
        "guests": 2
      }
    }
  }
}
```

#### beginRendering
Signals UI readiness with root component ID.

```json
{
  "beginRendering": {
    "surfaceId": "booking-form",
    "rootComponentId": "main-container",
    "catalogId": "standard-v1"
  }
}
```

#### deleteSurface
Removes UI regions.

```json
{
  "deleteSurface": {
    "surfaceId": "booking-form"
  }
}
```

### 4.2 Client-to-Server Messages

#### userAction
Reports user interactions with resolved data context.

```json
{
  "userAction": {
    "name": "submit_booking",
    "surfaceId": "booking-form",
    "sourceComponentId": "submit-btn",
    "timestamp": "2026-01-30T14:30:00Z",
    "context": {
      "booking": {
        "date": "2026-02-15",
        "time": "14:00",
        "guests": 2
      }
    }
  }
}
```

#### error
Communicates client-side failures.

```json
{
  "error": {
    "code": "COMPONENT_NOT_FOUND",
    "message": "Unknown component type: CustomWidget",
    "surfaceId": "main"
  }
}
```

---

## 5. Data Binding and State Management

### 5.1 BoundValue Types

A2UI separates UI structure from application state using JSON Pointers (RFC 6901).

#### Literal Values (Static)
```json
{
  "text": {"literalString": "Welcome to the app"}
}
```

#### Path Values (Dynamic)
```json
{
  "text": {"path": "/user/displayName"}
}
```

#### Combined (Initialize + Bind)
```json
{
  "value": {
    "path": "/settings/theme",
    "literalString": "light"
  }
}
```

### 5.2 Reactive Data Binding

When data at a path changes via `dataModelUpdate`, bound components automatically refresh:

```json
// Initial state
{
  "dataModelUpdate": {
    "surfaceId": "dashboard",
    "data": {
      "user": {"name": "Alice", "notifications": 5}
    }
  }
}

// Component binding
{
  "id": "notification-badge",
  "component": {
    "Text": {
      "text": {"path": "/user/notifications"}
    }
  }
}

// Update state - badge automatically updates
{
  "dataModelUpdate": {
    "surfaceId": "dashboard",
    "data": {
      "user": {"notifications": 12}
    }
  }
}
```

### 5.3 Children Management

#### Static Children (Explicit List)
```json
{
  "children": {"explicitList": ["header", "content", "footer"]}
}
```

#### Dynamic Children (Template)
```json
{
  "children": {
    "template": {
      "dataBinding": "/items",
      "componentId": "item-template"
    }
  }
}
```

---

## 6. Rendering Patterns

### 6.1 Native-First Approach

A2UI takes a "native-first" approach distinct from resource-fetching models:

> "Instead of retrieving an opaque payload to display in a sandbox, an A2UI agent sends a blueprint of native components. This allows the UI to inherit the host app's styling and accessibility features perfectly."

### 6.2 Supported Renderers

| Platform | Renderer | Status |
|----------|----------|--------|
| Web (Lit) | Web Components | Available |
| Angular | Angular Renderer | Available |
| Flutter | GenUI SDK | Available |
| React | React Renderer | Q1 2026 |
| SwiftUI | Swift Renderer | Planned |
| Jetpack Compose | Kotlin Renderer | Planned |

### 6.3 Web Rendering Example

```typescript
// Lit-based A2UI Renderer
import { A2UIRenderer } from '@a2ui/lit';

const renderer = new A2UIRenderer({
  catalog: standardCatalog,
  container: document.getElementById('app'),
  onAction: (action) => {
    // Send userAction back to agent
    agentConnection.send({
      userAction: action
    });
  }
});

// Process incoming A2UI messages
agentConnection.onMessage((message) => {
  renderer.processMessage(message);
});
```

### 6.4 Flutter Rendering Example

```dart
import 'package:genui_sdk/genui_sdk.dart';

class AgentUIWidget extends StatefulWidget {
  @override
  _AgentUIWidgetState createState() => _AgentUIWidgetState();
}

class _AgentUIWidgetState extends State<AgentUIWidget> {
  late A2UIRenderer _renderer;

  @override
  void initState() {
    super.initState();
    _renderer = A2UIRenderer(
      catalog: StandardCatalog(),
      onAction: _handleAction,
    );
  }

  void _handleAction(UserAction action) {
    // Send action to agent
    agentService.sendAction(action);
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<A2UIMessage>(
      stream: agentService.uiStream,
      builder: (context, snapshot) {
        if (snapshot.hasData) {
          return _renderer.render(snapshot.data!);
        }
        return CircularProgressIndicator();
      },
    );
  }
}
```

### 6.5 Generative UI Patterns

Three main approaches exist for generative UI:

| Pattern | Description | Use Case |
|---------|-------------|----------|
| **Static** | Agent selects from pre-built components | Mission-critical UIs with high polish |
| **Declarative** | Agent returns structured specs (A2UI) | Cross-platform, balanced flexibility |
| **Open-Ended** | Agent generates complete HTML/iframes | Maximum flexibility, experimental |

---

## 7. State Synchronization with AG-UI

### 7.1 AG-UI Protocol Overview

AG-UI (Agent-User Interaction Protocol) is a complementary protocol that defines *how* agents and UIs communicate in real-time:

> "A2UI defines what UI should be rendered; AG-UI defines how the agent and UI talk to each other in real time."

### 7.2 Event Categories

AG-UI defines 16 event types across 5 categories:

| Category | Events | Purpose |
|----------|--------|---------|
| **Lifecycle** | `RunStarted`, `RunFinished`, `RunError`, `StepStarted`, `StepFinished` | Track agent execution stages |
| **Text** | `TextMessageStart`, `TextMessageContent`, `TextMessageEnd` | Stream LLM text token-by-token |
| **Tool** | `ToolCallStart`, `ToolCallArgs`, `ToolCallEnd`, `ToolCallResult` | Manage tool executions |
| **State** | `StateSnapshot`, `StateDelta`, `MessagesSnapshot` | Synchronize UI state |
| **Activity** | `ActivitySnapshot`, `ActivityDelta` | Progress updates |

### 7.3 State Snapshot Event

Delivers complete state representation:

```json
{
  "type": "StateSnapshot",
  "snapshot": {
    "user_context": "authenticated",
    "conversation_mode": "active",
    "agent_status": "ready",
    "current_task": {
      "id": "task-123",
      "progress": 0.45,
      "steps_completed": ["analyze", "plan"]
    }
  }
}
```

### 7.4 State Delta Event

Applies incremental updates using RFC 6902 JSON Patch:

```json
{
  "type": "StateDelta",
  "delta": [
    {
      "op": "replace",
      "path": "/agent_status",
      "value": "processing"
    },
    {
      "op": "add",
      "path": "/current_task/steps_completed/-",
      "value": "execute"
    },
    {
      "op": "replace",
      "path": "/current_task/progress",
      "value": 0.75
    }
  ]
}
```

### 7.5 JSON Patch Operations

| Operation | Description |
|-----------|-------------|
| `add` | Insert value into object/array |
| `replace` | Overwrite existing value |
| `remove` | Delete value |
| `move` | Relocate value between paths |
| `copy` | Duplicate value to new location |
| `test` | Validate precondition |

### 7.6 Synchronization Flow

```
1. Initial Sync:    StateSnapshot (full state)
2. Updates:         StateDelta → StateDelta → StateDelta
3. Resync:          StateSnapshot (if divergence detected)
```

### 7.7 Implementation Example

```typescript
import { AG_UI } from 'ag-ui-protocol';

const agui = new AG_UI({
  transport: 'sse',
  endpoint: '/api/agent/stream'
});

// Handle state events
agui.on('StateSnapshot', (event) => {
  store.setState(event.snapshot);
});

agui.on('StateDelta', (event) => {
  store.applyPatch(event.delta);
});

// Handle A2UI messages over AG-UI
agui.on('Custom', (event) => {
  if (event.name === 'a2ui_surface_update') {
    a2uiRenderer.processMessage(event.value);
  }
});
```

---

## 8. Accessibility Compliance

### 8.1 Native Accessibility Inheritance

A key advantage of A2UI's native-first approach:

> "This allows the UI to inherit the host app's styling and accessibility features perfectly."

Because A2UI renders through native components, accessibility features are automatically inherited from the platform's accessibility implementation.

### 8.2 WCAG 2.2 Compliance Considerations

| Principle | A2UI Approach |
|-----------|---------------|
| **Perceivable** | Native components include proper semantic markup and ARIA attributes |
| **Operable** | Keyboard navigation inherited from platform |
| **Understandable** | Consistent component behavior across the application |
| **Robust** | Native rendering ensures assistive technology compatibility |

### 8.3 Accessibility Guidelines for AI Interfaces (AAG)

Emerging guidelines (AAG v0.1) address AI-specific accessibility concerns:

- Dynamic content updates must use `aria-live` regions
- Screen reader announcements for agent status changes
- Keyboard-accessible generative UI components
- Clear focus management during UI updates

### 8.4 Implementation Best Practices

```json
{
  "id": "notification",
  "component": {
    "Text": {
      "text": {"path": "/notification/message"},
      "accessibility": {
        "role": "alert",
        "live": "polite"
      }
    }
  }
}
```

### 8.5 Regulatory Compliance

Key deadlines:
- **April 2026**: U.S. DOJ requires WCAG 2.1 Level AA compliance for public sector
- **Ongoing**: European Accessibility Act expanding across EU member states

---

## 9. Interactive Patterns

### 9.1 The Interaction Loop

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌─────────┐
│  EMIT   │───>│  RENDER  │───>│ INTERACT │───>│  SIGNAL  │───>│ REASON  │
│ (Agent) │    │ (Client) │    │  (User)  │    │ (Client) │    │ (Agent) │
└─────────┘    └──────────┘    └──────────┘    └──────────┘    └─────────┘
     │                                                               │
     └───────────────────────────────────────────────────────────────┘
```

1. **Emit**: Agent sends JSON message describing surfaces, components, and data bindings
2. **Render**: Client turns JSON into native UI
3. **Interact**: User interacts with components (clicks, types, selects)
4. **Signal**: Client sends interactions back as typed `userAction` events
5. **Reason**: Agent processes events and updates UI accordingly

### 9.2 Button Actions

```json
{
  "id": "submit-btn",
  "component": {
    "Button": {
      "label": {"literalString": "Submit Order"},
      "action": {
        "name": "submit_order",
        "parameters": {
          "orderId": {"path": "/order/id"},
          "items": {"path": "/cart/items"}
        }
      }
    }
  }
}
```

### 9.3 Form Handling

```json
{
  "surfaceUpdate": {
    "surfaceId": "contact-form",
    "components": [
      {
        "id": "form-container",
        "component": {
          "Column": {
            "children": {"explicitList": ["name-field", "email-field", "message-field", "submit"]}
          }
        }
      },
      {
        "id": "name-field",
        "component": {
          "TextField": {
            "label": {"literalString": "Full Name"},
            "value": {"path": "/form/name"},
            "required": true
          }
        }
      },
      {
        "id": "email-field",
        "component": {
          "TextField": {
            "label": {"literalString": "Email"},
            "value": {"path": "/form/email"},
            "inputType": "email",
            "validation": {
              "pattern": "^[^@]+@[^@]+\\.[^@]+$",
              "message": "Please enter a valid email"
            }
          }
        }
      },
      {
        "id": "message-field",
        "component": {
          "TextField": {
            "label": {"literalString": "Message"},
            "value": {"path": "/form/message"},
            "multiline": true,
            "rows": 4
          }
        }
      },
      {
        "id": "submit",
        "component": {
          "Button": {
            "label": {"literalString": "Send Message"},
            "action": {"name": "submit_contact_form"}
          }
        }
      }
    ]
  }
}
```

### 9.4 Form Data Flow

1. Backend initializes data model with empty values
2. Frontend binds `TextField.value` to data model paths
3. User types input - Frontend updates data model in real-time
4. User clicks button - Frontend extracts context values
5. Backend receives action call with populated parameters

### 9.5 Selection Components

```json
{
  "id": "priority-selector",
  "component": {
    "MultipleChoice": {
      "label": {"literalString": "Priority Level"},
      "value": {"path": "/task/priority"},
      "options": [
        {"value": "low", "label": "Low"},
        {"value": "medium", "label": "Medium"},
        {"value": "high", "label": "High"},
        {"value": "urgent", "label": "Urgent"}
      ],
      "mode": "single"
    }
  }
}
```

---

## 10. Security Model

### 10.1 Declarative, Not Executable

A2UI's core security principle:

> "A2UI is a declarative data format, not executable code. Your client application maintains a 'catalog' of trusted, pre-approved UI components, and the agent can only request to render components from that catalog."

### 10.2 Security Benefits

| Feature | Security Benefit |
|---------|------------------|
| **No eval()** | No code execution on the client |
| **Catalog restriction** | Agents limited to pre-approved components |
| **Schema validation** | All messages validated before processing |
| **Sandboxing** | Custom components can enforce strict isolation |

### 10.3 Catalog Negotiation

```json
// Client announces capabilities
{
  "a2uiClientCapabilities": {
    "supportedCatalogIds": ["standard-v1", "enterprise-v2"],
    "inlineCatalogs": [
      {
        "id": "custom-widgets",
        "components": ["StockTicker", "TradingChart", "PortfolioSummary"]
      }
    ]
  }
}

// Server selects catalog
{
  "beginRendering": {
    "surfaceId": "trading-dashboard",
    "catalogId": "enterprise-v2"
  }
}
```

### 10.4 Trust Ladders

Developers can implement trust levels for custom components:

```typescript
const catalogConfig = {
  components: {
    // Level 1: Full trust, no restrictions
    Button: { trustLevel: 'full' },
    TextField: { trustLevel: 'full' },

    // Level 2: Sandboxed, limited capabilities
    ExternalWidget: {
      trustLevel: 'sandboxed',
      sandbox: {
        allowScripts: false,
        allowForms: false,
        allowPopups: false
      }
    },

    // Level 3: Iframe isolation
    ThirdPartyContent: {
      trustLevel: 'isolated',
      iframePolicy: 'sandbox'
    }
  }
};
```

---

## 11. Implementation Examples

### 11.1 Complete Booking Form

```json
{
  "surfaceUpdate": {
    "surfaceId": "restaurant-booking",
    "components": [
      {
        "id": "booking-card",
        "component": {
          "Card": {
            "title": {"literalString": "Reserve a Table"},
            "children": {"explicitList": ["date-picker", "time-picker", "guests", "notes", "actions"]}
          }
        }
      },
      {
        "id": "date-picker",
        "component": {
          "DateTimeInput": {
            "label": {"literalString": "Date"},
            "value": {"path": "/booking/date"},
            "enableDate": true,
            "enableTime": false,
            "minDate": "2026-01-30"
          }
        }
      },
      {
        "id": "time-picker",
        "component": {
          "MultipleChoice": {
            "label": {"literalString": "Time"},
            "value": {"path": "/booking/time"},
            "options": [
              {"value": "18:00", "label": "6:00 PM"},
              {"value": "18:30", "label": "6:30 PM"},
              {"value": "19:00", "label": "7:00 PM"},
              {"value": "19:30", "label": "7:30 PM"},
              {"value": "20:00", "label": "8:00 PM"}
            ]
          }
        }
      },
      {
        "id": "guests",
        "component": {
          "Slider": {
            "label": {"literalString": "Number of Guests"},
            "value": {"path": "/booking/guests"},
            "min": 1,
            "max": 12,
            "step": 1
          }
        }
      },
      {
        "id": "notes",
        "component": {
          "TextField": {
            "label": {"literalString": "Special Requests"},
            "value": {"path": "/booking/notes"},
            "multiline": true,
            "placeholder": "Allergies, celebrations, seating preferences..."
          }
        }
      },
      {
        "id": "actions",
        "component": {
          "Row": {
            "children": {"explicitList": ["cancel-btn", "book-btn"]}
          }
        }
      },
      {
        "id": "cancel-btn",
        "component": {
          "Button": {
            "label": {"literalString": "Cancel"},
            "action": {"name": "cancel_booking"},
            "variant": "outlined"
          }
        }
      },
      {
        "id": "book-btn",
        "component": {
          "Button": {
            "label": {"literalString": "Confirm Reservation"},
            "action": {"name": "confirm_booking"},
            "variant": "filled"
          }
        }
      }
    ]
  }
}
```

### 11.2 Dashboard with Charts

```json
{
  "surfaceUpdate": {
    "surfaceId": "analytics-dashboard",
    "components": [
      {
        "id": "dashboard-grid",
        "component": {
          "Column": {
            "children": {"explicitList": ["stats-row", "charts-row", "table-section"]}
          }
        }
      },
      {
        "id": "stats-row",
        "component": {
          "Row": {
            "children": {"explicitList": ["revenue-card", "users-card", "orders-card"]}
          }
        }
      },
      {
        "id": "revenue-card",
        "component": {
          "Card": {
            "title": {"literalString": "Revenue"},
            "children": {"explicitList": ["revenue-value", "revenue-trend"]}
          }
        }
      },
      {
        "id": "revenue-value",
        "component": {
          "Text": {
            "text": {"path": "/metrics/revenue/formatted"},
            "usageHint": "h2"
          }
        }
      },
      {
        "id": "revenue-trend",
        "component": {
          "Text": {
            "text": {"path": "/metrics/revenue/trend"},
            "style": {"color": {"path": "/metrics/revenue/trendColor"}}
          }
        }
      },
      {
        "id": "charts-row",
        "component": {
          "Row": {
            "children": {"explicitList": ["sales-chart", "traffic-chart"]}
          }
        }
      },
      {
        "id": "sales-chart",
        "component": {
          "LineChart": {
            "title": {"literalString": "Sales Over Time"},
            "data": {"path": "/charts/sales/data"},
            "xAxis": "date",
            "yAxis": "amount"
          }
        }
      },
      {
        "id": "traffic-chart",
        "component": {
          "BarChart": {
            "title": {"literalString": "Traffic by Source"},
            "data": {"path": "/charts/traffic/data"},
            "categories": {"path": "/charts/traffic/categories"}
          }
        }
      }
    ]
  }
}
```

### 11.3 Agent Python Implementation

```python
from a2ui import A2UIBuilder, Component
from genai import Gemini

def generate_booking_ui(user_request: str) -> dict:
    """Generate A2UI response for booking requests."""

    # Use Gemini to understand user intent
    model = Gemini(model_name="gemini-2.0-flash")

    # Generate structured A2UI response
    response = model.generate(
        prompt=f"""
        Generate an A2UI JSON response for this user request: {user_request}

        Use these components from the standard catalog:
        - Card for containers
        - DateTimeInput for date/time selection
        - TextField for text input
        - Button for actions
        - MultipleChoice for selections

        Return valid A2UI JSON following the v0.8 specification.
        """,
        response_format="json"
    )

    return response.to_dict()


# Example with A2UI Builder
def build_confirmation_ui(booking: dict) -> dict:
    builder = A2UIBuilder(surface_id="confirmation")

    builder.add_component(
        Component.card(
            id="confirmation-card",
            title="Booking Confirmed!",
            children=[
                Component.text(
                    id="conf-message",
                    text=f"Your table for {booking['guests']} is reserved."
                ),
                Component.text(
                    id="conf-details",
                    text=f"Date: {booking['date']} at {booking['time']}"
                ),
                Component.button(
                    id="done-btn",
                    label="Done",
                    action="close_confirmation"
                )
            ]
        )
    )

    return builder.to_message()
```

---

## 12. Best Practices

### 12.1 Component Design

| Do | Don't |
|----|-------|
| Use descriptive component IDs | Use auto-generated or numeric IDs |
| Stream components incrementally | Wait for complete response |
| Update only changed data paths | Regenerate entire surfaces |
| Separate structure from content | Hard-code values in components |

### 12.2 Performance Optimization

```json
// Good: Incremental update
{
  "dataModelUpdate": {
    "surfaceId": "dashboard",
    "data": {
      "metrics": {"visitors": 1542}
    }
  }
}

// Avoid: Regenerating entire surface for small changes
```

### 12.3 LLM Prompt Engineering

```python
SYSTEM_PROMPT = """
You are an A2UI generator. Follow these rules:

1. Use flat component lists, not nested structures
2. Reference children by ID, not inline definition
3. Use data binding paths for dynamic values
4. Keep component IDs descriptive and consistent
5. Include proper action names for interactive components
6. Validate against the client's supported catalog

Output format: JSONL stream of A2UI messages
"""
```

### 12.4 Error Handling

```typescript
const renderer = new A2UIRenderer({
  onError: (error) => {
    if (error.code === 'UNKNOWN_COMPONENT') {
      // Fallback to generic display
      return FallbackComponent({ message: error.message });
    }
    if (error.code === 'INVALID_BINDING') {
      // Log and continue with literal value
      console.warn('Binding error:', error);
      return null;
    }
    throw error;
  }
});
```

### 12.5 Testing Strategies

```typescript
describe('A2UI Rendering', () => {
  it('should render standard components', () => {
    const message = {
      surfaceUpdate: {
        surfaceId: 'test',
        components: [
          { id: 'btn', component: { Button: { label: { literalString: 'Click' } } } }
        ]
      }
    };

    const result = renderer.processMessage(message);
    expect(result.querySelector('button')).toHaveTextContent('Click');
  });

  it('should handle data binding updates', () => {
    // Initial render
    renderer.processMessage(surfaceWithBinding);

    // Update data
    renderer.processMessage({
      dataModelUpdate: { surfaceId: 'test', data: { value: 'updated' } }
    });

    expect(renderer.getData('/value')).toBe('updated');
  });
});
```

---

## 13. Production Deployments

### 13.1 Google Products Using A2UI

| Product | Use Case |
|---------|----------|
| **Opal** | AI mini-apps platform |
| **Gemini Enterprise** | Custom business agent UIs, workflow automation |
| **Flutter GenUI SDK** | Cross-platform generative UI |

### 13.2 Enterprise Use Cases

> "Our customers need their agents to do more than just answer questions; they need them to guide employees through complex workflows. A2UI will allow developers building on Gemini Enterprise to have their agents generate the dynamic, custom UIs needed for any task, from data entry forms to approval dashboards."

- **Workflow Automation**: Dynamic approval interfaces
- **Data Entry**: Context-aware forms
- **Dashboards**: Real-time analytics visualizations
- **Multi-Agent Systems**: UI generation across trust boundaries

---

## 14. Ecosystem and Tooling

### 14.1 Protocol Stack (2026)

```
┌─────────────────────────────────────────┐
│              Application                │
├─────────────────────────────────────────┤
│   A2UI (What to render)                 │
├─────────────────────────────────────────┤
│   AG-UI (How to communicate)            │
├─────────────────────────────────────────┤
│   A2A (Agent-to-Agent protocol)         │
├─────────────────────────────────────────┤
│   MCP (Model Context Protocol)          │
├─────────────────────────────────────────┤
│              Transport (HTTP/WS/SSE)    │
└─────────────────────────────────────────┘
```

### 14.2 Compatible Frameworks

| Framework | Integration |
|-----------|-------------|
| **CopilotKit** | Full A2UI support via AG-UI runtime |
| **LangChain/LangGraph** | A2UI output nodes |
| **Genkit** | Planned integration |
| **AutoGen** | Community adapters |

### 14.3 Development Tools

- **A2UI Playground**: Interactive testing environment
- **Schema Validator**: JSON schema validation
- **Catalog Editor**: Visual component catalog management
- **DevTools Extension**: Browser debugging for A2UI streams

### 14.4 Project Resources

| Resource | URL |
|----------|-----|
| Official Website | https://a2ui.org/ |
| GitHub Repository | https://github.com/google/A2UI |
| Specification | https://a2ui.org/specification/v0.8-a2ui/ |
| Component Reference | https://a2ui.org/concepts/components/ |

---

## 15. Sources and References

### Official Documentation
- [A2UI Official Website](https://a2ui.org/)
- [Google A2UI GitHub Repository](https://github.com/google/A2UI)
- [Introducing A2UI - Google Developers Blog](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/)
- [A2UI Specification v0.8](https://a2ui.org/specification/v0.8-a2ui/)
- [A2UI Components & Structure](https://a2ui.org/concepts/components/)

### AG-UI Protocol
- [AG-UI Protocol Documentation](https://docs.ag-ui.com/)
- [AG-UI Events Reference](https://docs.ag-ui.com/concepts/events)
- [AG-UI State Management](https://docs.ag-ui.com/concepts/state)
- [Introducing AG-UI - CopilotKit Blog](https://webflow.copilotkit.ai/blog/introducing-ag-ui-the-protocol-where-agents-meet-users)

### Implementation Guides
- [The Complete Guide to A2UI Protocol 2026 - DEV Community](https://dev.to/czmilo/the-complete-guide-to-a2ui-protocol-building-agent-driven-uis-with-googles-a2ui-in-2026-146p)
- [The A2UI Protocol: A 2026 Complete Guide - A2A Protocol](https://a2aprotocol.ai/blog/a2ui-guide)
- [Build with Google's A2UI Spec - CopilotKit](https://www.copilotkit.ai/blog/build-with-googles-new-a2ui-spec-agent-user-interfaces-with-a2ui-ag-ui)

### Generative UI
- [Generative UI: Understanding Agent-Powered Interfaces - CopilotKit](https://www.copilotkit.ai/generative-ui)
- [The Developer's Guide to Generative UI in 2026 - DEV Community](https://dev.to/copilotkit/the-developers-guide-to-generative-ui-in-2026-1bh3)
- [AI SDK UI: Generative User Interfaces](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)

### Accessibility
- [Accessible AI: WCAG Compliance - A11Y Pros](https://a11ypros.com/blog/accessible-ai)
- [AAG v0.1 - Accessibility Guidelines for AI Interfaces](https://medium.com/@anky18milestone/aag-v0-1-accessibility-guidelines-for-ai-interfaces-inspired-by-wcag-40ab4e8badc2)
- [WCAG Guidelines for AI-Generated Content - AudioEye](https://www.audioeye.com/post/wcag-guidelines-ai-generated-content/)

### Analysis and Comparisons
- [Agent UI Standards: MCP Apps and Google's A2UI - The New Stack](https://thenewstack.io/agent-ui-standards-multiply-mcp-apps-and-googles-a2ui/)
- [A2A, MCP, AG-UI, A2UI: The 2026 AI Agent Protocol Stack](https://medium.com/@visrow/a2a-mcp-ag-ui-a2ui-the-essential-2026-ai-agent-protocol-stack-ee0e65a672ef)
- [Google A2UI Explained - Analytics Vidhya](https://www.analyticsvidhya.com/blog/2025/12/google-a2ui-explained/)

### Microsoft Integration
- [AG-UI Integration with Agent Framework - Microsoft Learn](https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/)
- [State Management with AG-UI - Microsoft Learn](https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/state-management)

---

## Appendix A: Quick Reference Card

### Message Types
```
surfaceUpdate      → Define/update UI components
dataModelUpdate    → Update application state
beginRendering     → Signal UI readiness
deleteSurface      → Remove UI region
userAction         → Report user interaction
```

### Component Categories
```
Layout:      Row, Column, List
Display:     Text, Image, Icon, Video, Divider
Interactive: Button, TextField, CheckBox, DateTimeInput, Slider
Container:   Card, Tabs, Modal
```

### Data Binding
```json
Static:   {"literalString": "Hello"}
Dynamic:  {"path": "/user/name"}
Combined: {"path": "/user/name", "literalString": "Guest"}
```

### AG-UI Events
```
Lifecycle: RunStarted, RunFinished, RunError
Text:      TextMessageStart, TextMessageContent, TextMessageEnd
Tool:      ToolCallStart, ToolCallArgs, ToolCallEnd, ToolCallResult
State:     StateSnapshot, StateDelta, MessagesSnapshot
```

---

*Report generated: January 30, 2026*
*Protocol version referenced: A2UI v0.8 (Public Preview)*
