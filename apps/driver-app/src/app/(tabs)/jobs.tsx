import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentJob } from '../../api/use-jobs';
import { JobCard } from '../../components/job-card';
import { Icon } from '../../components/ui/icon';
import { jobEntry } from '../../lib/job-entry';
import { jobSubtitle } from '../../lib/job-navigation';
import { JOB_STATUS_LABELS } from '../../lib/job-status';
import { useThemeColors, type ThemeColors } from '../../theme/colors';
import { cardStyle } from '../../theme/tokens';

/**
 * Jobs (design mock, 2026-10-04): the job a driver is on, as a card they can open. A driver has one
 * active job at a time, so for now this is that one job or a clear "no job" message; a list of
 * upcoming jobs belongs here when dispatch can queue more than one. The edges are covered by the
 * tab bar and the safe area, so nothing here sits under Android's navigation bar.
 */
export default function JobsScreen() {
  const router = useRouter();
  const currentJob = useCurrentJob();
  const entry = jobEntry(currentJob);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Jobs</Text>

        {entry.kind === 'job' && currentJob.data && (
          <View style={styles.block}>
            <JobCard
              title={`Job ${currentJob.data.reference}`}
              subtitle={jobSubtitle(currentJob.data)}
              onPress={() => router.push('/job')}
              testID="jobs-current-job"
            />
            <Text style={styles.status} testID="jobs-current-status">
              {JOB_STATUS_LABELS[currentJob.data.status]}
            </Text>
          </View>
        )}

        {entry.kind === 'checking' && <ActivityIndicator size="large" color={colors.text} />}

        {(entry.kind === 'none' || entry.kind === 'error') && (
          <View style={styles.empty}>
            <Icon name="clipboard-text-outline" size={56} color={colors.textMuted} />
            <Text style={styles.emptyTitle} testID="jobs-empty-title">
              {entry.kind === 'error' ? "Couldn't check for a job" : 'No job assigned right now'}
            </Text>
            <Text style={styles.emptyBody}>
              {entry.kind === 'error'
                ? 'Check your signal and try again.'
                : 'When dispatch gives you a job it will show here, and on the map.'}
            </Text>
            <TouchableOpacity
              style={styles.refresh}
              disabled={currentJob.isFetching}
              onPress={() => void currentJob.refetch()}
              accessibilityRole="button"
              testID="jobs-refresh-button"
            >
              <Text style={styles.refreshText}>
                {currentJob.isFetching ? 'Checking…' : 'Check again'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 16, flexGrow: 1 },
    title: { fontSize: 32, fontWeight: '800', color: colors.text },
    block: { gap: 10 },
    status: { fontSize: 16, color: colors.textMuted, marginLeft: 4 },
    empty: {
      ...cardStyle(colors),
      padding: 28,
      alignItems: 'center',
      gap: 10,
    },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
    emptyBody: { fontSize: 16, color: colors.textMuted, textAlign: 'center' },
    refresh: {
      marginTop: 6,
      minHeight: 52,
      paddingHorizontal: 28,
      borderRadius: 16,
      backgroundColor: colors.accent,
      justifyContent: 'center',
    },
    refreshText: { fontSize: 18, fontWeight: '700', color: colors.textOnAccent },
  });
}
