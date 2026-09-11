import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../errors/ApiError';
import { logger } from '../observability/logger';

export function errorHandler(
  err: Error & { code?: string },
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message, requestId: req.requestId });
    return;
  }

  if (err.code === '23505') {
    res.status(409).json({ error: 'Duplicate value violates a unique constraint', requestId: req.requestId });
    return;
  }

  logger.error({ err, requestId: req.requestId }, 'Unexpected error');
  res.status(500).json({ error: 'Internal server error', requestId: req.requestId });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}`, requestId: req.requestId });
}
