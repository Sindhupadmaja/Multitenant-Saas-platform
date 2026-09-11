export type TenantRole = 'owner' | 'admin' | 'member';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
      /** Set by tenantMiddleware after verifying the user is actually a
       * member of the organization named in the X-Organization-Id header --
       * never trust this header directly, only this field. */
      organizationId?: number;
      tenantRole?: TenantRole;
      requestId?: string;
    }
  }
}

export {};
