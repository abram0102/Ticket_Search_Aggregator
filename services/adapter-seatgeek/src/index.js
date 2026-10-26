const { runAdapter } = require('@ticket-search/shared');
const { PLATFORM, searchEvents } = require('./client');

runAdapter({ platform: PLATFORM, searchEvents }).catch((err) => {
  console.error('adapter-seatgeek failed to start', err);
  process.exit(1);
});
