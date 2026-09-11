import { Knex } from 'knex';

export interface UsageEventRow {
  id: number;
  organization_id: number;
  event_type: string;
  quantity: number;
  created_at: string;
}

export interface UsageSummary {
  eventType: string;
  totalQuantity: number;
}

export class UsageRepository {
  constructor(private readonly db: Knex) {}

  async record(organizationId: number, eventType: string, quantity = 1): Promise<UsageEventRow> {
    const [row] = await this.db<UsageEventRow>('usage_events')
      .insert({ organization_id: organizationId, event_type: eventType, quantity })
      .returning('*');
    return row;
  }

  async summarizeForPeriod(organizationId: number, periodStart: Date, periodEnd: Date): Promise<UsageSummary[]> {
    const rows = await this.db<UsageEventRow>('usage_events')
      .where({ organization_id: organizationId })
      .andWhere('created_at', '>=', periodStart)
      .andWhere('created_at', '<', periodEnd)
      .groupBy('event_type')
      .select('event_type')
      .sum<{ event_type: string; total: string }[]>('quantity as total');

    return rows.map((r) => ({ eventType: r.event_type, totalQuantity: Number(r.total) }));
  }
}
