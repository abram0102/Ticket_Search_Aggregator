const {
  createKafka,
  createRedis,
  SEARCH_RESULT,
  createLogger,
  cacheKeyFor,
  CACHE_TTL_SECONDS,
} = require('@ticket-search/shared');

const logger = createLogger('aggregator');
const SEARCH_STATE_TTL_SECONDS = 300;

async function start() {
  const kafka = createKafka('aggregator');
  const consumer = kafka.consumer({ groupId: 'aggregator' });
  const redis = createRedis();

  await consumer.connect();
  await consumer.subscribe({ topic: SEARCH_RESULT, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const result = JSON.parse(message.value.toString());
      const { correlationId, platform } = result;

      const stateKey = `search:${correlationId}:state`;
      const resultsKey = `search:${correlationId}:results`;
      const channel = `search:${correlationId}:events`;

      const state = await redis.hgetall(stateKey);
      if (!state.expected) {
        // State expired or unknown correlationId (e.g. redelivery after TTL).
        logger.warn('no state for correlationId, dropping', { correlationId });
        return;
      }

      const expected = JSON.parse(state.expected);
      const received = JSON.parse(state.received);

      if (received.includes(platform)) {
        // Duplicate delivery from a consumer retry; nothing new to publish.
        return;
      }
      received.push(platform);

      await redis
        .multi()
        .hset(stateKey, 'received', JSON.stringify(received))
        .rpush(resultsKey, JSON.stringify(result))
        .expire(resultsKey, SEARCH_STATE_TTL_SECONDS)
        .publish(channel, JSON.stringify({ type: 'partial', ...result }))
        .exec();

      logger.info('platform result recorded', { correlationId, platform, received: received.length, expected: expected.length });

      if (received.length < expected.length) return;

      const rawResults = await redis.lrange(resultsKey, 0, -1);
      const allResults = rawResults.map((r) => JSON.parse(r));
      const total = allResults.reduce((sum, r) => sum + (r.events?.length || 0), 0);

      await redis.publish(channel, JSON.stringify({ type: 'done', total }));

      const cacheKey = cacheKeyFor({ keyword: state.keyword, city: state.city });
      await redis.set(cacheKey, JSON.stringify(allResults), 'EX', CACHE_TTL_SECONDS);

      logger.info('search complete', { correlationId, total });
    },
  });

  logger.info('aggregator ready');

  async function shutdown() {
    await consumer.disconnect();
    await redis.quit();
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  logger.error('failed to start', { error: err.message });
  process.exit(1);
});
