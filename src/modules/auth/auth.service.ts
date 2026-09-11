import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { UsersRepository, toPublicUser, PublicUser } from './users.repository';
import { ConflictError, UnauthorizedError } from '../../common/errors/ApiError';

export interface AuthResult {
  user: PublicUser;
  token: string;
}

export class AuthService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly jwtSecret: string,
    private readonly jwtExpiresIn: string = '7d'
  ) {}

  async register(input: { name: string; email: string; password: string }): Promise<AuthResult> {
    const existing = await this.usersRepo.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(input.password, 10);
    const row = await this.usersRepo.create({ name: input.name, email: input.email, passwordHash });
    return { user: toPublicUser(row), token: this.signToken(row.id) };
  }

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    const row = await this.usersRepo.findByEmail(input.email);
    if (!row) throw new UnauthorizedError('Invalid email or password');

    const matches = await bcrypt.compare(input.password, row.password_hash);
    if (!matches) throw new UnauthorizedError('Invalid email or password');

    return { user: toPublicUser(row), token: this.signToken(row.id) };
  }

  verifyToken(token: string): { sub: number } {
    const payload = jwt.verify(token, this.jwtSecret);
    if (typeof payload === 'string' || !payload.sub) {
      throw new UnauthorizedError('Invalid token payload');
    }
    return { sub: Number(payload.sub) };
  }

  private signToken(userId: number): string {
    const options: SignOptions = { expiresIn: this.jwtExpiresIn as SignOptions['expiresIn'] };
    return jwt.sign({ sub: String(userId) }, this.jwtSecret, options);
  }
}
