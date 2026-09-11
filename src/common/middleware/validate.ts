import { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { BadRequestError } from '../errors/ApiError';

export function checkValidation(req: Request, _res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors
      .array()
      .map((e) => `${'path' in e ? e.path : 'field'}: ${e.msg}`)
      .join('; ');
    return next(new BadRequestError(message));
  }
  return next();
}
