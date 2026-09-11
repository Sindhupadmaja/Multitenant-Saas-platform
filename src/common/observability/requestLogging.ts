import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

/**
 * Assigns a correlation ID to every request (or reuses one the caller
 * provided via X-Request-Id, so a request can be traced end-to-end across
 * an API gateway/load balancer that already generated one). Echoed back on
 * the response and included in every error response body, so "here's my
 * request id" is something a user or support engineer can hand you to find
 * exactly the right log lines.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  req.requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : uuidv4();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    logger.info(
      {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId: req.userId,
        organizationId: req.organizationId,
      },
      'request completed'
    );
  });
  next();
}
