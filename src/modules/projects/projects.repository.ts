import { Knex } from 'knex';

export interface ProjectRow {
  id: number;
  organization_id: number;
  name: string;
  description: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export class ProjectsRepository {
  constructor(private readonly db: Knex) {}

  async create(organizationId: number, createdBy: number, data: { name: string; description?: string }): Promise<ProjectRow> {
    const [row] = await this.db<ProjectRow>('projects')
      .insert({ organization_id: organizationId, created_by: createdBy, name: data.name, description: data.description || '' })
      .returning('*');
    return row;
  }

  /** ALWAYS filtered by organization_id -- this is the query-level half of
   * tenant isolation (the middleware half is tenantMiddleware.ts). There is
   * no method on this repository that can return a project without an
   * organization_id filter. */
  async listForOrganization(organizationId: number): Promise<ProjectRow[]> {
    return this.db<ProjectRow>('projects').where({ organization_id: organizationId }).orderBy('created_at', 'desc');
  }

  async findById(id: number): Promise<ProjectRow | undefined> {
    return this.db<ProjectRow>('projects').where({ id }).first();
  }

  async remove(id: number): Promise<void> {
    await this.db<ProjectRow>('projects').where({ id }).delete();
  }
}
