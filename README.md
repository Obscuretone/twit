# Twit: Scalable Twitter Clone

A massively scalable Twitter clone built with modern best practices for high-performance and "dark web" compatibility (no external assets, fully functional without JS).

## Project Structure
- `/frontend`: Next.js frontend (Server Components, Vanilla CSS).
- `/backend`: Express.js backend (TypeScript, PostgreSQL, Memcached, RabbitMQ).
- `/docker-compose.yml`: Local development environment orchestration.

## Tech Stack
- **Frontend:** Next.js, React, CSS Modules.
- **Backend:** Node.js, Express, TypeScript.
- **Database:** PostgreSQL (with UUIDs for scalability).
- **Cache:** Memcached.
- **Message Broker:** RabbitMQ.
- **Infrastructure:** Docker, Docker Compose.

## Getting Started

1. Ensure you have Docker and Docker Compose installed.
2. Build and start the services:
   ```bash
   docker-compose up --build
   ```
3. Access the frontend at `http://localhost:3000`.
4. Access the backend API at `http://localhost:4000/health`.

## Engineering Standards
- **Testing:** Unit and integration tests for all features.
- **Performance:** Memcached for caching hot data, RabbitMQ for asynchronous tasks.
- **Compatibility:** No external fonts, scripts, or assets. Fully functional without JS using Next.js Server Actions.
- **Scalability:** Horizontal scaling supported for both backend and frontend.
