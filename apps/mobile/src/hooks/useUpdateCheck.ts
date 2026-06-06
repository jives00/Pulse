import { useEffect, useState, useCallback } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { API_BASE } from '../api/config';

const BUILD_TAG = process.env.EXPO_PUBLIC_BUILD_TAG ?? '';

export function useUpdateCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [apkUrl, setApkUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Skip in dev builds where tag isn't baked in
    if (!BUILD_TAG) return;

    fetch(`${API_BASE}/api/app/version`)
      .then((r) => r.json())
      .then(({ tag, apkUrl: url }: { tag: string; apkUrl: string }) => {
        if (tag && tag !== BUILD_TAG) {
          setUpdateAvailable(true);
          setApkUrl(url);
        }
      })
      .catch(() => {});
  }, []);

  const startUpdate = useCallback(async () => {
    if (!apkUrl || downloading) return;
    setDownloading(true);
    setProgress(0);
    const localPath = FileSystem.documentDirectory + 'pulse-update.apk';
    try {
      const dl = FileSystem.createDownloadResumable(
        apkUrl,
        localPath,
        {},
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            setProgress(totalBytesWritten / totalBytesExpectedToWrite);
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
      setDownloading(false);
    }
  }, [apkUrl, downloading]);

  return { updateAvailable, downloading, progress, startUpdate };
}
