import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.table("tweets", (table) => {
    table.integer("view_count").defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.table("tweets", (table) => {
    table.dropColumn("view_count");
  });
}
