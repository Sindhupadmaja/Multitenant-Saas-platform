import { OrganizationsRepository, OrganizationRow } from './organizations.repository';
import { UsersRepository } from '../auth/users.repository';
import { AuditRepository } from '../audit/audit.repository';
import { TenantRole } from '../../common/types/express';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/ApiError';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class OrganizationsService {
  constructor(
    private readonly orgsRepo: OrganizationsRepository,
    private readonly usersRepo: UsersRepository,
    private readonly auditRepo: AuditRepository
  ) {}

  async create(ownerId: number, data: { name: string; slug: string }): Promise<OrganizationRow> {
    const slug = data.slug.toLowerCase().trim();
    if (!SLUG_RE.test(slug)) {
      throw new BadRequestError('slug must be lowercase letters, numbers, and hyphens only');
    }

    const existing = await this.orgsRepo.findBySlug(slug);
    if (existing) {
      throw new ConflictError(`The slug "${slug}" is already taken`);
    }

    const org = await this.orgsRepo.createWithOwner(ownerId, { name: data.name, slug });

    await this.auditRepo.log({
      actorId: ownerId,
      organizationId: org.id,
      action: 'organization.created',
      entityType: 'organization',
      entityId: org.id,
      metadata: { name: org.name, slug: org.slug },
    });

    return org;
  }

  async listForUser(userId: number) {
    return this.orgsRepo.listForUser(userId);
  }

  async listMembers(organizationId: number) {
    return this.orgsRepo.listMembers(organizationId);
  }

  async addMember(
    actorId: number,
    organizationId: number,
    data: { email: string; role: TenantRole }
  ) {
    const user = await this.usersRepo.findByEmail(data.email);
    if (!user) {
      throw new NotFoundError(`No user found with email ${data.email}`);
    }

    const existingMembership = await this.orgsRepo.getMembership(organizationId, user.id);
    if (existingMembership) {
      throw new ConflictError('This user is already a member of the organization');
    }

    const membership = await this.orgsRepo.addMember(organizationId, user.id, data.role);

    await this.auditRepo.log({
      actorId,
      organizationId,
      action: 'member.added',
      entityType: 'membership',
      entityId: membership.id,
      metadata: { addedUserId: user.id, role: data.role },
    });

    return membership;
  }
}
