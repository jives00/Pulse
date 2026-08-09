import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import { preferencesApi, DEFAULT_FEATURES, resolveFeatures } from '../../../../packages/api-client/src/index';
import type { EnabledFeatures, StoredDashboardLayout, FeatureKey } from '../../../../packages/api-client/src/index';

// Kept out of `pulse-settings` — SecureStore values cap around 2KB and that store
// already carries theme + sort prefs. This store gets its own key.
const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

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
      // apply. Never throws — offline just keeps whatever was already persisted/rendering.
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
      name: 'pulse-features',
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({ features: s.features, dashboardLayout: s.dashboardLayout }),
    },
  ),
);
