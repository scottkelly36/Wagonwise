import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useVehicleProfiles } from '../../api/use-vehicle-profiles';
import { Icon } from '../../components/ui/icon';
import { ScreenHeader } from '../../components/ui/screen-header';
import { formatHeightWithFeetInches } from '../../lib/units';
import { useThemeColors, type ThemeColors } from '../../theme/colors';
import { cardStyle, radius } from '../../theme/tokens';

export default function VehicleProfilesScreen() {
  const router = useRouter();
  const { data, isLoading, isError, isRefetching, refetch } = useVehicleProfiles();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <ScreenHeader title="Vehicle profiles" fallbackHref="/more" />
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} size="large" color={colors.text} />
      ) : isError ? (
        <View style={styles.empty}>
          <Icon name="cloud-alert-outline" size={52} color={colors.textMuted} />
          <Text style={styles.message}>Could not load your vehicles. Pull down to try again.</Text>
        </View>
      ) : data === undefined || data.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="truck-outline" size={52} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No vehicles yet</Text>
          <Text style={styles.message}>Add one to start planning routes.</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push({ pathname: '/profiles/[id]', params: { id: item.id } })}
              accessibilityRole="button"
              testID={`profile-row-${item.id}`}
            >
              <View style={styles.badge}>
                <Icon name="truck" size={28} color={colors.accent} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowDetail}>
                  {formatHeightWithFeetInches(item.dimensions.heightM)} ·{' '}
                  {item.dimensions.grossWeightT}t
                </Text>
              </View>
              <Icon name="chevron-right" size={26} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => router.push('/profiles/new')}
        accessibilityRole="button"
        testID="add-profile-button"
      >
        <Icon name="plus" size={26} color={colors.textOnAccent} />
        <Text style={styles.addButtonText}>Add vehicle</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      padding: 16,
    },
    list: {
      padding: 16,
      paddingTop: 4,
      gap: 12,
    },
    loading: {
      marginTop: 48,
    },
    empty: {
      ...cardStyle(colors),
      margin: 16,
      padding: 28,
      alignItems: 'center',
      gap: 10,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    message: {
      fontSize: 16,
      color: colors.textMuted,
      textAlign: 'center',
    },
    row: {
      ...cardStyle(colors),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 14,
      minHeight: 76,
    },
    badge: {
      width: 52,
      height: 52,
      borderRadius: radius.badge,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rowText: {
      flex: 1,
    },
    rowName: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    rowDetail: {
      fontSize: 15,
      color: colors.textMuted,
      marginTop: 2,
    },
    addButton: {
      minHeight: 56,
      margin: 16,
      marginTop: 4,
      borderRadius: 16,
      backgroundColor: colors.accent,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
    },
    addButtonText: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textOnAccent,
    },
  });
}
