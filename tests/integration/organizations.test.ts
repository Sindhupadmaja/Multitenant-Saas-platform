import request from 'supertest';
import { Express } from 'express';
import { buildTestApp, closeTestInfra } from './testApp';
import { registerUser, createOrganization, authHeaders } from './helpers';

describe('Organizations & RBAC (integration)', () => {
  let app: Express;

  beforeEach(async () => {
    const built = await buildTestApp();
    app = built.app;
  });

  afterAll(async () => {
    await closeTestInfra();
  });

  it('creating an organization makes the creator its owner', async () => {
    const user = await registerUser(app);
    const { organizationId } = await createOrganization(app, user.token);

    const membersRes = await request(app).get('/api/v1/organizations/members').set(authHeaders(user.token, organizationId));
    expect(membersRes.body.members).toHaveLength(1);
    expect(membersRes.body.members[0].role).toBe('owner');
  });

  it('rejects a duplicate slug', async () => {
    const user = await registerUser(app);
    await createOrganization(app, user.token, { slug: 'taken-slug' });

    const res = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Another Org', slug: 'taken-slug' });
    expect(res.status).toBe(409);
  });

  it('rejects an invalid slug format', async () => {
    const user = await registerUser(app);
    const res = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Bad Slug Org', slug: 'Not Valid Slug!' });
    expect(res.status).toBe(400);
  });

  it('an owner can add a member with any role', async () => {
    const owner = await registerUser(app);
    const newMember = await registerUser(app);
    const { organizationId } = await createOrganization(app, owner.token);

    const res = await request(app)
      .post('/api/v1/organizations/members')
      .set(authHeaders(owner.token, organizationId))
      .send({ email: newMember.email, role: 'admin' });

    expect(res.status).toBe(201);
    expect(res.body.membership.role).toBe('admin');
  });

  it('a plain member cannot add other members', async () => {
    const owner = await registerUser(app);
    const member = await registerUser(app);
    const outsider = await registerUser(app);
    const { organizationId } = await createOrganization(app, owner.token);

    await request(app)
      .post('/api/v1/organizations/members')
      .set(authHeaders(owner.token, organizationId))
      .send({ email: member.email, role: 'member' });

    const res = await request(app)
      .post('/api/v1/organizations/members')
      .set(authHeaders(member.token, organizationId))
      .send({ email: outsider.email, role: 'member' });

    expect(res.status).toBe(403);
  });

  it('an admin CAN add other members', async () => {
    const owner = await registerUser(app);
    const admin = await registerUser(app);
    const newPerson = await registerUser(app);
    const { organizationId } = await createOrganization(app, owner.token);

    await request(app)
      .post('/api/v1/organizations/members')
      .set(authHeaders(owner.token, organizationId))
      .send({ email: admin.email, role: 'admin' });

    const res = await request(app)
      .post('/api/v1/organizations/members')
      .set(authHeaders(admin.token, organizationId))
      .send({ email: newPerson.email, role: 'member' });

    expect(res.status).toBe(201);
  });

  it('cannot add the same person twice', async () => {
    const owner = await registerUser(app);
    const member = await registerUser(app);
    const { organizationId } = await createOrganization(app, owner.token);

    await request(app)
      .post('/api/v1/organizations/members')
      .set(authHeaders(owner.token, organizationId))
      .send({ email: member.email, role: 'member' });

    const res = await request(app)
      .post('/api/v1/organizations/members')
      .set(authHeaders(owner.token, organizationId))
      .send({ email: member.email, role: 'member' });

    expect(res.status).toBe(409);
  });

  it('lists only the organizations the user actually belongs to', async () => {
    const userA = await registerUser(app);
    const userB = await registerUser(app);
    await createOrganization(app, userA.token);
    await createOrganization(app, userB.token);

    const res = await request(app).get('/api/v1/organizations/mine').set('Authorization', `Bearer ${userA.token}`);
    expect(res.body.organizations).toHaveLength(1);
  });
});
