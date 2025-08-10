# Docker Deployment Guide

This guide covers deploying the Transcripts Service using Docker with both local Python ASR and cloud Groq services.

## 🚀 Deployment Options

Choose one of these approaches based on your needs:

### **Option 1: Single Container (Resource Efficient)**
```bash
# Use the main docker-compose.yml
docker-compose up -d
```

### **Option 2: Multi-Container (More Reliable)**
```bash
# Use separate containers for each service
docker-compose -f docker-compose.multi.yml up -d
```

## Quick Start

### 1. **Setup Environment**
```bash
# Copy the Docker environment template
cp .env.docker .env

# Edit .env and add your Groq API key
nano .env
```

### 2. **Build the Application**
```bash
# Build the TypeScript application first
npm run build
```

### 3. **Start Services**

**Single Container Approach:**
```bash
docker-compose up -d
```

**Multi-Container Approach (Recommended):**
```bash
docker-compose -f docker-compose.multi.yml up -d
```

### 4. **View Logs**
```bash
# Single container
docker-compose logs -f transcripts-service

# Multi-container
docker-compose -f docker-compose.multi.yml logs -f
```

### 3. **Test the API**
```bash
# Test local model
curl "http://localhost:5685/v1/transcripts?url=https://youtube.com/watch?v=xxx&model_type=local&model=base.en&sync=true"

# Test cloud model
curl "http://localhost:5685/v1/transcripts?url=https://youtube.com/watch?v=xxx&model_type=cloud&model=whisper-large-v3-turbo&sync=true"
```

## Architecture

The Docker setup includes:

- **Node.js API** (Port 5685) - Main API with routing logic
- **Python ASR Service** (Port 5686) - Local model inference using faster-whisper
- **Redis** (Port 6381) - Job queue and rate limiting
- **Automatic Cleanup** - Temporary files are automatically cleaned up

## Services

### **transcripts-service**
- Runs both Node.js API and Python ASR service in one container
- Auto-starts Python service, then Node.js API
- Health checks for both services
- Automatic restart on failure

### **redis**
- Memory-optimized Redis configuration
- Data persistence enabled
- Health check monitoring

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GROQ_API_KEY` | - | **Required** for cloud models |
| `DEFAULT_MODEL_TYPE` | `auto` | `local`, `cloud`, or `auto` |
| `LOCAL_ASR_MODEL` | `base.en` | Default local model |
| `GROQ_WHISPER_MODEL` | `whisper-large-v3-turbo` | Default cloud model |

## Volume Mounts

- `audio_data:/app/audio_file` - Temporary audio processing
- `models_data:/app/models` - Model storage
- `huggingface_cache:/root/.cache/huggingface` - Model cache (persistent)
- `redis_data:/data` - Redis persistence

## Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up --build -d

# Clean up volumes (removes cached models)
docker-compose down -v

# Check service health
docker-compose ps
```

## API Endpoints

- `GET http://localhost:5685/healthz` - Health check
- `POST http://localhost:5685/v1/transcripts` - Create transcription
- `GET http://localhost:5685/v1/transcripts/:id` - Get transcription status
- `GET http://localhost:5685/v1/transcripts/:id.{json|srt|vtt|txt}` - Download results

## Monitoring

### **Health Checks**
```bash
# Check all services
curl http://localhost:5685/healthz  # Node.js API
curl http://localhost:5686/healthz  # Python ASR
```

### **Container Status**
```bash
# View container status
docker-compose ps

# View detailed logs
docker-compose logs transcripts-service
docker-compose logs redis
```

## Scaling

To handle higher loads:

```yaml
# In docker-compose.yml
services:
  transcripts-service:
    deploy:
      replicas: 3
    # ... rest of config
```

## Troubleshooting

### **Port Conflicts**
```bash
# Check what's using ports
netstat -tulpn | grep :5685
netstat -tulpn | grep :5686

# Use different ports
# Edit docker-compose.yml ports section
```

### **Model Download Issues**
```bash
# Check model cache volume
docker volume inspect transcripts_project_huggingface_cache

# Clear cache if needed
docker volume rm transcripts_project_huggingface_cache
```

### **Memory Issues**
```bash
# Monitor container memory
docker stats transcripts-app

# Increase Redis memory limit in docker-compose.yml
command: redis-server --appendonly yes --maxmemory 512mb
```

## Production Considerations

1. **Set up proper monitoring** (health checks, logs)
2. **Configure resource limits** in docker-compose.yml
3. **Use external Redis** for production deployments
4. **Set up log aggregation** (ELK stack, etc.)
5. **Configure backup** for Redis data volume