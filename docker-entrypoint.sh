#!/bin/sh
set -e

echo "Starting Transcripts Service Container..."

# Start Node.js service (direct node to avoid extra npm process layer)
echo "Starting Node.js API service..."
cd /app
exec node dist/server.js