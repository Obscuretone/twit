import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Bookmarks
  await knex.schema.createTable("bookmarks", (table) => {
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.uuid("tweet_id").notNullable().references("id").inTable("tweets").onDelete("CASCADE");
    table.timestamps(true, true);
    
    table.primary(["user_id", "tweet_id"]);
  });

  // Lists
  await knex.schema.createTable("lists", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table.uuid("owner_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("name", 100).notNullable();
    table.text("description");
    table.boolean("private").defaultTo(false);
    table.timestamps(true, true);
    
    table.index(["owner_id"], "idx_lists_owner_id");
  });

  // List Members
  return knex.schema.createTable("list_members", (table) => {
    table.uuid("list_id").notNullable().references("id").inTable("lists").onDelete("CASCADE");
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.timestamps(true, true);
    
    table.primary(["list_id", "user_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("list_members");
  await knex.schema.dropTableIfExists("lists");
  return knex.schema.dropTableIfExists("bookmarks");
}
