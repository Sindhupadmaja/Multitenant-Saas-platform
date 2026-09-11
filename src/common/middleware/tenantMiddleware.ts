import { NextFunction, Request, Response } from 'express';
import { Knex } from 'knex';
import { ForbiddenError, UnauthorizedError } from '../errors/ApiError';
import { TenantRole } from '../types/express';

export interface MembershipRow {
  id: number;
  organization_id: number;
  user_id: number;
  role: TenantRole;
}

/**
 * THE tenant-isolation boundary. Every tenant-scoped route goes through
 * this middleware, which:
 *
 *   1. Reads the requested organization from the X-Organization-Id header
 *      (never from a route param or query string alone -- those are
 *      request input, not verified context).
 *   2. Looks up the (organization_id, user_id) row in `memberships`.
 *   3. If it doesn't exist, the request is rejected with 403 -- NOT 404.
 *      A 404 here would tell an attacker "that organization doesn't
 *      exist", which is itself information leakage; 403 is the same
 *      response whether the org exists and they're just not a member, or
 *      the org doesn't exist at all.
 *   4. Only on success does it set `req.organizationId` and
 *      `req.tenantRole` -- every repository method downstream takes
 *      `organizationId` as a mandatory filter parameter, so a route
 *      handler physically cannot query another tenant's data without
 *      explicitly passing the wrong id, which nothing in this codebase
 *      ever does (see tests/integration/tenantIsolation.test.ts).
 */
export function createTenantMiddleware(db: Knex) {
  async function requireTenant(req: Request, _res: Response, next: NextFunction): Promise<void> {
    if (!req.userId) {
      return next(new UnauthorizedError('Authentication required before tenant context can be resolved'));
    }

    const orgHeader = req.headers['x-organization-id'];
    const organizationId = Number(orgHeader);
    if (!orgHeader || Number.isNaN(organizationId)) {
      return next(new ForbiddenError('X-Organization-Id header is required'));
    }

    const membership = await db<MembershipRow>('memberships')
      .where({ organization_id: organizationId, user_id: req.userId })
      .first();

    if (!membership) {
      // Deliberately identical to "you're not a member" -- see docstring.
      return next(new ForbiddenError('You do not have access to this organization'));
    }

    req.organizationId = membership.organization_id;
    req.tenantRole = membership.role;
    return next();
  }

  function requireTenantRole(...roles: TenantRole[]) {
    return (req: Request, _res: Response, next: NextFunction): void => {
      if (!req.tenantRole || !roles.includes(req.tenantRole)) {
        return next(new ForbiddenError(`This action requires one of these roles in the organization: ${roles.join(', ')}`));
      }
      return next();
    };
  }

  return { requireTenant, requireTenantRole };
}
