import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("likes", (table) => {
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.uuid("tweet_id").notNullable().references("id").inTable("tweets").onDelete("CASCADE");
    table.timestamps(true, true);
    
    table.primary(["user_id", "tweet_id"]);
    table.index(["tweet_id"], "idx_likes_tweet_id");
  });

  return knex.schema.createTable("retweets", (table) => {
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.uuid("tweet_id").notNullable().references("id").inTable("tweets").onDelete("CASCADE");
    table.timestamps(true, true);
    
    table.primary(["user_id", "tweet_id"]);
    table.index(["tweet_id"], "idx_retweets_tweet_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("likes");
  return knex.schema.dropTableIfExists("retweets");
}
