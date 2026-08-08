import { Navigate } from 'react-router-dom';
import { featuresSatisfied } from '@pulse/api-client';
import type { EnabledFeatures, FeatureKey, FeatureRequirement } from '@pulse/api-client';
import { useFeaturesStore } from '../store/featuresStore';

export function useFeatures(): EnabledFeatures {
  return useFeaturesStore((s) => s.features);
}

export function useFeature(key: FeatureKey): boolean {
  return useFeaturesStore((s) => s.features[key]);
}

interface FeatureGateProps {
  feature?: FeatureKey;
  requires?: FeatureRequirement;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/** Renders children only while the given module (or requirement set) is enabled. */
export function FeatureGate({ feature, requires, fallback = null, children }: FeatureGateProps) {
  const features = useFeatures();
  const req = requires ?? (feature ? { all: [feature] } : undefined);
  return featuresSatisfied(features, req) ? <>{children}</> : <>{fallback}</>;
}

interface FeatureRouteProps {
  feature: FeatureKey;
  children: React.ReactNode;
}

/**
 * Route-level gate — bounces to /dashboard when the module is off. Reads the persisted
 * store value directly (not a network-hydrated one) so a valid deep link never bounces
 * before the store has had a chance to hydrate from the server.
 */
export function FeatureRoute({ feature, children }: FeatureRouteProps) {
  const enabled = useFeature(feature);
  if (!enabled) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
