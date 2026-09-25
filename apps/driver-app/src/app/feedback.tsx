import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';

import { useSubmitFeedback } from '../api/use-feedback';
import { feedbackErrorMessage } from '../lib/error-messages';
import { getAppVersion, getDeviceInfo } from '../lib/app-info';

/**
 * Feedback (design doc §8): "Free-text notes to you, with app version and device info
 * attached". App version/device info are captured automatically (`lib/app-info.ts`) — nothing
 * for a driver to fill in beyond the note itself.
 */
export default function FeedbackScreen() {
  const router = useRouter();
  const submitFeedback = useSubmitFeedback();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  function handleSubmit(): void {
    if (message.trim() === '' || submitFeedback.isPending) return;
    submitFeedback.mutate(
      { message, appVersion: getAppVersion(), deviceInfo: getDeviceInfo() },
      { onSuccess: () => setSent(true) },
    );
  }

  if (sent) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.sentContent}>
          <Text style={styles.title}>Thanks</Text>
          <Text style={styles.hint}>Your note has been sent.</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.back()}
            testID="feedback-done-button"
          >
            <Text style={styles.buttonText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Feedback</Text>
          <Text style={styles.hint}>Tell us what’s working, what’s not, or what’s missing.</Text>

          <TextInput
            style={styles.input}
            value={message}
            onChangeText={setMessage}
            placeholder="Write your note here"
            placeholderTextColor="#6B7280"
            multiline
            autoFocus
            testID="feedback-message-input"
          />

          {submitFeedback.isError && (
            <Text style={styles.error}>{feedbackErrorMessage(submitFeedback.error)}</Text>
          )}

          <TouchableOpacity
            style={[
              styles.button,
              (message.trim() === '' || submitFeedback.isPending) && styles.buttonDisabled,
            ]}
            disabled={message.trim() === '' || submitFeedback.isPending}
            onPress={handleSubmit}
            testID="feedback-submit-button"
          >
            {submitFeedback.isPending ? (
              <ActivityIndicator color="#0B1220" />
            ) : (
              <Text style={styles.buttonText}>Send</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.footnote}>
            Sent with app version {getAppVersion()} · {getDeviceInfo()}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 24,
    gap: 8,
  },
  sentContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  hint: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  input: {
    minHeight: 160,
    fontSize: 18,
    color: '#FFFFFF',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    textAlignVertical: 'top',
  },
  error: {
    fontSize: 16,
    color: '#F87171',
    marginTop: 16,
  },
  button: {
    minHeight: 56,
    backgroundColor: '#F5A623',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0B1220',
  },
  footnote: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 16,
  },
});
