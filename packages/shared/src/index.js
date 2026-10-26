// Loading env first means every service gets the root .env regardless of
// which directory npm actually launched it from.
require('./env');

module.exports = {
  ...require('./kafka'),
  ...require('./redis'),
  ...require('./topics'),
  ...require('./platforms'),
  ...require('./logger'),
  ...require('./adapterRuntime'),
  ...require('./cacheKey'),
};
