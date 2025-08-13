##############################
# Build stage
##############################
FROM node:22-slim AS build
## Install build-time tools required by some dependencies (yt-dlp needs python)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python-is-python3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Dependency manifests first
COPY package*.json ./

# Install all deps (need dev deps for TypeScript build & postinstall scripts)
RUN npm ci

# Copy source
COPY . .

# Normalize line endings for shell scripts (Windows -> Unix)
RUN find . -type f -name "*.sh" -exec sed -i 's/\r$//' {} + || true

# Build TS
RUN npm run build

##############################
# Production stage
##############################
FROM node:22-slim AS production

# Install runtime system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    python3 \
    python-is-python3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests & install only production deps (omit dev)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy build output and entrypoint
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh \
    && mkdir -p /app/audio_file

# Create non-root user
RUN adduser --system --group --uid 1001 appuser \
    && chown -R appuser:appuser /app
USER appuser

ENV NODE_ENV=production \
    PORT=5687

EXPOSE 5687

ENTRYPOINT ["/app/docker-entrypoint.sh"]