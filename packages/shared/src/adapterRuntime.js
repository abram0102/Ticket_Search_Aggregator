const { createKafka } = require('./kafka');
const { SEARCH_REQUESTED, SEARCH_RESULT } = require('./topics');
const { createLogger } = require('./logger');

// Both platform adapters do the exact same dance: consume a search request,
// call the platform's own API, publish a normalized result (success or
// error) back onto SEARCH_RESULT. This runner is the only thing that
// differs between adapters by `platform` and `searchEvents`.
async function runAdapter({ platform, searchEvents }) {
  const logger = createLogger(`adapter-${platform}`);
  const kafka = createKafka(`adapter-${platform}`);
  const consumer = kafka.consumer({ groupId: `adapter-${platform}` });
  const producer = kafka.producer();

  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: SEARCH_REQUESTED, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const request = JSON.parse(message.value.toString());
      const { correlationId, keyword, city, platforms } = request;

      if (!platforms.includes(platform)) return;

      let result;
      try {
        const events = await searchEvents({ keyword, city });
        result = { correlationId, platform, status: 'ok', events, respondedAt: Date.now() };
        logger.info('search ok', { correlationId, count: events.length });
      } catch (err) {
        result = { correlationId, platform, status: 'error', error: err.message, respondedAt: Date.now() };
        logger.error('search failed', { correlationId, error: err.message });
      }

      await producer.send({
        topic: SEARCH_RESULT,
        messages: [{ key: correlationId, value: JSON.stringify(result) }],
      });
    },
  });

  logger.info('adapter ready');

  async function shutdown() {
    await consumer.disconnect();
    await producer.disconnect();
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { runAdapter };
