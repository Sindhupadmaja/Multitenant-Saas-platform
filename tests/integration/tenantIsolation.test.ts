import request from 'supertest';
import { Express } from 'express';
import { buildTestApp, closeTestInfra } from './testApp';
import { registerUser, createOrganization, authHeaders } from './helpers';

describe('Tenant isolation (integration)', () => {
  let app: Express;

  beforeEach(async () => {
    const built = await buildTestApp();
    app = built.app;
  });

  afterAll(async () => {
    await closeTestInfra();
  });

  it('a project created in org A is never returned when listing org B\'s projects', async () => {
    const userA = await registerUser(app);
    const userB = await registerUser(app);
    const orgA = await createOrganization(app, userA.token);
    const orgB = await createOrganization(app, userB.token);

    await request(app)
      .post('/api/v1/projects')
      .set(authHeaders(userA.token, orgA.organizationId))
      .send({ name: 'Org A Secret Project' });

    const listRes = await request(app).get('/api/v1/projects').set(authHeaders(userB.token, orgB.organizationId));

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(0);
  });

  it('userB cannot fetch org A\'s project by ID even when authenticated with org B context', async () => {
    const userA = await registerUser(app);
    const userB = await registerUser(app);
    const orgA = await createOrganization(app, userA.token);
    const orgB = await createOrganization(app, userB.token);

    const createRes = await request(app)
      .post('/api/v1/projects')
      .set(authHeaders(userA.token, orgA.organizationId))
      .send({ name: 'Org A Secret Project' });
    const projectId = createRes.body.project.id;

    const getRes = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set(authHeaders(userB.token, orgB.organizationId));

    // Not just "denied" -- indistinguishable from "does not exist", exactly
    // as ProjectsService.getById is written to do. A 403 here would confirm
    // to userB that SOME project with that id exists somewhere, which is
    // itself a (small) information leak across the tenant boundary.
    expect(getRes.status).toBe(404);
  });

  it('a user with no membership in an organization at all is rejected with 403, not 404 or 500', async () => {
    const userA = await registerUser(app);
    const outsider = await registerUser(app);
    const orgA = await createOrganization(app, userA.token);

    const res = await request(app).get('/api/v1/projects').set(authHeaders(outsider.token, orgA.organizationId));

    expect(res.status).toBe(403);
  });

  it('a user cannot fabricate access by sending an organization id they are not a member of, even if it is a real org', async () => {
    const userA = await registerUser(app);
    const userB = await registerUser(app);
    const orgA = await createOrganization(app, userA.token);
    await createOrganization(app, userB.token); // userB has their own org, but not orgA

    const res = await request(app)
      .post('/api/v1/projects')
      .set(authHeaders(userB.token, orgA.organizationId)) // userB's token + org A's id
      .send({ name: 'Should never be created' });

    expect(res.status).toBe(403);

    // and confirm at the database level nothing was created
    const listRes = await request(app).get('/api/v1/projects').set(authHeaders(userA.token, orgA.organizationId));
    expect(listRes.body.items).toHaveLength(0);
  });

  it('requests with no X-Organization-Id header are rejected on tenant-scoped routes', async () => {
    const user = await registerUser(app);
    const res = await request(app).get('/api/v1/projects').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(403);
  });

  it('the same user can hold different roles in different organizations simultaneously', async () => {
    const owner = await registerUser(app);
    const member = await registerUser(app);
    const orgA = await createOrganization(app, owner.token);
    const orgB = await createOrganization(app, member.token);

    // add `owner` as a plain member of orgB
    await request(app)
      .post('/api/v1/organizations/members')
      .set(authHeaders(member.token, orgB.organizationId))
      .send({ email: owner.email, role: 'member' });

    // `owner` is owner in orgA...
    const orgAMembers = await request(app).get('/api/v1/organizations/members').set(authHeaders(owner.token, orgA.organizationId));
    expect(orgAMembers.body.members.find((m: { user_email: string }) => m.user_email === owner.email).role).toBe('owner');

    // ...but only a member in orgB, and cannot do owner-only things there
    const addMemberInOrgB = await request(app)
      .post('/api/v1/organizations/members')
      .set(authHeaders(owner.token, orgB.organizationId))
      .send({ email: 'someone-else@example.com', role: 'member' });
    expect(addMemberInOrgB.status).toBe(403);
  });
});
