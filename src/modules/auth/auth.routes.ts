import { Request, Response, NextFunction, Router } from 'express';
import { body } from 'express-validator';
import { AuthService } from './auth.service';
import { checkValidation } from '../../common/middleware/validate';

const registerValidators = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

const loginValidators = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.register(req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.login(req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();
  router.post('/register', registerValidators, checkValidation, controller.register);
  router.post('/login', loginValidators, checkValidation, controller.login);
  return router;
}
