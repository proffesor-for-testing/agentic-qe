FROM node:20-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files
COPY package.json ./

# Install dev dependencies (tsx needed at runtime for .ts files)
RUN npm install

# Copy source
COPY services/ ./services/
COPY ui/ ./ui/

# Service to start is passed via environment variable
ENV SERVICE_FILE=""

CMD ["sh", "-c", "npx tsx services/${SERVICE_FILE}"]
