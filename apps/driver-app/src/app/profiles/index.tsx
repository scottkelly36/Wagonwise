import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useVehicleProfiles } from '../../api/use-vehicle-profiles';
import { formatHeightWithFeetInches } from '../../lib/units';

export default function VehicleProfilesScreen() {
  const router = useRouter();
  const { data, isLoading, isError, isRefetching, refetch } = useVehicleProfiles();

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
        <ActivityIndicator style={styles.loading} size="large" color="#FFFFFF" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
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
    color: '#FFFFFF',
  },
  addButton: {
    minHeight: 56,
    minWidth: 56,
    paddingHorizontal: 16,
    backgroundColor: '#F5A623',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0B1220',
  },
  loading: {
    marginTop: 48,
  },
  message: {
    fontSize: 16,
    color: '#9CA3AF',
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
    borderBottomColor: '#1F2937',
  },
  rowName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  rowDetail: {
    fontSize: 15,
    color: '#9CA3AF',
    marginTop: 4,
  },
});
