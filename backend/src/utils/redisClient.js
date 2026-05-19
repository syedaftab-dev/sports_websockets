// src/utils/redisClient.js
import IORedis from 'ioredis';
import { EventEmitter } from 'events';
import "dotenv/config";

const redisUrl = process.env.REDIS_URL;

class MockRedis extends EventEmitter {
  constructor() {
    super();
    this.isMock = true;
  }
  
  duplicate() {
    return this; // Share the same emitter instance for pub/sub simulation
  }

  async publish(channel, message) {
    let pattern = '*';
    if (channel.startsWith('match:')) {
      pattern = 'match:*';
    } else if (channel.startsWith('commentary:')) {
      pattern = 'commentary:*';
    }
    process.nextTick(() => {
      this.emit('pmessage', pattern, channel, message);
    });
    return 1;
  }

  async psubscribe(pattern) {
    return Promise.resolve();
  }
}

let useMock = false;
let realPublisher = null;
let realSubscriber = null;

const mockInstance = new MockRedis();

if (redisUrl) {
  try {
    // Connect with short timeouts and minimal retries to fall back quickly if blocked
    realPublisher = new IORedis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: false,
      reconnectOnError: () => false,
    });
    realSubscriber = realPublisher.duplicate();

    realPublisher.on('error', (err) => {
      if (!useMock) {
        console.warn("⚠️ Redis publisher connection failed. Falling back to local in-memory Mock Redis.");
        useMock = true;
      }
    });

    realSubscriber.on('error', (err) => {
      if (!useMock) {
        console.warn("⚠️ Redis subscriber connection failed. Falling back to local in-memory Mock Redis.");
        useMock = true;
      }
    });
  } catch (err) {
    console.warn("⚠️ Failed to initialize Redis client. Falling back to Mock Redis.");
    useMock = true;
  }
} else {
  useMock = true;
}

// Proxy wrapper for publisher
export const redisPublisher = new Proxy({}, {
  get(target, prop) {
    if (useMock || !realPublisher) {
      return mockInstance[prop];
    }
    return realPublisher[prop];
  }
});

// Proxy wrapper for subscriber
export const redisSubscriber = new Proxy({}, {
  get(target, prop) {
    if (useMock || !realSubscriber) {
      return mockInstance[prop];
    }
    return realSubscriber[prop];
  }
});
