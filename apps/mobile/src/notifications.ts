import { Platform } from 'react-native';
import Constants from 'expo-constants';

type ExpoNotifications = typeof import('expo-notifications');

const isExpoGoAndroid =
  Platform.OS === 'android' &&
  (Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo');

let notificationsPromise: Promise<ExpoNotifications | null> | null = null;

export function areNotificationsAvailable() {
  return !isExpoGoAndroid;
}

export function getNotifications(): Promise<ExpoNotifications | null> {
  if (!areNotificationsAvailable()) return Promise.resolve(null);

  notificationsPromise ??= import('expo-notifications').catch((error) => {
    console.warn('Notifications are unavailable in this runtime.', error);
    return null;
  });

  return notificationsPromise;
}
