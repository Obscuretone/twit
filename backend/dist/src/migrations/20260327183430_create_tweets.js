"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    return knex.schema.createTable("tweets", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
        table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
        table.string("content", 280).notNullable();
        table.timestamps(true, true);
        table.index(["user_id"], "idx_tweets_user_id");
        table.index(["created_at"], "idx_tweets_created_at");
    });
}
async function down(knex) {
    return knex.schema.dropTableIfExists("tweets");
}
//# sourceMappingURL=20260327183430_create_tweets.js.map