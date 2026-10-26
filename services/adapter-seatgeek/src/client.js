const axios = require('axios');

const PLATFORM = 'seatgeek';
const BASE_URL = 'https://api.seatgeek.com/2/events';

function normalizeEvent(event) {
  const [date, time] = (event.datetime_local || '').split('T');
  return {
    platform: PLATFORM,
    id: event.id,
    name: event.title,
    venue: event.venue?.name,
    city: event.venue?.city,
    date,
    time,
    minPrice: event.stats?.lowest_price ?? null,
    maxPrice: event.stats?.highest_price ?? null,
    currency: 'USD',
    url: event.url,
    imageUrl: event.performers?.[0]?.image,
  };
}

async function searchEvents({ keyword, city }) {
  const clientId = process.env.SEATGEEK_CLIENT_ID;
  if (!clientId) {
    throw new Error('SEATGEEK_CLIENT_ID is not set');
  }

  const { data } = await axios.get(BASE_URL, {
    params: {
      client_id: clientId,
      q: keyword,
      'venue.city': city || undefined,
      'taxonomies.name': 'concert',
      per_page: 20,
    },
    timeout: 8000,
  });

  const events = data.events || [];
  return events.map(normalizeEvent);
}

module.exports = { PLATFORM, searchEvents };
