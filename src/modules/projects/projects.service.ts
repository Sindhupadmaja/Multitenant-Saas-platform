import { ProjectsRepository, ProjectRow } from './projects.repository';
import { CacheService } from '../../common/cache/cacheService';
import { AuditRepository } from '../audit/audit.repository';
import { UsageRepository } from '../billing/usage.repository';
import { ForbiddenError, NotFoundError } from '../../common/errors/ApiError';

const LIST_CACHE_TTL_SECONDS = 30;

function listCacheKey(organizationId: number): string {
  return `org:${organizationId}:projects`;
}

export class ProjectsService {
  constructor(
    private readonly projectsRepo: ProjectsRepository,
    private readonly cache: CacheService,
    private readonly auditRepo: AuditRepository,
    private readonly usageRepo: UsageRepository
  ) {}

  async create(organizationId: number, userId: number, data: { name: string; description?: string }): Promise<ProjectRow> {
    const project = await this.projectsRepo.create(organizationId, userId, data);

    // A write invalidates the cache immediately, rather than waiting out
    // the TTL -- see CacheService's docstring on why this matters.
    await this.cache.invalidate(listCacheKey(organizationId));

    await this.auditRepo.log({
      actorId: userId,
      organizationId,
      action: 'project.created',
      entityType: 'project',
      entityId: project.id,
      metadata: { name: project.name },
    });

    // Billing metering hook: every project creation counts toward this
    // tenant's usage for the current billing period. This is what the
    // invoice-generation background job aggregates.
    await this.usageRepo.record(organizationId, 'project.created', 1);

    return project;
  }

  /** Cache-aside: a cache hit skips the database read entirely.
   * `hit`/`miss` is surfaced in the response (see projects.routes.ts) so
   * it's directly observable in tests and in a real client, not just an
   * internal implementation detail. */
  async listForOrganization(organizationId: number): Promise<{ items: ProjectRow[]; cacheHit: boolean }> {
    const { value, hit } = await this.cache.getOrSet(listCacheKey(organizationId), LIST_CACHE_TTL_SECONDS, () =>
      this.projectsRepo.listForOrganization(organizationId)
    );
    return { items: value, cacheHit: hit };
  }

  async getById(organizationId: number, projectId: number): Promise<ProjectRow> {
    const project = await this.projectsRepo.findById(projectId);
    if (!project) throw new NotFoundError('Project not found');
    if (project.organization_id !== organizationId) {
      // Same principle as tenantMiddleware: a project belonging to another
      // tenant is treated identically to a project that doesn't exist at
      // all, from this tenant's point of view.
      throw new NotFoundError('Project not found');
    }
    return project;
  }

  async remove(organizationId: number, userId: number, projectId: number, role: string): Promise<void> {
    const project = await this.getById(organizationId, projectId);
    if (role === 'member' && project.created_by !== userId) {
      throw new ForbiddenError('Only the project creator, an admin, or the owner can delete this project');
    }

    await this.projectsRepo.remove(project.id);
    await this.cache.invalidate(listCacheKey(organizationId));
    await this.auditRepo.log({
      actorId: userId,
      organizationId,
      action: 'project.deleted',
      entityType: 'project',
      entityId: project.id,
      metadata: {},
    });
  }
}
