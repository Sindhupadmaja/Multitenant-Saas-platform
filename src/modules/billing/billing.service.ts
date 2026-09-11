import { UsageRepository } from './usage.repository';
import { InvoicesRepository, InvoiceRow } from './invoices.repository';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { AuditRepository } from '../audit/audit.repository';
import { ConflictError, NotFoundError } from '../../common/errors/ApiError';

/** Illustrative pricing -- documented here as a single source of truth
 * rather than scattered magic numbers, same spirit as the cancellation
 * policy in the Service Booking Platform project. A real billing system
 * would load this from a pricing/plans table; a flat constant is the right
 * amount of complexity for what this project needs to demonstrate. */
const BASE_FEE_CENTS: Record<string, number> = { free: 0, pro: 2900, enterprise: 9900 };
const PRICE_PER_EVENT_CENTS: Record<string, number> = { 'project.created': 50 };

export class BillingService {
  constructor(
    private readonly usageRepo: UsageRepository,
    private readonly invoicesRepo: InvoicesRepository,
    private readonly orgsRepo: OrganizationsRepository,
    private readonly auditRepo: AuditRepository
  ) {}

  /** The actual invoice-generation logic -- called synchronously by the
   * route for immediate feedback in tests/small deployments, and
   * asynchronously by the BullMQ worker (jobs/invoiceWorker.ts) for real
   * production traffic, where you don't want a billing run blocking an HTTP
   * response. Same function either way -- the queue is a delivery
   * mechanism, not a second implementation. */
  async generateInvoiceForPeriod(organizationId: number, periodStart: Date, periodEnd: Date): Promise<InvoiceRow> {
    const org = await this.orgsRepo.findById(organizationId);
    if (!org) throw new NotFoundError('Organization not found');

    const alreadyExists = await this.invoicesRepo.existsForPeriod(organizationId, periodStart, periodEnd);
    if (alreadyExists) {
      throw new ConflictError('An invoice for this period already exists');
    }

    const usage = await this.usageRepo.summarizeForPeriod(organizationId, periodStart, periodEnd);

    const lineItems: Array<{ description: string; amountCents: number }> = [
      { description: `${org.plan} plan base fee`, amountCents: BASE_FEE_CENTS[org.plan] ?? 0 },
    ];

    for (const u of usage) {
      const unitPrice = PRICE_PER_EVENT_CENTS[u.eventType];
      if (unitPrice) {
        lineItems.push({
          description: `${u.eventType} x${u.totalQuantity} @ $${(unitPrice / 100).toFixed(2)}`,
          amountCents: unitPrice * u.totalQuantity,
        });
      }
    }

    const amountCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);

    const invoice = await this.invoicesRepo.create({
      organizationId,
      periodStart,
      periodEnd,
      amountCents,
      lineItems,
    });

    await this.auditRepo.log({
      actorId: null, // system-generated, not a user action
      organizationId,
      action: 'invoice.generated',
      entityType: 'invoice',
      entityId: invoice.id,
      metadata: { amountCents, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() },
    });

    return invoice;
  }

  async listInvoices(organizationId: number): Promise<InvoiceRow[]> {
    return this.invoicesRepo.listForOrganization(organizationId);
  }
}
