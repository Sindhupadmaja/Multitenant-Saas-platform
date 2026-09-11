import { Request, Response, NextFunction, Router } from 'express';
import { body, param } from 'express-validator';
import { ProjectsService } from './projects.service';
import { checkValidation } from '../../common/middleware/validate';
import { TenantRole } from '../../common/types/express';

const createProjectValidators = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 200 }),
  body('description').optional().isString().isLength({ max: 5000 }),
];

const projectIdParamValidator = [param('id').isInt().withMessage('Invalid project id').toInt()];

export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const project = await this.projectsService.create(req.organizationId as number, req.userId as number, req.body);
      res.status(201).json({ project });
    } catch (err) {
      next(err);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { items, cacheHit } = await this.projectsService.listForOrganization(req.organizationId as number);
      res.setHeader('X-Cache', cacheHit ? 'HIT' : 'MISS');
      res.status(200).json({ items });
    } catch (err) {
      next(err);
    }
  };

  getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const project = await this.projectsService.getById(req.organizationId as number, Number(req.params.id));
      res.status(200).json({ project });
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.projectsService.remove(
        req.organizationId as number,
        req.userId as number,
        Number(req.params.id),
        req.tenantRole as string
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}

export function createProjectsRouter(
  controller: ProjectsController,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireTenant: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  _requireTenantRole: (...roles: TenantRole[]) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  router.use(requireAuth, requireTenant);

  router.post('/', createProjectValidators, checkValidation, controller.create);
  router.get('/', controller.list);
  router.get('/:id', projectIdParamValidator, checkValidation, controller.getOne);
  router.delete('/:id', projectIdParamValidator, checkValidation, controller.remove);

  return router;
}
