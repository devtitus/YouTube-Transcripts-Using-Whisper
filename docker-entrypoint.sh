#!/bin/bash
set -e

echo "🐳 Starting Transcripts Service Container..."

# Start Node.js service
echo "🟢 Starting Node.js API service..."
cd /app
exec npm run start