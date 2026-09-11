import express, { Express, Router } from 'express';
import cors from 'cors';
import { Knex } from 'knex';
import Redis from 'ioredis';
import { Queue } from 'bullmq';

import { UsersRepository } from './modules/auth/users.repository';
import { AuthService } from './modules/auth/auth.service';
import { AuthController, createAuthRouter } from './modules/auth/auth.routes';

import { OrganizationsRepository } from './modules/organizations/organizations.repository';
import { OrganizationsService } from './modules/organizations/organizations.service';
import { OrganizationsController, createOrganizationsRouter } from './modules/organizations/organizations.routes';

import { ProjectsRepository } from './modules/projects/projects.repository';
import { ProjectsService } from './modules/projects/projects.service';
import { ProjectsController, createProjectsRouter } from './modules/projects/projects.routes';

import { UsageRepository } from './modules/billing/usage.repository';
import { InvoicesRepository } from './modules/billing/invoices.repository';
import { BillingService } from './modules/billing/billing.service';
import { BillingController, createBillingRouter } from './modules/billing/billing.routes';
import { GenerateInvoiceJobData } from './jobs/invoiceQueue';

import { AuditRepository } from './modules/audit/audit.repository';

import { CacheService } from './common/cache/cacheService';
import { requireAuth } from './common/middleware/authMiddleware';
import { createTenantMiddleware } from './common/middleware/tenantMiddleware';
import { errorHandler, notFoundHandler } from './common/middleware/errorMiddleware';
import { requestIdMiddleware, requestLoggingMiddleware } from './common/observability/requestLogging';
import { metricsMiddleware, metricsHandler } from './common/observability/metrics';

export interface AppDependencies {
  db: Knex;
  redis: Redis;
  invoiceQueue: Queue<GenerateInvoiceJobData>;
}

export function createApp({ db, redis, invoiceQueue }: AppDependencies): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(requestIdMiddleware);
  app.use(metricsMiddleware);
  if (process.env.NODE_ENV !== 'test') {
    app.use(requestLoggingMiddleware);
  }

  // --- repositories ---
  const usersRepo = new UsersRepository(db);
  const orgsRepo = new OrganizationsRepository(db);
  const projectsRepo = new ProjectsRepository(db);
  const usageRepo = new UsageRepository(db);
  const invoicesRepo = new InvoicesRepository(db);
  const auditRepo = new AuditRepository(db);

  // --- services ---
  const jwtSecret = process.env.JWT_SECRET || 'insecure-dev-secret-do-not-use-in-production';
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
  const authService = new AuthService(usersRepo, jwtSecret, jwtExpiresIn);
  const orgsService = new OrganizationsService(orgsRepo, usersRepo, auditRepo);
  const cache = new CacheService(redis);
  const projectsService = new ProjectsService(projectsRepo, cache, auditRepo, usageRepo);
  const billingService = new BillingService(usageRepo, invoicesRepo, orgsRepo, auditRepo);

  // --- middleware ---
  const { requireTenant, requireTenantRole } = createTenantMiddleware(db);

  // --- controllers ---
  const authController = new AuthController(authService);
  const orgsController = new OrganizationsController(orgsService);
  const projectsController = new ProjectsController(projectsService);
  const billingController = new BillingController(billingService, invoiceQueue);

  // --- health, metrics ---
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/metrics', metricsHandler);

  // --- API v1 ---
  const v1 = Router();
  v1.use('/auth', createAuthRouter(authController));
  v1.use('/organizations', createOrganizationsRouter(orgsController, requireAuth, requireTenant, requireTenantRole));
  v1.use('/projects', createProjectsRouter(projectsController, requireAuth, requireTenant, requireTenantRole));
  v1.use('/billing', createBillingRouter(billingController, requireAuth, requireTenant, requireTenantRole));
  app.use('/api/v1', v1);

  // --- API v2 ---
  // Deliberately minimal, but genuinely functional (not a stub route) --
  // proves v1 and v2 coexist and can diverge independently while sharing
  // the same service layer underneath. v2's project list wraps results in
  // a {data, meta} envelope instead of v1's {items} shape, and includes a
  // computed `projectCount` -- the kind of small, real breaking change that
  // is exactly why API versioning exists in the first place.
  const v2 = Router();
  v2.get('/health', (_req, res) => res.json({ status: 'ok', version: 'v2' }));
  v2.use('/projects', requireAuth, requireTenant, async (req, res, next) => {
    try {
      const { items, cacheHit } = await projectsService.listForOrganization(req.organizationId as number);
      res.setHeader('X-Cache', cacheHit ? 'HIT' : 'MISS');
      res.status(200).json({
        data: items.map((p) => ({ id: p.id, name: p.name, description: p.description })),
        meta: { projectCount: items.length },
      });
    } catch (err) {
      next(err);
    }
  });
  app.use('/api/v2', v2);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
