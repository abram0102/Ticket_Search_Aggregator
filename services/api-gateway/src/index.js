const path = require('path');
const express = require('express');
const cors = require('cors');
const { createKafka, createRedis, createLogger } = require('@ticket-search/shared');
const { buildSearchRouter } = require('./routes/search');

const logger = createLogger('api-gateway');

async function start() {
  const kafka = createKafka('api-gateway');
  const producer = kafka.producer();
  await producer.connect();

  const redis = createRedis();

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', buildSearchRouter({ producer, redis }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const port = process.env.PORT || 4000;
  app.listen(port, () => logger.info(`listening on :${port}`));

  async function shutdown() {
    logger.info('shutting down');
    await producer.disconnect();
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
