# Build stage
FROM node:22-alpine AS builder

# Install Python needed for yt-dlp-exec during npm install
RUN apk add --no-cache \
    python3 \
    py3-pip \
    && ln -sf python3 /usr/bin/python

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY . .

# Build the TypeScript project
RUN npm run build

# Production stage
FROM node:22-alpine AS production

# Install Python and other dependencies needed for yt-dlp and ffmpeg
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    && ln -sf python3 /usr/bin/python

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create directories for audio files and models
RUN mkdir -p /app/audio_file /app/models

# Expose the port
EXPOSE 5685

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5685

# Start the application
CMD ["npm", "start"]