# Twit

An experimental social application built with Express and TypeScript. It uses
PostgreSQL for durable data, RabbitMQ for background jobs, Memcached for cached
feeds, and MinIO for local S3-compatible media storage.

The current interface is server-rendered EJS with local CSS and assets. An
earlier Next.js frontend was removed; the application now runs in the backend
container. This is a prototype, without a production scalability claim.

## Explore the implementation

- `backend/src/app.ts`: HTTP routes and application middleware
- `backend/src/worker.ts`: asynchronous job processing
- `backend/src/migrations/`: Knex database migrations
- `backend/src/__tests__/`: Jest/Supertest tests
- `docker-compose.yml`: local service topology

## Local setup

Requires Docker and Docker Compose:

```sh
docker compose up --build
```

Open the application at <http://localhost:3000> and the health endpoint at
<http://localhost:3000/health>. MinIO's console runs on port 9001 and RabbitMQ's
management UI on port 15672.

The Compose file uses fixed, disposable development credentials. It is a local
demo configuration. Review service exposure, credentials, database migrations,
and failure handling before considering another deployment environment.

## Checks

With Node.js and npm installed:

```sh
cd backend
npm ci
npm run build
npm test -- --runInBand
```

Tests and type checking should be assessed independently: the development
Dockerfile currently tolerates a failed TypeScript build. A running container
alone is not evidence that those checks pass.

## Repository hygiene

Dependencies are restored from `backend/package-lock.json` using `npm ci`.
`node_modules`, compiled `dist` output, local environment files, and the local
Nira issue database are ignored. Source files, tests, migrations, and lockfiles
remain versioned. See [CONTRIBUTING.md](CONTRIBUTING.md) for commit guidance.
