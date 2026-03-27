"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    return knex.schema.table("tweets", (table) => {
        table.integer("view_count").defaultTo(0);
    });
}
async function down(knex) {
    return knex.schema.table("tweets", (table) => {
        table.dropColumn("view_count");
    });
}
//# sourceMappingURL=20260327190542_add_view_count_to_tweets.js.map