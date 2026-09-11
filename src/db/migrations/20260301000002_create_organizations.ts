import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('organizations', (table) => {
    table.increments('id').primary();
    table.string('name', 200).notNullable();
    table.string('slug', 100).notNullable().unique();
    table.string('plan', 20).notNullable().defaultTo('free'); // free | pro | enterprise
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('organizations');
}
