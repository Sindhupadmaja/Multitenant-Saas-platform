import type { Knex } from 'knex';
import path from 'path';

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'saas_platform',
    },
    migrations: { directory: path.join(__dirname, 'migrations') },
    pool: { min: 2, max: 10 },
  },

  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: { directory: path.join(__dirname, 'migrations') },
    pool: { min: 2, max: 10 },
  },

  test: {
    client: 'pg',
    connection: process.env.TEST_DATABASE_URL || {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.TEST_DB_NAME || 'saas_platform_test',
    },
    migrations: { directory: path.join(__dirname, 'migrations') },
    pool: { min: 2, max: 20 },
  },
};

export default config;
