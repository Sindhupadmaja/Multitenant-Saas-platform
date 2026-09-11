import { Queue } from 'bullmq';
import { ConnectionOptions } from 'bullmq';

export const INVOICE_QUEUE_NAME = 'invoice-generation';

export interface GenerateInvoiceJobData {
  organizationId: number;
  periodStart: string; // ISO string -- job payloads are serialized to JSON, so Date wouldn't survive the round-trip
  periodEnd: string;
}

export function createInvoiceQueue(connection: ConnectionOptions): Queue<GenerateInvoiceJobData> {
  return new Queue<GenerateInvoiceJobData>(INVOICE_QUEUE_NAME, { connection });
}
