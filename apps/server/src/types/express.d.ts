import type { EnabledFeatures } from '@pulse/api-client';

declare global {
  namespace Express {
    interface Request {
      userId: number;
      /** Set by the `loadFeatures` middleware — only present on routes that opt in. */
      features?: EnabledFeatures;
    }
  }
}

export {};
