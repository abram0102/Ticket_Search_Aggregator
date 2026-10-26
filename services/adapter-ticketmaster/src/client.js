const axios = require('axios');

const PLATFORM = 'ticketmaster';
const BASE_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

function normalizeEvent(event) {
  const venue = event._embedded?.venues?.[0];
  const priceRange = event.priceRanges?.[0];
  return {
    platform: PLATFORM,
    id: event.id,
    name: event.name,
    venue: venue?.name,
    city: venue?.city?.name,
    date: event.dates?.start?.localDate,
    time: event.dates?.start?.localTime,
    minPrice: priceRange?.min ?? null,
    maxPrice: priceRange?.max ?? null,
    currency: priceRange?.currency ?? null,
    url: event.url,
    imageUrl: event.images?.[0]?.url,
  };
}

async function searchEvents({ keyword, city }) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    throw new Error('TICKETMASTER_API_KEY is not set');
  }

  const { data } = await axios.get(BASE_URL, {
    params: {
      apikey: apiKey,
      keyword,
      city: city || undefined,
      classificationName: 'music',
      size: 20,
    },
    timeout: 8000,
  });

  const events = data._embedded?.events || [];
  return events.map(normalizeEvent);
}

module.exports = { PLATFORM, searchEvents };
