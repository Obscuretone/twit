# Twit Backend

Massively scalable Express.js backend for the Twitter clone.

## Tech Stack
- **Runtime:** Node.js (v20+)
- **Language:** TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL (with UUIDs)
- **Caching:** Memcached
- **Queue:** RabbitMQ
- **Testing:** Jest + Supertest

## Getting Started

### Development
```bash
npm install
npm run dev
```

### Testing
```bash
npm test
```

## Architecture
The backend is designed for high-concurrency and scalability. Heavy operations are offloaded to RabbitMQ workers, and frequent reads are cached in Memcached.
