"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    return knex.schema.createTable("follows", (table) => {
        table.uuid("follower_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
        table.uuid("following_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
        table.timestamps(true, true);
        table.primary(["follower_id", "following_id"]);
        table.index(["following_id"], "idx_follows_following_id");
    });
}
async function down(knex) {
    return knex.schema.dropTableIfExists("follows");
}
//# sourceMappingURL=20260327183654_create_follows.js.map