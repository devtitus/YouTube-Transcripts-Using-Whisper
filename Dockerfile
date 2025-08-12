# Build stage for Node.js
FROM node:22-alpine AS node-builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only Node.js dependencies (no Python setup)
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build the TypeScript project
RUN npm run build

# Production stage
FROM node:22-slim AS production

# Install only necessary system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files for production dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built Node.js application from builder stage
COPY --from=node-builder /app/dist ./dist

# Copy the simplified entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x /app/docker-entrypoint.sh

# Create directory for audio files
RUN mkdir -p /app/audio_file

# Expose port for Node.js service
EXPOSE 5685

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5685

# Use the entrypoint script
ENTRYPOINT ["/app/docker-entrypoint.sh"]