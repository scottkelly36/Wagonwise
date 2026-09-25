import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useDeleteAccount } from '../api/use-identity';
import { identityErrorMessage } from '../lib/error-messages';
import { PRODUCT_NAME } from '../product';
import { useAuthStore } from '../state/auth-store';

/** Everything that doesn't need to be on the map constantly (design decision, 2026-09-24) —
 *  reached from the small "Menu" icon on the map home screen, not the app's landing screen. */
export default function SettingsScreen() {
  const router = useRouter();
  const state = useAuthStore((s) => s.state);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useDeleteAccount();

  if (state.status !== 'signedIn') {
    return null;
  }

  function handleDeleteAccount(): void {
    Alert.alert(
      'Delete your account?',
      'This removes your account and everything tied to it. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteAccount.mutate(undefined, {
              onSuccess: () => {
                void signOut().then(() => router.replace('/sign-in'));
              },
            });
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{PRODUCT_NAME}</Text>
        <Text style={styles.subtitle}>Signed in as {state.driver.identifier}</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/profiles')}
          testID="vehicle-profiles-button"
        >
          <Text style={styles.buttonText}>Vehicle profiles</Text>
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

        {deleteAccount.isError && (
          <Text style={styles.error}>{identityErrorMessage(deleteAccount.error)}</Text>
        )}

        <TouchableOpacity
          style={[styles.deleteButton, deleteAccount.isPending && styles.buttonDisabled]}
          disabled={deleteAccount.isPending}
          onPress={handleDeleteAccount}
          testID="delete-account-button"
        >
          {deleteAccount.isPending ? (
            <ActivityIndicator color="#F87171" />
          ) : (
            <Text style={styles.deleteButtonText}>Delete account</Text>
          )}
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
  deleteButton: {
    minHeight: 56,
    minWidth: 200,
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F87171',
  },
  error: {
    fontSize: 15,
    color: '#F87171',
    textAlign: 'center',
    marginTop: 12,
  },
});
