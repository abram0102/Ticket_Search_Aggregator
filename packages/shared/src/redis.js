const Redis = require('ioredis');

// Each caller gets its own connection. ioredis connections that call
// `subscribe` can no longer run normal commands, so SSE handlers in the
// gateway must open a dedicated connection per active stream.
function createRedis() {
  return new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
}

module.exports = { createRedis };
