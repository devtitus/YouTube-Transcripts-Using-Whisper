#!/bin/bash
set -e

echo "ðŸ³ Starting Transcripts Service Container..."

# Function to check if a service is ready
wait_for_service() {
    local service_name=$1
    local url=$2
    local max_attempts=30
    local attempt=1

    echo "â³ Waiting for $service_name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            echo "âœ… $service_name is ready!"
            return 0
        fi
        
        echo "â³ Waiting for $service_name... ($attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    echo "âŒ $service_name failed to start within ${max_attempts} attempts"
    return 1
}

# Start Python ASR service in background
echo "ðŸ Starting Python ASR service..."
cd /app/py_asr_service
# Activate virtual environment and start service
/opt/venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 5689 &
PYTHON_PID=$!
echo "ðŸ Python ASR service started with PID $PYTHON_PID"

# Wait for Python service to be ready
wait_for_service "Python ASR service" "http://localhost:5689/healthz"

# Start Node.js service
echo "ðŸŸ¢ Starting Node.js API service..."
cd /app
exec npm run start