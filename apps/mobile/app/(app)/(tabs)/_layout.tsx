import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../../../src/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Recipes', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🍽️</Text> }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{ title: 'Food Log', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🥗</Text> }}
      />
      <Tabs.Screen
        name="workouts"
        options={{ title: 'Workouts', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💪</Text> }}
      />
      <Tabs.Screen
        name="links"
        options={{ title: 'Links', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🔗</Text> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙️</Text> }}
      />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="goals" options={{ href: null }} />
    </Tabs>
  );
}
