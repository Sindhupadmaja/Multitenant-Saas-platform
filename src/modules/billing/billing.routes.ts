import { Request, Response, NextFunction, Router } from 'express';
import { body } from 'express-validator';
import { Queue } from 'bullmq';
import { BillingService } from './billing.service';
import { GenerateInvoiceJobData } from '../../jobs/invoiceQueue';
import { checkValidation } from '../../common/middleware/validate';
import { TenantRole } from '../../common/types/express';

const generateInvoiceValidators = [
  body('periodStart').isISO8601().withMessage('periodStart must be an ISO 8601 date'),
  body('periodEnd').isISO8601().withMessage('periodEnd must be an ISO 8601 date'),
];

export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly invoiceQueue: Queue<GenerateInvoiceJobData>
  ) {}

  /** Enqueues the job and returns immediately with 202 Accepted + a job id
   * -- this route does NOT wait for the invoice to actually be generated.
   * That's the point of a background job: the HTTP response doesn't block
   * on the aggregation work. Poll GET /invoices or check job status via the
   * returned jobId to see the result. */
  generateInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const job = await this.invoiceQueue.add('generate-invoice', {
        organizationId: req.organizationId as number,
        periodStart: req.body.periodStart,
        periodEnd: req.body.periodEnd,
      });
      res.status(202).json({ jobId: job.id, status: 'queued' });
    } catch (err) {
      next(err);
    }
  };

  listInvoices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const invoices = await this.billingService.listInvoices(req.organizationId as number);
      res.status(200).json({ invoices });
    } catch (err) {
      next(err);
    }
  };
}

export function createBillingRouter(
  controller: BillingController,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireTenant: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  requireTenantRole: (...roles: TenantRole[]) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  router.use(requireAuth, requireTenant);

  router.post(
    '/invoices/generate',
    requireTenantRole('owner', 'admin'),
    generateInvoiceValidators,
    checkValidation,
    controller.generateInvoice
  );
  router.get('/invoices', controller.listInvoices);

  return router;
}
