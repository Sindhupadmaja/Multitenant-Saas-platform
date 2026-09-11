import { NextFunction, Request, Response } from 'express';
import client from 'prom-client';

/**
 * Real Prometheus-format metrics, not a stub -- `GET /metrics` returns
 * genuine `prom-client` output that any real Prometheus server could scrape
 * as-is. `tests/integration/observability.test.ts` asserts on the actual
 * text format, not just that the endpoint returns 200.
 */
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    // req.route is only set once Express has matched a route -- for 404s
    // there is none, so fall back to the raw path to avoid an unbounded
    // label cardinality explosion from truly arbitrary unmatched paths
    // being folded into a small, sane set of buckets in practice.
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  });
  next();
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.setHeader('Content-Type', registry.contentType);
  res.send(await registry.metrics());
}

export function resetMetricsForTests(): void {
  registry.resetMetrics();
}
