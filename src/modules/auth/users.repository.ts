import { Knex } from 'knex';

export interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

export function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, name: row.name, email: row.email, createdAt: row.created_at };
}

export class UsersRepository {
  constructor(private readonly db: Knex) {}

  async findByEmail(email: string): Promise<UserRow | undefined> {
    return this.db<UserRow>('users').where({ email: email.toLowerCase() }).first();
  }

  async findById(id: number): Promise<UserRow | undefined> {
    return this.db<UserRow>('users').where({ id }).first();
  }

  async create(data: { name: string; email: string; passwordHash: string }): Promise<UserRow> {
    const [row] = await this.db<UserRow>('users')
      .insert({ name: data.name, email: data.email.toLowerCase(), password_hash: data.passwordHash })
      .returning('*');
    return row;
  }
}
