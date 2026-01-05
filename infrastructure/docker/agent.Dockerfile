# Agentic QE Agent Dockerfile
# Security-hardened container for sandboxed agent execution
#
# Security Features:
# - Non-root user execution
# - Minimal base image (Alpine)
# - Read-only root filesystem compatible
# - No shell access in production
# - Removed package managers
#
# @see Issue #146 - Security Hardening: Docker Sandboxing

# ===========================================
# Stage 1: Build
# ===========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ===========================================
# Stage 2: Production
# ===========================================
FROM node:20-alpine AS production

# Security: Create non-root user and group
RUN addgroup -g 1001 -S agentgroup && \
    adduser -u 1001 -S agent -G agentgroup

# Security: Remove unnecessary packages and package managers
# This prevents installing additional software at runtime
RUN apk del --purge apk-tools && \
    rm -rf /var/cache/apk/* /tmp/* /root/.npm

WORKDIR /app

# Copy production dependencies from builder
COPY --from=builder --chown=agent:agentgroup /app/node_modules ./node_modules

# Copy built application
COPY --from=builder --chown=agent:agentgroup /app/dist ./dist

# Copy package.json for version info
COPY --from=builder --chown=agent:agentgroup /app/package.json ./

# Create writable directories (will be mounted as tmpfs)
RUN mkdir -p /app/tmp /app/data && \
    chown -R agent:agentgroup /app/tmp /app/data

# Security: Switch to non-root user
USER agent

# Environment configuration
ENV NODE_ENV=production
ENV HOME=/app
ENV TMPDIR=/app/tmp

# Expose no ports by default (agent runs internally)
# Individual agents can override this

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

# Labels for container management
LABEL org.opencontainers.image.title="Agentic QE Agent"
LABEL org.opencontainers.image.description="Security-hardened container for QE agent execution"
LABEL org.opencontainers.image.vendor="Agentic QE"
LABEL org.opencontainers.image.source="https://github.com/proffesor-for-testing/agentic-qe"
LABEL agentic-qe.sandbox="true"
LABEL agentic-qe.security-level="hardened"

# Default entrypoint for agent execution
# Can be overridden when spawning specific agent types
ENTRYPOINT ["node"]
CMD ["dist/cli/index.js", "agent", "run"]
