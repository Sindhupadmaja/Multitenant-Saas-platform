import { Knex } from 'knex';
import { TenantRole } from '../../common/types/express';

export interface OrganizationRow {
  id: number;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
  created_at: string;
  updated_at: string;
}

export interface MembershipRow {
  id: number;
  organization_id: number;
  user_id: number;
  role: TenantRole;
  created_at: string;
  updated_at: string;
}

export interface MembershipWithUser extends MembershipRow {
  user_name: string;
  user_email: string;
}

export class OrganizationsRepository {
  constructor(private readonly db: Knex) {}

  /** Creates an organization and its founding 'owner' membership atomically
   * -- same principle as ProjectsRepository.createWithOwner in the Team
   * Collaboration API project: an organization that exists with no owner
   * would be a genuinely broken state, so the transaction makes that state
   * unreachable rather than just "unlikely". */
  async createWithOwner(ownerId: number, data: { name: string; slug: string }): Promise<OrganizationRow> {
    return this.db.transaction(async (trx) => {
      const [org] = await trx<OrganizationRow>('organizations')
        .insert({ name: data.name, slug: data.slug })
        .returning('*');

      await trx<MembershipRow>('memberships').insert({
        organization_id: org.id,
        user_id: ownerId,
        role: 'owner',
      });

      return org;
    });
  }

  async findById(id: number): Promise<OrganizationRow | undefined> {
    return this.db<OrganizationRow>('organizations').where({ id }).first();
  }

  async findBySlug(slug: string): Promise<OrganizationRow | undefined> {
    return this.db<OrganizationRow>('organizations').where({ slug }).first();
  }

  async getMembership(organizationId: number, userId: number): Promise<MembershipRow | undefined> {
    return this.db<MembershipRow>('memberships').where({ organization_id: organizationId, user_id: userId }).first();
  }

  async addMember(organizationId: number, userId: number, role: TenantRole): Promise<MembershipRow> {
    const [row] = await this.db<MembershipRow>('memberships')
      .insert({ organization_id: organizationId, user_id: userId, role })
      .returning('*');
    return row;
  }

  async listMembers(organizationId: number): Promise<MembershipWithUser[]> {
    return this.db<MembershipRow>('memberships')
      .join('users', 'users.id', 'memberships.user_id')
      .where('memberships.organization_id', organizationId)
      .select(
        'memberships.*',
        'users.name as user_name',
        'users.email as user_email'
      )
      .orderBy('memberships.created_at', 'asc');
  }

  async listForUser(userId: number): Promise<(OrganizationRow & { role: TenantRole })[]> {
    return this.db<OrganizationRow>('organizations')
      .join('memberships', 'memberships.organization_id', 'organizations.id')
      .where('memberships.user_id', userId)
      .select('organizations.*', 'memberships.role')
      .orderBy('organizations.created_at', 'desc');
  }
}
