# Ticket Search Aggregator

A cross-platform concert ticket meta-search engine. It only aggregates publicly
available listing data and redirects users to the ticketing platform's own
site to complete a purchase — it never handles payments and never resells
tickets.

Currently integrated: **Ticketmaster Discovery API** and **SeatGeek Platform
API** (both offer free, self-serve developer API keys). Platforms without a
self-serve public API (e.g. StubHub, Vivid Seats) are not integrated; the
adapter pattern used here is designed so a new platform can be added as an
isolated consumer service without touching the gateway or aggregator.

> **Personal technical demo project — not for commercial use.**
> See [Legal / Usage Notice](#legal--usage-notice) below.

## Architecture

```
                      ┌────────────────────┐
  Browser ── POST ──► │   api-gateway       │
         ◄── SSE ──── │ (Express)           │
                      └─────────┬──────────┘
                                │ 1. Check Redis cache; return immediately on a hit
                                │ 2. On a miss: write search state to Redis,
                                │    publish a message to Kafka
                                ▼
                     topic: tickets.search.requested
                        │                    │
                        ▼                    ▼
              adapter-ticketmaster   adapter-seatgeek
              (Kafka consumer)       (Kafka consumer)
                 calls official API     calls official API
                        │                    │
                        ▼                    ▼
                     topic: tickets.search.result
                                │
                                ▼
                          aggregator
                 (Kafka consumer, reads/writes Redis)
            - Redis Hash tracks "how many platforms expected / received"
            - publishes a `partial` message over Redis Pub/Sub per platform result
            - once every platform has responded: caches the combined
              result in Redis and publishes a `done` message
                                │
                                ▼
                 api-gateway's SSE connection subscribes to the same
                 Pub/Sub channel and streams partial/done events to
                 the browser in real time
```

**Why this design (even though it's heavier than a personal project strictly
needs):**

- **Kafka** decouples "a search was requested" from "call each platform's
  API" into a scatter/gather pattern: the gateway only has to publish one
  message — it doesn't need to know how many platforms exist, which ones are
  healthy, or how slow any one of them is. Adding a new platform means adding
  a new consumer service; the gateway code never changes.
- **Redis** plays two distinct roles:
  - **Cache**: repeat searches for the same keyword within a short window
    are served from cache instead of re-hitting the upstream APIs (which
    typically enforce rate limits).
  - **Ephemeral state + Pub/Sub**: a Hash tracks "how many platforms are
    expected to respond to this search / how many have responded so far",
    and Pub/Sub pushes each platform's result from the aggregator to the
    gateway's SSE connection in real time — so the UI can reveal results
    platform-by-platform (Kayak/Skyscanner-style) instead of waiting for
    every platform to finish.

## Project layout

```
packages/shared/        Shared across services: Kafka/Redis clients, topic names, logging, adapter runtime
services/api-gateway/   HTTP API + SSE + static frontend
services/adapter-ticketmaster/
services/adapter-seatgeek/
services/aggregator/
docker-compose.yml      Kafka (single-node KRaft) + Redis + Kafka UI
```

## Running locally

1. Start Kafka / Redis:

   ```bash
   npm run docker:up
   ```

   Kafka UI is available at http://localhost:8080 for inspecting topics and
   messages while debugging.

2. Install dependencies from the repo root (npm workspaces links
   `packages/shared` automatically):

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in your own API keys:

   ```bash
   cp .env.example .env
   ```

   - Ticketmaster: register at https://developer.ticketmaster.com/ and grab
     the Consumer Key from "My Apps"
   - SeatGeek: register at https://platform.seatgeek.com/ and grab a Client ID

4. Start each service in its own terminal:

   ```bash
   npm run dev:gateway
   npm run dev:tm
   npm run dev:sg
   npm run dev:agg
   ```

5. Open http://localhost:4000 and search, e.g. keyword `Coldplay`, city
   `Boston`.

## Known simplifications / ideas for extension

- **No timeout or circuit breaker**: if an adapter process itself goes down
  (not just an upstream API error, but the process not running at all), the
  aggregator waits for it forever and the search never reaches `done`. A
  production version would add a per-search timeout and fall back to
  whatever results have arrived by then — a good next exercise.
- **StubHub / Vivid Seats, etc.**: these don't offer a self-serve public API
  (access requires a manually-reviewed Partner Program application), so
  they're not integrated. The adapter pattern already supports adding them
  later as an isolated consumer without changing the gateway or aggregator.
- **No auth / rate limiting**: intentionally left out for a personal project;
  a production deployment would need it (e.g. a Redis token-bucket limiter on
  `/api/search` to protect upstream API quotas).
- **No persistent storage**: all state lives in Redis with a TTL; a "search
  history" feature would need a real database.
- **Kafka runs with a single partition/replica**: fine for a local single
  node; experimenting with multiple consumer instances sharing load would
  require adding partitions to the topics.

## Legal / Usage Notice

This is a **personal technical demo project** built to practice event-driven
architecture (Kafka), caching/real-time fan-in (Redis), and service
decomposition. It is **not intended for commercial use or public production
deployment**, for a concrete reason:

- SeatGeek's Platform API Terms of Use explicitly prohibit using the API "for
  competitive purposes" or to "recreate the features or functionality of
  SeatGeek's services" — a cross-platform ticket meta-search tool falls
  squarely within that restriction.
- Ticketmaster's API Terms of Use similarly prohibit building an application
  that "replicates or attempts to replace the unique essential user
  experience of Ticketmaster.com."

In other words: this is not a criminal-law issue, but running this project
against real API keys to operate a live, public comparison service would
exceed the usage rights granted by both platforms' developer terms, and
either provider could revoke API access at any time. This repository exists
to showcase the system design and code — not as a product, and not as an
endorsement of using these APIs outside their terms. If you want to run it
yourself, do so for personal experimentation only, with your own API keys,
and review the current terms of use for each platform first:

- https://developer.ticketmaster.com/support/terms-of-use/
- https://seatgeek.ca/api-terms (SeatGeek Platform API / SDK Terms)
