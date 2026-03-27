import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("follows", (table) => {
    table.uuid("follower_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.uuid("following_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.timestamps(true, true);
    
    table.primary(["follower_id", "following_id"]);
    table.index(["following_id"], "idx_follows_following_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists("follows");
}
