import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { isTrustedClient } from '../utils/trustedNetwork';

// True when the request comes from a trusted network (home LAN / Tailscale / docker-internal)
// and carries no Cloudflare tunnel headers. Uses the raw socket peer address rather than
// req.ip so a spoofed X-Forwarded-For cannot fake trust.
export function isTrustedRequest(req: Request): boolean {
  return isTrustedClient(
    req.headers as Record<string, unknown>,
    req.socket.remoteAddress,
    env.TRUSTED_CIDRS,
  );
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: number; username: string };
    if (!payload.sub) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    req.userId = payload.sub;
    next();
  } catch {
    console.log(`[auth] JWT invalid: ${req.method} ${req.path}`);
    res.status(401).json({ error: 'Invalid token' });
  }
}
