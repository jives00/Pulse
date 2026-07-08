import { create } from 'zustand';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { resolveApiBase } from '../api/apiBase';

export const BUILD_TAG = process.env.EXPO_PUBLIC_BUILD_TAG ?? '';

interface UpdateStore {
  updateAvailable: boolean;
  apkUrl: string;
  latestTag: string;
  downloading: boolean;
  progress: number;
  dismissed: boolean;
  checking: boolean;
  checkForUpdate: () => Promise<void>;
  startUpdate: () => Promise<void>;
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  updateAvailable: false,
  apkUrl: '',
  latestTag: '',
  downloading: false,
  progress: 0,
  dismissed: false,
  checking: false,

  checkForUpdate: async () => {
    if (!BUILD_TAG) return;
    set({ checking: true });
    try {
      const base = await resolveApiBase();
      if (!base) return; // off-network — skip the update check
      const r = await fetch(`${base}/app/version`);
      const { tag, apkUrl } = await r.json() as { tag: string; apkUrl: string };
      if (tag && tag !== BUILD_TAG) {
        set({ updateAvailable: true, apkUrl, latestTag: tag, dismissed: false });
      } else {
        set({ updateAvailable: false, latestTag: tag });
      }
    } catch {
      // best-effort
    } finally {
      set({ checking: false });
    }
  },

  startUpdate: async () => {
    const { apkUrl, downloading } = get();
    if (!apkUrl || downloading) return;
    set({ downloading: true, progress: 0 });
    const localPath = FileSystem.documentDirectory + 'pulse-update.apk';
    try {
      const dl = FileSystem.createDownloadResumable(
        apkUrl,
        localPath,
        {},
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            set({ progress: totalBytesWritten / totalBytesExpectedToWrite });
          }
        }
      );
      const result = await dl.downloadAsync();
      if (!result?.uri) throw new Error('Download failed');
      const contentUri = await FileSystem.getContentUriAsync(result.uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: 'application/vnd.android.package-archive',
      });
    } finally {
      set({ downloading: false });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));
