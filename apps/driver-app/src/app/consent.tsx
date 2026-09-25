import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';

import { useGiveConsent } from '../api/use-identity';
import { PRODUCT_NAME } from '../product';
import { useAuthStore } from '../state/auth-store';

/**
 * Privacy notice + consent (design doc §9, M8): "Simple privacy notice and consent screen at
 * first launch." Reached only from `index.tsx`'s gate, when signed in but `driver.consentedAt`
 * is unset — never a screen a driver navigates to directly, so there's no back button or skip.
 */
export default function ConsentScreen() {
  const router = useRouter();
  const setDriver = useAuthStore((s) => s.setDriver);
  const giveConsent = useGiveConsent();

  function handleAccept(): void {
    giveConsent.mutate(undefined, {
      onSuccess: async (driver) => {
        await setDriver(driver);
        // Re-enters index.tsx's own gate, which now sees consentedAt set and moves on to the
        // resume-active-trip check before landing on /home — not duplicated here.
        router.replace('/');
      },
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Before you start</Text>

        <Text style={styles.heading}>What {PRODUCT_NAME} does with your data</Text>
        <Text style={styles.paragraph}>
          While you’re on a trip, we store your position short-term so we can warn you about hazards
          ahead and help with debugging — never longer than 30 days, and only for active trips.
        </Text>
        <Text style={styles.paragraph}>
          Hazard reports you file are shared with other drivers without your name attached.
        </Text>
        <Text style={styles.paragraph}>
          Your vehicle profiles and planned routes are stored so you don’t have to re-enter them
          each time.
        </Text>
        <Text style={styles.paragraph}>
          You can delete your account and everything tied to it at any time from Settings.
        </Text>

        <Text style={styles.heading}>Before you rely on this app</Text>
        <Text style={styles.paragraph}>
          {PRODUCT_NAME} is a planning aid, not a substitute for road signs, official restrictions,
          or your own judgement. Community-reported hazards can only make a route more cautious —
          they never override a sign or restriction you can see on the road.
        </Text>

        {giveConsent.isError && (
          <Text style={styles.error}>
            Couldn’t save that — check your connection and try again.
          </Text>
        )}

        <TouchableOpacity
          style={[styles.button, giveConsent.isPending && styles.buttonDisabled]}
          disabled={giveConsent.isPending}
          onPress={handleAccept}
          testID="consent-accept-button"
        >
          {giveConsent.isPending ? (
            <ActivityIndicator color="#0B1220" />
          ) : (
            <Text style={styles.buttonText}>I understand</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  content: {
    padding: 24,
    gap: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F5A623',
    marginTop: 20,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    color: '#E5E7EB',
    marginTop: 8,
  },
  error: {
    fontSize: 15,
    color: '#F87171',
    marginTop: 20,
  },
  button: {
    minHeight: 56,
    backgroundColor: '#F5A623',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0B1220',
  },
});
