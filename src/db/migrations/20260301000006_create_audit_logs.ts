import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_logs', (table) => {
    table.increments('id').primary();
    table
      .integer('organization_id')
      .nullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    table
      .integer('actor_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.string('action', 100).notNullable();
    table.string('entity_type', 50).notNullable();
    table.integer('entity_id').notNullable();
    table.jsonb('metadata').notNullable().defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['organization_id']);
    table.index(['entity_type', 'entity_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
}
