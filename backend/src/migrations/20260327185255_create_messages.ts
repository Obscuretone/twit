import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("messages", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table.uuid("sender_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.uuid("receiver_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.text("content").notNullable();
    table.boolean("read").defaultTo(false);
    table.timestamps(true, true);
    
    table.index(["sender_id", "receiver_id"], "idx_messages_conversation");
    table.index(["receiver_id", "created_at"], "idx_messages_receiver_time");
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists("messages");
}
