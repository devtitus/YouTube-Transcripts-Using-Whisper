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

# Python ASR service stage
FROM python:3.10-slim AS python-builder

# Set working directory for Python service
WORKDIR /app/py_asr_service

# Install system dependencies for faster-whisper
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements
COPY py_asr_service/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python service code
COPY py_asr_service/ .

# Production stage
FROM node:22-slim AS production

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    libavformat-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavutil-dev \
    libavfilter-dev \
    libswscale-dev \
    libswresample-dev \
    build-essential \
    pkg-config \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create Python virtual environment for ASR service
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy Python requirements from python-builder
COPY --from=python-builder /app/py_asr_service/requirements.txt /tmp/

# Install Python dependencies for ASR service in virtual environment
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built Node.js application
COPY --from=node-builder /app/dist ./dist

# Copy Python ASR service
COPY --from=python-builder /app/py_asr_service ./py_asr_service

# Copy startup scripts and entrypoint
COPY scripts/ ./scripts/
COPY docker-entrypoint.sh ./

# Make entrypoint executable
RUN chmod +x /app/docker-entrypoint.sh

# Create directories for audio files and models
RUN mkdir -p /app/audio_file /app/models

# Expose ports for both services
EXPOSE 5685 5686

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5685
ENV LOCAL_ASR_BASE_URL=http://localhost:5686
ENV LOCAL_ASR_MODEL=base.en
ENV DEFAULT_MODEL_TYPE=auto

# Use the entrypoint script
ENTRYPOINT ["/app/docker-entrypoint.sh"]