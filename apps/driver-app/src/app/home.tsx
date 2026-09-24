import { useRouter } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { PRODUCT_NAME } from '../product';
import { useAuthStore } from '../state/auth-store';

// A placeholder only — route overview, active trip and the rest land in M5.5+. This exists to
// prove the sign-in flow actually reaches a signed-in area, not to be a real home screen itself.
export default function HomeScreen() {
  const router = useRouter();
  const state = useAuthStore((s) => s.state);
  const signOut = useAuthStore((s) => s.signOut);

  if (state.status !== 'signedIn') {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{PRODUCT_NAME}</Text>
        <Text style={styles.subtitle}>Signed in as {state.driver.identifier}</Text>
        <Text style={styles.note}>Real-device verification (M5.10) is next.</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/profiles')}
          testID="vehicle-profiles-button"
        >
          <Text style={styles.buttonText}>Vehicle profiles</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/plan-route')}
          testID="plan-route-button"
        >
          <Text style={styles.buttonText}>Plan route</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/report-hazard')}
          testID="report-hazard-button"
        >
          <Text style={styles.buttonText}>Report hazard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/voice-drafts')}
          testID="voice-drafts-button"
        >
          <Text style={styles.buttonText}>Saved reports</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/feedback')}
          testID="feedback-button"
        >
          <Text style={styles.buttonText}>Feedback</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            void signOut().then(() => router.replace('/sign-in'));
          }}
          testID="sign-out-button"
        >
          <Text style={styles.buttonText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 18,
    color: '#E5E7EB',
  },
  note: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    minHeight: 56,
    minWidth: 200,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
