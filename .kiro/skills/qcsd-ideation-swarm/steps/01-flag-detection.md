# Step 1: Analyze Epic Content (Flag Detection)

## Prerequisites
- Ideation swarm skill invoked
- Epic / feature description provided (or URL for URL mode)
- OUTPUT_FOLDER determined

## Instructions

### URL Mode Check

If a URL was provided, this step also includes the URL-based content fetch cascade.
Use the Read tool to read `steps/01a-url-fetch.md` for the URL fetch protocol if applicable.

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
