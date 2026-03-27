"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
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
async function down(knex) {
    return knex.schema.dropTableIfExists("messages");
}
//# sourceMappingURL=20260327185255_create_messages.js.map