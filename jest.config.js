/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/jobs/worker.ts', '!src/db/knexfile.ts', '!src/db/migrations/**'],
  setupFiles: ['<rootDir>/tests/setEnv.ts'],
  testTimeout: 30000,
};
