import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../errors/ApiError';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return next(new Error('JWT_SECRET is not configured'));
  }

  try {
    const payload = jwt.verify(token, secret);
    if (typeof payload === 'string' || !payload.sub) {
      return next(new UnauthorizedError('Invalid token payload'));
    }
    req.userId = Number(payload.sub);
    return next();
  } catch {
    return next(new UnauthorizedError('Invalid or expired token'));
  }
}
