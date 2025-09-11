# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Agentic QE Framework** project - a comprehensive resource for transitioning from classical to agentic quality engineering approaches. The project contains documentation, articles, and specifications for building the agentic-qe.dev website.

## Project Structure

```
/
├── agentic-qe-dev-instructions.md  # Complete website build specifications
├── article-1-orchestra-metaphor.md  # Blog article: Testing flows vs units
├── article-2-ensemble-programming.md # Blog article: Human-agent collaboration
├── article-3-pact-principles.md     # Blog article: PACT framework principles
├── article-4-monitoring-evolution.md # Blog article: Agent-driven monitoring
└── article-5-maturity-model.md      # Blog article: Maturity assessment
```

## Key Concepts & Architecture

### PACT Framework
The core framework organizing agentic QE principles:
- **P**roactive - Anticipate and prevent failures before they occur
- **A**utonomous - Self-executing test flows without human intervention
- **C**ollaborative - Human-agent orchestration for optimal outcomes
- **T**argeted - Context-driven optimization for specific goals

### Website Architecture
The agentic-qe.dev website will feature:
- Dynamic, tech-forward design with neon green (#00ff41) accents on dark backgrounds
- Interactive PACT assessment tool with personalized recommendations
- Multi-layer architecture visualizations (Agent, Orchestration, Human-in-the-Loop, Integration layers)
- Classical-to-Agentic bridge visualizations showing the evolution path
- Blog section with comprehensive articles on agentic QE concepts

### Technology Stack (Planned)
- **Frontend**: Next.js 14+ with App Router
- **Database**: Supabase for assessment results, subscribers, analytics
- **Styling**: Tailwind CSS + custom CSS with terminal/matrix aesthetic
- **Animations**: Framer Motion for interactive visualizations
- **Deployment**: Vercel with Cloudflare CDN

### Database Schema
Key tables in Supabase:
- `assessment_results` - PACT scores and recommendations
- `subscribers` - Newsletter and resource download tracking
- `articles` - Blog content management
- `page_analytics` - User engagement metrics

## Content Guidelines

### Writing Style
- Tech-forward, authoritative voice
- Bridge classical QE concepts to agentic approaches
- Use concrete examples and failure stories
- Focus on practical implementation over theory

### Key Messaging
- "From testing-as-activity to agents-as-orchestrators"
- "From verification theatre to trusted, explainable flows"
- "Without testing, orchestration is just theatre"

### Article Themes
1. Orchestra metaphor - Flows as the new unit of testing
2. Ensemble programming - Mob programming with AI agents
3. PACT principles - Building explainable autonomous systems
4. Production monitoring evolution - From dashboards to decisions
5. Maturity model - 5-level progression framework

## Design System

### Visual Identity
- **Primary**: Neon green (#00ff41) for CTAs and highlights
- **Secondary**: Cyan (#00ffff) for accents
- **Background**: Dark (#0a0a0a, #1a1a1a)
- **Typography**: JetBrains Mono (headers), Inter (body), Fira Code (code)
- **Effects**: Terminal-style cards, matrix backgrounds, glowing borders

### Interactive Components
- PACT assessment tool with radar chart visualization
- Classical-to-Agentic bridge comparisons
- Code comparison widgets (before/after)
- Typewriter effects for terminal-style elements

## Launch Planning
- **Launch Date**: October 1, 2025
- **Initial Content**: 5 comprehensive blog articles ready
- **Key Features**: Assessment tool, resource downloads, newsletter signup
- **Email Strategy**: Capture at assessment completion and resource downloads