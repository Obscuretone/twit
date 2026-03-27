"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable("blocks", (table) => {
        table.uuid("blocker_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
        table.uuid("blocked_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
        table.timestamps(true, true);
        table.primary(["blocker_id", "blocked_id"]);
        table.index(["blocked_id"], "idx_blocks_blocked_id");
    });
    return knex.schema.createTable("mutes", (table) => {
        table.uuid("muter_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
        table.uuid("muted_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
        table.timestamps(true, true);
        table.primary(["muter_id", "muted_id"]);
        table.index(["muted_id"], "idx_mutes_muted_id");
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists("blocks");
    return knex.schema.dropTableIfExists("mutes");
}
//# sourceMappingURL=20260327185754_create_blocks_and_mutes.js.map