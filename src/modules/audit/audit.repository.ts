import { Knex } from 'knex';

export interface AuditLogRow {
  id: number;
  organization_id: number | null;
  actor_id: number | null;
  action: string;
  entity_type: string;
  entity_id: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export class AuditRepository {
  constructor(private readonly db: Knex) {}

  async log(
    entry: {
      actorId: number | null;
      organizationId: number | null;
      action: string;
      entityType: string;
      entityId: number;
      metadata?: Record<string, unknown>;
    },
    trx?: Knex
  ): Promise<AuditLogRow> {
    const executor = trx || this.db;
    const [row] = await executor<AuditLogRow>('audit_logs')
      .insert({
        organization_id: entry.organizationId,
        actor_id: entry.actorId,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        metadata: entry.metadata || {},
      })
      .returning('*');
    return row;
  }

  /** ALWAYS scoped to an organization -- there is no "list audit logs
   * across all tenants" method on this repository. A platform-wide admin
   * tool would need its own explicitly-named method, not a missing filter
   * on this one. */
  async listForOrganization(
    organizationId: number,
    filters: { entityType?: string; action?: string } = {},
    options: { page?: number; limit?: number } = {}
  ): Promise<PaginatedResult<AuditLogRow>> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(200, Math.max(1, options.limit ?? 50));
    const offset = (page - 1) * limit;

    const baseQuery = this.db<AuditLogRow>('audit_logs').where({ organization_id: organizationId });
    if (filters.entityType) baseQuery.andWhere({ entity_type: filters.entityType });
    if (filters.action) baseQuery.andWhere({ action: filters.action });

    const totalResult = await baseQuery.clone().count<{ count: string }[]>('id as count').first();
    const total = Number(totalResult?.count ?? 0);
    const items = await baseQuery.clone().orderBy('created_at', 'desc').limit(limit).offset(offset);

    return { items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }
}
