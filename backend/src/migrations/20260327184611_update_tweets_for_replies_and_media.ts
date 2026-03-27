import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.table("tweets", (table) => {
    table.uuid("parent_tweet_id").references("id").inTable("tweets").onDelete("SET NULL");
    table.string("media_url", 255);
    table.integer("reply_count").defaultTo(0);
    table.integer("like_count").defaultTo(0);
    table.integer("retweet_count").defaultTo(0);
    
    table.index(["parent_tweet_id"], "idx_tweets_parent_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.table("tweets", (table) => {
    table.dropIndex(["parent_tweet_id"], "idx_tweets_parent_id");
    table.dropColumn("parent_tweet_id");
    table.dropColumn("media_url");
    table.dropColumn("reply_count");
    table.dropColumn("like_count");
    table.dropColumn("retweet_count");
  });
}
