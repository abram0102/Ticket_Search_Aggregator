const crypto = require('crypto');

const CACHE_TTL_SECONDS = 120;

// The gateway computes this key to check for a fresh cached result before
// touching Kafka; the aggregator computes the same key to write the final
// combined result once every platform has answered.
function cacheKeyFor({ keyword, city }) {
  const normalized = JSON.stringify({
    keyword: (keyword || '').trim().toLowerCase(),
    city: (city || '').trim().toLowerCase(),
  });
  const hash = crypto.createHash('sha1').update(normalized).digest('hex');
  return `cache:search:${hash}`;
}

module.exports = { cacheKeyFor, CACHE_TTL_SECONDS };
