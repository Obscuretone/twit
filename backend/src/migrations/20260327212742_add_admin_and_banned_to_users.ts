import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table("users", (table) => {
    table.boolean("is_admin").defaultTo(false);
    table.boolean("is_banned").defaultTo(false);
  });
  
  await knex.schema.table("tweets", (table) => {
    table.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table("users", (table) => {
    table.dropColumn("is_admin");
    table.dropColumn("is_banned");
  });
  
  await knex.schema.table("tweets", (table) => {
    table.dropColumn("deleted_at");
  });
}
