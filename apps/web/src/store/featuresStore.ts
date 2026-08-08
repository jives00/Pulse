import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { preferencesApi, DEFAULT_FEATURES, resolveFeatures } from '@pulse/api-client';
import type { EnabledFeatures, StoredDashboardLayout, FeatureKey } from '@pulse/api-client';

interface FeaturesState {
  features: EnabledFeatures;
  dashboardLayout: StoredDashboardLayout;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setFeature: (key: FeatureKey, value: boolean) => Promise<void>;
  setFeatures: (partial: Partial<EnabledFeatures>) => Promise<void>;
  setLayout: (layout: StoredDashboardLayout) => Promise<void>;
}

export const useFeaturesStore = create<FeaturesState>()(
  persist(
    (set, get) => ({
      features: DEFAULT_FEATURES,
      dashboardLayout: {},
      hydrated: false,

      // Pulls the server copy over the persisted/default one so a returning user's toggles
      // apply. Never throws — a 404/offline server just keeps what's already rendering.
      hydrate: async () => {
        try {
          const prefs = await preferencesApi.get();
          set({
            features: resolveFeatures(prefs.enabledFeatures),
            dashboardLayout: prefs.dashboardLayout ?? {},
            hydrated: true,
          });
        } catch (err) {
          console.warn('featuresStore: failed to load preferences, using defaults', err);
          set({ hydrated: true });
        }
      },

      setFeature: async (key, value) => {
        const prev = get().features;
        const next = resolveFeatures({ ...prev, [key]: value });
        set({ features: next });
        try {
          await preferencesApi.update({ enabledFeatures: next });
        } catch (err) {
          console.warn('featuresStore: failed to save feature toggle, reverting', err);
          set({ features: prev });
        }
      },

      setFeatures: async (partial) => {
        const prev = get().features;
        const next = resolveFeatures({ ...prev, ...partial });
        set({ features: next });
        try {
          await preferencesApi.update({ enabledFeatures: next });
        } catch (err) {
          console.warn('featuresStore: failed to save feature toggles, reverting', err);
          set({ features: prev });
        }
      },

      setLayout: async (layout) => {
        const prev = get().dashboardLayout;
        set({ dashboardLayout: layout });
        try {
          await preferencesApi.update({ dashboardLayout: layout });
        } catch (err) {
          console.warn('featuresStore: failed to save dashboard layout, reverting', err);
          set({ dashboardLayout: prev });
        }
      },
    }),
    // Only the resolved preferences are persisted — `hydrated` must start false on every
    // load so a fresh session still pulls the server copy.
    {
      name: 'dram-features',
      partialize: (s) => ({ features: s.features, dashboardLayout: s.dashboardLayout }),
    },
  ),
);
