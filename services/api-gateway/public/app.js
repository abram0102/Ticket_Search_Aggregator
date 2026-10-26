const form = document.getElementById('search-form');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');

const PLATFORM_LABEL = {
  ticketmaster: 'Ticketmaster',
  seatgeek: 'SeatGeek',
};

function formatPrice(event) {
  if (event.minPrice == null) return 'Price unavailable';
  const max = event.maxPrice && event.maxPrice !== event.minPrice ? ` - ${event.maxPrice}` : '';
  return `${event.currency || 'USD'} ${event.minPrice}${max}`;
}

function renderEventCard(event) {
  const card = document.createElement('div');
  card.className = 'event-card';
  card.innerHTML = `
    <div class="event-info">
      <span class="badge ${event.platform}">${PLATFORM_LABEL[event.platform] || event.platform}</span>
      <h3>${escapeHtml(event.name || 'Untitled event')}</h3>
      <div class="event-meta">${escapeHtml(event.venue || '')} · ${escapeHtml(event.city || '')} · ${escapeHtml(event.date || '')}</div>
    </div>
    <div class="event-action">
      <span class="price">${formatPrice(event)}</span>
      <a class="buy-link" href="${event.url}" target="_blank" rel="noopener noreferrer">Buy on ${PLATFORM_LABEL[event.platform] || 'platform'}</a>
    </div>
  `;
  return card;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderPlatformResult(payload) {
  if (payload.status === 'error') {
    const err = document.createElement('div');
    err.className = 'platform-error';
    err.textContent = `${PLATFORM_LABEL[payload.platform] || payload.platform} search failed: ${payload.error || 'unknown error'}`;
    resultsEl.appendChild(err);
    return;
  }
  const events = (payload.events || []).sort((a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity));
  events.forEach((event) => resultsEl.appendChild(renderEventCard(event)));
}

function renderCachedResults(results) {
  (results || []).forEach((platformResult) => renderPlatformResult(platformResult));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const keyword = document.getElementById('keyword').value.trim();
  const city = document.getElementById('city').value.trim();
  if (!keyword) return;

  resultsEl.innerHTML = '';
  statusEl.textContent = 'Searching…';
  form.querySelector('button').disabled = true;

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, city }),
    });
    const data = await res.json();

    if (!res.ok) {
      statusEl.textContent = data.error || 'Search failed';
      form.querySelector('button').disabled = false;
      return;
    }

    if (data.cached) {
      statusEl.textContent = '(served from cache)';
      renderCachedResults(data.results);
      form.querySelector('button').disabled = false;
      return;
    }

    const source = new EventSource(`/api/search/${data.correlationId}/stream`);
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'partial') {
        statusEl.textContent = `Received results from ${PLATFORM_LABEL[payload.platform] || payload.platform}…`;
        renderPlatformResult(payload);
      } else if (payload.type === 'done') {
        statusEl.textContent = `Search complete — ${payload.total} results`;
        source.close();
        form.querySelector('button').disabled = false;
      }
    };
    source.onerror = () => {
      statusEl.textContent = 'Connection lost';
      source.close();
      form.querySelector('button').disabled = false;
    };
  } catch (err) {
    statusEl.textContent = 'Network error';
    form.querySelector('button').disabled = false;
  }
});
