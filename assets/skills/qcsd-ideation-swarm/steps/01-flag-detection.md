# Step 1: Analyze Epic Content (Flag Detection)

## Prerequisites
- Ideation swarm skill invoked
- Epic / feature description provided (or URL for URL mode)
- OUTPUT_FOLDER determined

## Instructions

### URL Mode Check

If a URL was provided, fetch the page before flag detection and use the fetched
content as the epic content:

1. Run the browser cascade that ships with the agentic-qe package (Playwright+Stealth,
   then HTTP fetch, then a WebSearch fallback; 30s per tier):

   ```bash
   node node_modules/agentic-qe/scripts/fetch-content.cjs "${URL}" "${OUTPUT_FOLDER}" --timeout 30000
   # global install: node "$(npm root -g)/agentic-qe/scripts/fetch-content.cjs" ...
   ```

2. Read `${OUTPUT_FOLDER}/content.html`, and note the tier that succeeded from
   `${OUTPUT_FOLDER}/fetch-result.json`.
3. If the script is not installed or every tier fails, use the WebFetch tool instead
   and state in the report which method produced the content.

### Flag Detection (Check ALL flags)

```
HAS_UI = FALSE
  Set TRUE if epic contains ANY of: UI, frontend, visual, design,
  component, screen, page, form, button, modal, dialog, dashboard,
  widget, interface, display, view, layout, CSS, styling

HAS_SECURITY = FALSE
  Set TRUE if epic contains ANY of: authentication, authorization,
  encryption, security, OWASP, token, OAuth, credentials, privacy,
  compliance, vulnerability, access control

HAS_UX = FALSE
  Set TRUE if epic contains ANY of: user experience, usability,
  interaction design, user flow, journey, persona, accessibility,
  responsive, mobile-first, navigation, onboarding

HAS_MIDDLEWARE = FALSE
  Set TRUE if epic mentions middleware, ESB, message broker, MQ,
  Kafka, RabbitMQ, integration bus, API gateway, pub/sub

HAS_SAP_INTEGRATION = FALSE
  Set TRUE if epic mentions SAP, RFC, BAPI, IDoc, OData,
  S/4HANA, EWM, ECC, ABAP, CDS view, Fiori

HAS_AUTHORIZATION = FALSE
  Set TRUE if epic mentions SoD, segregation of duties,
  role conflict, authorization object, RBAC, permission matrix

HAS_VIDEO = FALSE
  Set TRUE if epic mentions video content, media playback,
  streaming, video player, captions, subtitles
```

Output flag detection results.

## Success Criteria
- [ ] All flags evaluated with evidence
- [ ] Expected agent count calculated

## Navigation
- On success: proceed to Step 2 by reading `steps/02-core-agents.md`
