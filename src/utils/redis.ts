import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = createClient({
  url: redisUrl,
});

redis.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('ready', () => {
  console.log('Redis Client Ready');
});

redis.on('end', () => {
  console.log('Redis connection ended');
});

// Connect to Redis
export async function connectRedis() {
  try {
    await redis.connect();
    console.log('Redis client connected successfully');
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    // Fallback to memory-based storage if Redis is unavailable
    console.warn('Continuing without Redis - using memory-based storage');
  }
}

export async function disconnectRedis() {
  try {
    await redis.disconnect();
    console.log('Redis client disconnected');
  } catch (error) {
    console.error('Error disconnecting from Redis:', error);
  }
}

export function isRedisConnected(): boolean {
  return redis.isOpen;
}