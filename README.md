# Twit: Massively Scalable Twitter Clone

A high-performance, dark-web compatible Twitter clone built with modern engineering standards.

## Tech Stack
- **Frontend:** Next.js (App Router), Vanilla CSS, React Server Components.
- **Backend:** Node.js, Express, TypeScript.
- **Database:** PostgreSQL (UUID primary keys, full-text search).
- **Cache:** Memcached (Pre-computed feeds, profile caching).
- **Message Broker:** RabbitMQ (Asynchronous processing for writes).
- **Storage:** S3-compatible (MinIO for development).
- **Infrastructure:** Docker & Docker Compose.

## Key Features
- **Scalable Feed:** Implements a "Fan-out on Write" strategy where tweets are pushed to followers' cached feeds asynchronously.
- **Privacy & Compatibility:** Zero external dependencies (no CDNs, fonts, or scripts). Fully functional without JavaScript using Server Actions.
- **Asynchronous Processing:** Heavy operations (mentions, hashtags, notifications, engagement counts, view tracking) are offloaded to background workers.
- **Advanced Social Mechanics:** Following, Blocking, Muting, Threaded Replies, Likes, Retweets, and @mentions.
- **Discovery:** Full-text search for users and tweets, plus a trending topics sidebar.
- **Collections:** Bookmarks and custom user Lists with dedicated feeds.
- **Messaging:** Private direct messaging between users.

## Getting Started

1. **Prerequisites:** Docker and Docker Compose installed.
2. **Launch Services:**
   ```bash
   docker-compose up --build
   ```
3. **Access Application:**
   - Frontend: `http://localhost:3000`
   - Backend API: `http://localhost:4000/health`
   - MinIO Console: `http://localhost:9001` (root/rootpassword)
   - RabbitMQ Management: `http://localhost:15672` (root/rootpassword)

## Project Structure
- `/frontend`: Next.js application.
- `/backend`: Express API and background workers.
- `/.nira`: Project issue tracking (using `../nira/nira`).

## Engineering Hygiene
- **Testing:** Unit tests for backend logic using Jest.
- **Migrations:** Managed via Knex.js for reproducible schema updates.
- **Containerization:** Clean separation of concerns with a microservices-adjacent architecture.
