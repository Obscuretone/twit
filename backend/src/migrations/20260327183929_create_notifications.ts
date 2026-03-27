import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("notifications", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("type", 20).notNullable(); // 'mention', 'follow'
    table.uuid("from_user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.uuid("tweet_id").references("id").inTable("tweets").onDelete("SET NULL");
    table.boolean("read").defaultTo(false);
    table.timestamps(true, true);
    
    table.index(["user_id"], "idx_notifications_user_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists("notifications");
}
