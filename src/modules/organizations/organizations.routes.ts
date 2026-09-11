import { Request, Response, NextFunction, Router } from 'express';
import { body } from 'express-validator';
import { OrganizationsService } from './organizations.service';
import { checkValidation } from '../../common/middleware/validate';
import { TenantRole } from '../../common/types/express';

const createOrgValidators = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 200 }),
  body('slug')
    .trim()
    .notEmpty()
    .withMessage('slug is required')
    .isLength({ max: 100 })
    .matches(/^[a-z0-9-]+$/)
    .withMessage('slug must be lowercase letters, numbers, and hyphens only'),
];

const addMemberValidators = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('role').isIn(['owner', 'admin', 'member']).withMessage('role must be owner, admin, or member'),
];

export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const org = await this.orgsService.create(req.userId as number, req.body);
      res.status(201).json({ organization: org });
    } catch (err) {
      next(err);
    }
  };

  listMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizations = await this.orgsService.listForUser(req.userId as number);
      res.status(200).json({ organizations });
    } catch (err) {
      next(err);
    }
  };

  listMembers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const members = await this.orgsService.listMembers(req.organizationId as number);
      res.status(200).json({ members });
    } catch (err) {
      next(err);
    }
  };

  addMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const membership = await this.orgsService.addMember(req.userId as number, req.organizationId as number, {
        email: req.body.email,
        role: req.body.role as TenantRole,
      });
      res.status(201).json({ membership });
    } catch (err) {
      next(err);
    }
  };
}

export function createOrganizationsRouter(
  controller: OrganizationsController,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireTenant: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  requireTenantRole: (...roles: TenantRole[]) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/', createOrgValidators, checkValidation, controller.create);
  router.get('/mine', controller.listMine);

  // Everything below needs a resolved tenant context -- the org in question
  // comes from the X-Organization-Id header, verified by requireTenant.
  router.get('/members', requireTenant, controller.listMembers);
  router.post(
    '/members',
    requireTenant,
    requireTenantRole('owner', 'admin'),
    addMemberValidators,
    checkValidation,
    controller.addMember
  );

  return router;
}
