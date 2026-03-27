# Twitter Clone Project Context

## Architecture & Constraints
- **Goal:** Massively scalable Twitter clone.
- **Frontend:** Next.js (App Router). Strict No-JS support using Server Components and Server Actions.
- **Backend:** Node.js (Express) + TypeScript.
- **Infrastructure:** Dockerized (PostgreSQL, Memcached, RabbitMQ, MinIO).
- **Storage:** S3-compatible media storage (MinIO in dev).
- **Caching:** Memcached for profiles and fan-out feeds.
- **Queues:** RabbitMQ for asynchronous tasks (Mentions, Hashtags, Fan-out, Notifications, Engagement, Analytics, DMs).

## Features
- User Auth & JWT Sessions.
- Tweeting with @mentions, #hashtags, and Image Uploads.
- Personalized Feed (Fan-out strategy).
- Following, Blocking, and Muting (with server-side filtering).
- Likes, Retweets, and Threaded Replies.
- Private Direct Messaging.
- Notifications Center.
- Full-text Search (Tweets & Users).
- Trending Topics.
- Bookmarks & Custom Lists.
- Tweet View Analytics.


## Agent Workflow
1. Open a ticket (using `../nira/nira`).
2. Do the work (implement the feature).
3. Do a code review.
4. Wait for the user to OK it.
5. Commit the work.
6. Push the work to a feature branch.
