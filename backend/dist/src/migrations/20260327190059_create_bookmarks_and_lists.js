"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
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
async function down(knex) {
    await knex.schema.dropTableIfExists("list_members");
    await knex.schema.dropTableIfExists("lists");
    return knex.schema.dropTableIfExists("bookmarks");
}
//# sourceMappingURL=20260327190059_create_bookmarks_and_lists.js.map