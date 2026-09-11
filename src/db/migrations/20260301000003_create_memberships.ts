import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('memberships', (table) => {
    table.increments('id').primary();
    table
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('role', 20).notNullable().defaultTo('member'); // owner | admin | member
    table.timestamps(true, true);

    // A user has exactly one role per organization -- this is the row
    // every tenant-isolation check (tenantMiddleware.ts) queries against.
    table.unique(['organization_id', 'user_id']);
    table.index(['user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('memberships');
}
