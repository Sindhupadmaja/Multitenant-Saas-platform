import { Knex } from 'knex';

export interface InvoiceRow {
  id: number;
  organization_id: number;
  period_start: string;
  period_end: string;
  amount_cents: number;
  status: 'draft' | 'finalized' | 'paid';
  line_items: Array<{ description: string; amountCents: number }>;
  created_at: string;
  updated_at: string;
}

export class InvoicesRepository {
  constructor(private readonly db: Knex) {}

  async create(data: {
    organizationId: number;
    periodStart: Date;
    periodEnd: Date;
    amountCents: number;
    lineItems: Array<{ description: string; amountCents: number }>;
  }): Promise<InvoiceRow> {
    const [row] = await this.db<InvoiceRow>('invoices')
      .insert({
        organization_id: data.organizationId,
        period_start: data.periodStart.toISOString(),
        period_end: data.periodEnd.toISOString(),
        amount_cents: data.amountCents,
        status: 'finalized',
        // Unlike a plain jsonb object (see audit_logs' `metadata` column,
        // which the pg driver serializes automatically), an ARRAY passed
        // directly to a jsonb column fails at the driver level with this
        // knex/pg version ("invalid input syntax for type json") --
        // confirmed by testing both forms directly against Postgres.
        // Stringifying explicitly here is the fix; knex/pg parses it back
        // into a real array on read (see InvoiceRow.line_items' type).
        line_items: JSON.stringify(data.lineItems) as unknown as InvoiceRow['line_items'],
      })
      .returning('*');
    return row;
  }

  async listForOrganization(organizationId: number): Promise<InvoiceRow[]> {
    return this.db<InvoiceRow>('invoices').where({ organization_id: organizationId }).orderBy('period_start', 'desc');
  }

  async existsForPeriod(organizationId: number, periodStart: Date, periodEnd: Date): Promise<boolean> {
    const row = await this.db<InvoiceRow>('invoices')
      .where({ organization_id: organizationId })
      .andWhere('period_start', periodStart)
      .andWhere('period_end', periodEnd)
      .first();
    return !!row;
  }
}
