import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('projects', (table) => {
    table.increments('id').primary();
    table
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    table.string('name', 200).notNullable();
    table.text('description').defaultTo('');
    table
      .integer('created_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.timestamps(true, true);

    // Every list/lookup query filters by organization_id first -- this
    // index is what keeps that filter cheap even as tenants and rows grow.
    table.index(['organization_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('projects');
}
