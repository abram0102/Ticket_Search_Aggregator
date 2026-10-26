const { Kafka, logLevel } = require('kafkajs');

function createKafka(clientId) {
  return new Kafka({
    clientId,
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    logLevel: logLevel.ERROR,
    retry: { initialRetryTime: 300, retries: 8 },
  });
}

module.exports = { createKafka };
