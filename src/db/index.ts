import knexLib, { Knex } from 'knex';
import config from './knexfile';

export function createDb(env: string = process.env.NODE_ENV || 'development'): Knex {
  const envConfig = config[env];
  if (!envConfig) {
    throw new Error(`No Knex configuration found for NODE_ENV=${env}`);
  }
  return knexLib(envConfig);
}
