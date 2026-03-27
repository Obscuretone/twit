# Twitter Clone Project Context

## Engineering Standards
- **Testing:** ALWAYS include unit tests for new features. Use Jest for both frontend and backend.
- **Hygiene:** Ensure every module has a `README.md`. Maintain clean code, proper typing, and linting.
- **Privacy:** NO external dependencies (CDNs, fonts, etc.). Bundle everything locally.
- **Scalability:** Use UUIDs for all primary keys. Use caching (Memcached) and queues (RabbitMQ) for all heavy/frequent operations.
- **Compatibility:** Ensure the frontend works fully with JavaScript disabled (using Server Actions).


## Agent Workflow
1. Open a ticket (using `../nira/nira`).
2. Do the work (implement the feature).
3. Do a code review.
4. Wait for the user to OK it.
5. Commit the work.
6. Push the work to a feature branch.
