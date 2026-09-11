import request from 'supertest';
import { Express } from 'express';

let counter = 0;

export async function registerUser(
  app: Express,
  overrides: Partial<{ name: string; email: string; password: string }> = {}
): Promise<{ userId: number; token: string; email: string }> {
  counter += 1;
  const payload = {
    name: overrides.name || `Test User ${counter}`,
    email: overrides.email || `user${counter}${Date.now()}${Math.random()}@example.com`,
    password: overrides.password || 'password123',
  };
  const res = await request(app).post('/api/v1/auth/register').send(payload);
  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { userId: res.body.user.id, token: res.body.token, email: payload.email };
}

export async function createOrganization(
  app: Express,
  token: string,
  overrides: Partial<{ name: string; slug: string }> = {}
): Promise<{ organizationId: number; slug: string }> {
  counter += 1;
  const payload = {
    name: overrides.name || `Test Org ${counter}`,
    slug: overrides.slug || `test-org-${counter}-${Date.now()}`,
  };
  const res = await request(app).post('/api/v1/organizations').set('Authorization', `Bearer ${token}`).send(payload);
  if (res.status !== 201) {
    throw new Error(`createOrganization failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { organizationId: res.body.organization.id, slug: payload.slug };
}

/** Bundles the two headers every tenant-scoped request needs, so test code
 * reads as `.set(authHeaders(token, orgId))` rather than repeating both
 * `.set()` calls everywhere. */
export function authHeaders(token: string, organizationId: number): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'X-Organization-Id': String(organizationId) };
}
