import { apiClient } from '../client';
import { EnabledFeatures } from '../featureCatalog';
import { StoredDashboardLayout } from '../dashboardCatalog';

export interface UserPreferences {
  enabledFeatures: EnabledFeatures;
  dashboardLayout: StoredDashboardLayout;
}

export const preferencesApi = {
  get: () =>
    apiClient.get<UserPreferences>('/preferences').then((r) => r.data),

  update: (payload: {
    enabledFeatures?: Partial<EnabledFeatures>;
    dashboardLayout?: StoredDashboardLayout;
  }) =>
    apiClient.put<UserPreferences>('/preferences', payload).then((r) => r.data),
};
