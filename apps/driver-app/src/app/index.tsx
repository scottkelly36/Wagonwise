import { Redirect } from 'expo-router';
import { ActivityIndicator, SafeAreaView, StyleSheet } from 'react-native';

import { useAuthStore } from '../state/auth-store';

// A gate, not a screen: while the stored session is being restored (or exchanged for a fresh
// access token — auth-store's restore() does both at once), show a spinner; once settled,
// hand off to sign-in or the signed-in area. Nothing here is itself navigable content.
export default function IndexScreen() {
  const status = useAuthStore((s) => s.state.status);

  if (status === 'restoring') {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </SafeAreaView>
    );
  }

  return <Redirect href={status === 'signedIn' ? '/home' : '/sign-in'} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
