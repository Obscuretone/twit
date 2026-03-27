import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add full-text search index to tweets
  await knex.raw(`
    CREATE INDEX idx_tweets_content_search ON tweets USING GIN (to_tsvector('english', content));
  `);

  // Add full-text search index to users
  await knex.raw(`
    CREATE INDEX idx_users_username_search ON users USING GIN (to_tsvector('english', username || ' ' || COALESCE(display_name, '')));
  `);

  // Table to track hashtag frequency
  return knex.schema.createTable("hashtags", (table) => {
    table.string("tag", 100).primary();
    table.integer("tweet_count").defaultTo(0);
    table.timestamp("last_used_at").defaultTo(knex.fn.now());
    
    table.index(["tweet_count"], "idx_hashtags_tweet_count");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_tweets_content_search");
  await knex.raw("DROP INDEX IF EXISTS idx_users_username_search");
  return knex.schema.dropTableIfExists("hashtags");
}
