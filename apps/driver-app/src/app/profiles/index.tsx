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
import { formatHeightWithFeetInches } from '../../lib/units';
import { useThemeColors, type ThemeColors } from '../../theme/colors';

export default function VehicleProfilesScreen() {
  const router = useRouter();
  const { data, isLoading, isError, isRefetching, refetch } = useVehicleProfiles();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Vehicle profiles</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/profiles/new')}
          testID="add-profile-button"
        >
          <Text style={styles.addButtonText}>Add vehicle</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} size="large" color={colors.text} />
      ) : isError ? (
        <Text style={styles.message}>Could not load your vehicles. Pull down to try again.</Text>
      ) : data === undefined || data.length === 0 ? (
        <Text style={styles.message}>No vehicles yet — add one to start planning routes.</Text>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push({ pathname: '/profiles/[id]', params: { id: item.id } })}
              testID={`profile-row-${item.id}`}
            >
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowDetail}>
                {formatHeightWithFeetInches(item.dimensions.heightM)} ·{' '}
                {item.dimensions.grossWeightT}t
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
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
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 24,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
    },
    addButton: {
      minHeight: 56,
      minWidth: 56,
      paddingHorizontal: 16,
      backgroundColor: colors.accent,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    addButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textOnAccent,
    },
    loading: {
      marginTop: 48,
    },
    message: {
      fontSize: 16,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 48,
      paddingHorizontal: 24,
    },
    row: {
      minHeight: 72,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    rowName: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    rowDetail: {
      fontSize: 15,
      color: colors.textMuted,
      marginTop: 4,
    },
  });
}
