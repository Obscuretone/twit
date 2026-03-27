"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.table("users", (table) => {
        table.boolean("is_admin").defaultTo(false);
        table.boolean("is_banned").defaultTo(false);
    });
    await knex.schema.table("tweets", (table) => {
        table.timestamp("deleted_at").nullable();
    });
}
async function down(knex) {
    await knex.schema.table("users", (table) => {
        table.dropColumn("is_admin");
        table.dropColumn("is_banned");
    });
    await knex.schema.table("tweets", (table) => {
        table.dropColumn("deleted_at");
    });
}
//# sourceMappingURL=20260327212742_add_admin_and_banned_to_users.js.map