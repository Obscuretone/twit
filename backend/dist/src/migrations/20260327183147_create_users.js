"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    // Ensure the uuid-ossp extension is enabled
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    return knex.schema.createTable("users", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
        table.string("username", 20).notNullable().unique();
        table.string("email", 255).notNullable().unique();
        table.string("password_hash", 255).notNullable();
        table.string("display_name", 50);
        table.text("bio");
        table.string("avatar_url", 255);
        table.timestamps(true, true); // Created_at and updated_at
        // Index for faster lookups
        table.index(["username"], "idx_users_username");
    });
}
async function down(knex) {
    return knex.schema.dropTableIfExists("users");
}
//# sourceMappingURL=20260327183147_create_users.js.map