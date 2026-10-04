import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { Icon, type IconName } from '../../components/ui/icon';
import { useThemeColors } from '../../theme/colors';

function tabIcon(name: IconName) {
  // eslint-disable-next-line react/display-name -- a tiny render callback for the tab bar, not a component
  return ({ color }: { color: ColorValue }) => <Icon name={name} size={26} color={color} />;
}

/**
 * The four places a driver goes: the map (home), their jobs, saved things, and everything else. The
 * bar is a floating-card white (or dark slate) so it matches the cards on the map. React Navigation's
 * bottom tabs add the bottom safe-area inset themselves, so the bar sits above an Android three-button
 * or gesture bar instead of under it. Screens like planning a route or the job detail open above this,
 * full screen, and come back to it.
 */
export default function TabsLayout() {
  const colors = useThemeColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.divider,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Map', tabBarIcon: tabIcon('map-outline') }} />
      <Tabs.Screen
        name="jobs"
        options={{ title: 'Jobs', tabBarIcon: tabIcon('clipboard-list-outline') }}
      />
      <Tabs.Screen
        name="saved"
        options={{ title: 'Saved', tabBarIcon: tabIcon('bookmark-outline') }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: 'More', tabBarIcon: tabIcon('dots-horizontal') }}
      />
    </Tabs>
  );
}
