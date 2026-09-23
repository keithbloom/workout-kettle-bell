import type { MiddlewareHandler } from 'hono';
import { createAuth } from '../auth';
import type { Env } from '../env';

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  /** Profile picture from the identity provider, when it gave us one. */
  image: string | null;
}

export interface AuthedVars {
  user: AuthedUser;
}

/**
 * Rejects anything without a valid session, and hands the handler the user.
 *
 * Every data route sits behind this, so a handler never has to remember to
 * check: the only way to reach one is with a user already in hand.
 */
export const requireUser: MiddlewareHandler<{ Bindings: Env; Variables: AuthedVars }> = async (
  c,
  next,
) => {
  const session = await createAuth(c.env, c.req.url).api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user) return c.json({ error: 'unauthorized' }, 401);

  c.set('user', {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image ?? null,
  });

  await next();
};
