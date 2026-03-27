"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
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
async function down(knex) {
    return knex.schema.dropTableIfExists("notifications");
}
//# sourceMappingURL=20260327183929_create_notifications.js.map