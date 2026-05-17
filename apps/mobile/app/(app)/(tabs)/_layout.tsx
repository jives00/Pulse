import { useState, useRef } from 'react';
import { Tabs, useRouter } from 'expo-router';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
  type LayoutRectangle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../../src/hooks/useColors';

const MENU_WIDTH = 150;
const MENU_MARGIN = 8;

function MoreButton({ color, style }: { color: string; style?: any }) {
  const c = useColors();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const btnRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<LayoutRectangle | null>(null);

  function open() {
    btnRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setVisible(true);
    });
  }

  function go(path: '/(app)/(tabs)/links' | '/(app)/(tabs)/history' | '/(app)/(tabs)/settings') {
    setVisible(false);
    router.push(path);
  }

  // Compute horizontal position: right-align the menu to the button's right edge,
  // then clamp so it never goes off the right of the screen.
  function menuLeft(): number {
    if (!anchor) return MENU_MARGIN;
    const btnRight = anchor.x + anchor.width;
    const idealLeft = btnRight - MENU_WIDTH;
    const maxLeft = screenWidth - MENU_WIDTH - MENU_MARGIN;
    return Math.max(MENU_MARGIN, Math.min(idealLeft, maxLeft));
  }

  return (
    <>
      {/* Use the tab bar's own style prop so flex sizing matches sibling tabs */}
      <TouchableOpacity
        ref={btnRef as any}
        onPress={open}
        style={[style, styles.btn]}
        activeOpacity={0.7}
      >
        <Ionicons name="ellipsis-horizontal" size={22} color={color} />
        <Text style={{ color, fontSize: 12, marginTop: 2 }}>More</Text>
      </TouchableOpacity>

      <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setVisible(false)}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>

        {anchor && (
          <View
            style={[
              styles.menu,
              {
                backgroundColor: c.card,
                borderColor: c.border,
                bottom: anchor.height + MENU_MARGIN,
                left: menuLeft(),
                width: MENU_WIDTH,
              },
            ]}
          >
            <TouchableOpacity style={styles.menuItem} onPress={() => go('/(app)/(tabs)/links')}>
              <Ionicons name="link-outline" size={20} color={c.muted} />
              <Text style={[styles.menuLabel, { color: c.text }]}>Links</Text>
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <TouchableOpacity style={styles.menuItem} onPress={() => go('/(app)/(tabs)/history')}>
              <Ionicons name="time-outline" size={20} color={c.muted} />
              <Text style={[styles.menuLabel, { color: c.text }]}>History</Text>
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <TouchableOpacity style={styles.menuItem} onPress={() => go('/(app)/(tabs)/settings')}>
              <Ionicons name="settings-outline" size={20} color={c.muted} />
              <Text style={[styles.menuLabel, { color: c.text }]}>Settings</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 10,
  },
  menu: {
    position: 'absolute',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 12,
  },
});

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.border, paddingHorizontal: 4, height: 72, paddingBottom: 10 },
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontSize: 12 },
        tabBarIconStyle: { marginBottom: -2 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="planning"
        options={{ title: 'Plan', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{ title: 'Log', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'restaurant' : 'restaurant-outline'} size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="workouts"
        options={{ title: 'Train', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'barbell' : 'barbell-outline'} size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="index"
        options={{ title: 'Recipes', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'book' : 'book-outline'} size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarButton: (props) => (
            <MoreButton
              color={props.accessibilityState?.selected ? c.accent : c.muted}
              style={props.style}
            />
          ),
        }}
      />
      <Tabs.Screen name="links" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="goals" options={{ href: null }} />
    </Tabs>
  );
}
