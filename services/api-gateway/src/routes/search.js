const express = require('express');
const crypto = require('crypto');
const { createRedis, SEARCH_REQUESTED, PLATFORMS, createLogger, cacheKeyFor } = require('@ticket-search/shared');

const SEARCH_STATE_TTL_SECONDS = 300;
const logger = createLogger('api-gateway');

function buildSearchRouter({ producer, redis }) {
  const router = express.Router();

  router.post('/search', async (req, res) => {
    const { keyword, city } = req.body || {};
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ error: 'keyword is required' });
    }

    const cacheKey = cacheKeyFor({ keyword, city });
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.info('cache hit', { keyword, city });
      return res.json({ correlationId: null, cached: true, results: JSON.parse(cached) });
    }

    const correlationId = crypto.randomUUID();
    const stateKey = `search:${correlationId}:state`;

    await redis
      .multi()
      .hset(stateKey, {
        keyword,
        city: city || '',
        expected: JSON.stringify(PLATFORMS),
        received: JSON.stringify([]),
      })
      .expire(stateKey, SEARCH_STATE_TTL_SECONDS)
      .exec();

    await producer.send({
      topic: SEARCH_REQUESTED,
      messages: [
        {
          key: correlationId,
          value: JSON.stringify({
            correlationId,
            keyword,
            city: city || '',
            platforms: PLATFORMS,
            requestedAt: Date.now(),
          }),
        },
      ],
    });

    logger.info('search requested', { correlationId, keyword, city });
    res.json({ correlationId, cached: false, platforms: PLATFORMS });
  });

  router.get('/search/:correlationId/stream', async (req, res) => {
    const { correlationId } = req.params;
    const channel = `search:${correlationId}:events`;
    const stateKey = `search:${correlationId}:state`;
    const resultsKey = `search:${correlationId}:results`;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('\n');

    // A connection in subscriber mode can't run other commands, so this
    // stream gets its own short-lived Redis connection.
    const sub = createRedis();
    let closed = false;
    const seenPlatforms = new Set();

    function cleanup() {
      if (closed) return;
      closed = true;
      sub.unsubscribe(channel).catch(() => {});
      sub.quit().catch(() => {});
      res.end();
    }

    // Subscribe first so nothing published after this point is missed, then
    // replay whatever already landed in Redis before this connection opened
    // (an adapter can answer faster than the browser opens the SSE stream).
    sub.on('message', (ch, message) => {
      if (ch !== channel || closed) return;
      const parsed = JSON.parse(message);
      if (parsed.type === 'partial' && seenPlatforms.has(parsed.platform)) return;
      if (parsed.type === 'partial') seenPlatforms.add(parsed.platform);
      res.write(`data: ${message}\n\n`);
      if (parsed.type === 'done') cleanup();
    });
    await sub.subscribe(channel);

    const existingResults = await redis.lrange(resultsKey, 0, -1);
    for (const raw of existingResults) {
      const result = JSON.parse(raw);
      if (seenPlatforms.has(result.platform)) continue;
      seenPlatforms.add(result.platform);
      res.write(`data: ${JSON.stringify({ type: 'partial', ...result })}\n\n`);
    }

    const state = await redis.hgetall(stateKey);
    if (state.expected) {
      const expected = JSON.parse(state.expected);
      if (seenPlatforms.size >= expected.length) {
        const total = existingResults.reduce((sum, raw) => sum + (JSON.parse(raw).events?.length || 0), 0);
        res.write(`data: ${JSON.stringify({ type: 'done', total })}\n\n`);
        cleanup();
      }
    }

    req.on('close', cleanup);
  });

  return router;
}

module.exports = { buildSearchRouter };
