import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('usage_events', (table) => {
    table.increments('id').primary();
    table
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    table.string('event_type', 50).notNullable(); // e.g. 'project.created', 'api.request'
    table.integer('quantity').notNullable().defaultTo(1);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['organization_id', 'created_at']);
    table.index(['organization_id', 'event_type']);
  });

  await knex.schema.createTable('invoices', (table) => {
    table.increments('id').primary();
    table
      .integer('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    table.timestamp('period_start').notNullable();
    table.timestamp('period_end').notNullable();
    table.integer('amount_cents').notNullable();
    table.string('status', 20).notNullable().defaultTo('draft'); // draft | finalized | paid
    table.jsonb('line_items').notNullable().defaultTo('[]');
    table.timestamps(true, true);

    table.index(['organization_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('invoices');
  await knex.schema.dropTableIfExists('usage_events');
}
