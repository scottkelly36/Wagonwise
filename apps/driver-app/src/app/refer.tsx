import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MyReferralDto } from '@wagonwise/contracts/referrals';

import { useClaimReward, useMyReferrals } from '../api/use-referrals';
import { Icon } from '../components/ui/icon';
import { ScreenHeader } from '../components/ui/screen-header';
import { REFERRAL_TERMS_URL, STATUS_TEXT, shareMessage } from '../lib/referral-share';
import { useAuthStore } from '../state/auth-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Recommend WagonWise to the firm you drive for (docs/modules.md, "Referrals"): the driver's code, a ready-written message to send
 * their boss, the firms they have recommended, and, once a firm has paid, where to send the gift card. The email asked for here is
 * used for the gift card alone.
 */
export default function ReferScreen() {
  const mine = useMyReferrals();
  const claim = useClaimReward();
  const state = useAuthStore((s) => s.state);
  const name = state.status === 'signedIn' ? (state.driver.name ?? null) : null;
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [emails, setEmails] = useState<Record<string, string>>({});

  const reward = mine.data?.rewardPounds ?? 25;

  function claimRow(r: MyReferralDto) {
    const email = emails[r.id] ?? '';
    const valid = EMAIL.test(email.trim());
    return (
      <View style={styles.claim} testID={`refer-claim-${r.id}`}>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={(text) => setEmails((all) => ({ ...all, [r.id]: text }))}
          placeholder="Email for your gift card"
          placeholderTextColor={colors.textDim}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          testID={`refer-email-${r.id}`}
        />
        <Text style={styles.small}>Used only to send your gift card.</Text>
        <TouchableOpacity
          style={[styles.button, (!valid || claim.isPending) && styles.disabled]}
          disabled={!valid || claim.isPending}
          onPress={() => claim.mutate({ id: r.id, email: email.trim() })}
          accessibilityRole="button"
          testID={`refer-claim-button-${r.id}`}
        >
          <Text style={styles.buttonText}>Send me my £{reward} gift card</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader title="Recommend us to your boss" />
          <Text style={styles.lead}>
            If the firm you drive for joins WagonWise with your code, you get a £{reward} Amazon
            gift card once they have paid their first bill.
          </Text>

          {mine.isLoading ? (
            <ActivityIndicator color={colors.text} />
          ) : mine.isError || mine.data === undefined ? (
            <Text style={styles.error}>
              Could not load your code. Check your signal and try again.
            </Text>
          ) : (
            <>
              <View style={styles.codeCard}>
                <Text style={styles.small}>Your code</Text>
                <Text style={styles.code} selectable testID="refer-code">
                  {mine.data.code}
                </Text>
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => void Share.share({ message: shareMessage(mine.data.code, name) })}
                  accessibilityRole="button"
                  testID="refer-share-button"
                >
                  <Icon name="share-variant" size={20} color={colors.textOnAccent} />
                  <Text style={styles.buttonText}>Send it to your boss</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.heading}>How it works</Text>
              <Text style={styles.body}>
                1. Send your boss the message: it has a short video and your code.{'\n'}
                2. When the firm joins, they give us your code.{'\n'}
                3. Once they have paid their first bill, we send you the gift card.
              </Text>
              <Text style={styles.small}>
                For firms with at least two lorries, not your own. One reward per firm.
              </Text>
              <TouchableOpacity
                onPress={() => void Linking.openURL(REFERRAL_TERMS_URL)}
                accessibilityRole="link"
                testID="refer-terms-link"
              >
                <Text style={styles.link}>Full terms</Text>
              </TouchableOpacity>

              <Text style={styles.heading}>Firms you have recommended</Text>
              {mine.data.referrals.length === 0 ? (
                <Text style={styles.body}>None yet.</Text>
              ) : (
                mine.data.referrals.map((r) => (
                  <View key={r.id} style={styles.row} testID={`refer-row-${r.id}`}>
                    <Text style={styles.firm}>{r.firmName}</Text>
                    <Text style={styles.body}>{STATUS_TEXT[r.status]}</Text>
                    {r.status === 'reward_due' ? claimRow(r) : null}
                  </View>
                ))
              )}
              {claim.isError ? (
                <Text style={styles.error}>That did not go through. Please try again.</Text>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    content: { padding: 16, gap: 12 },
    lead: { fontSize: 16, lineHeight: 22, color: colors.textSecondary },
    codeCard: {
      gap: 10,
      padding: 16,
      borderRadius: radius.card,
      backgroundColor: colors.accentSoft,
      alignItems: 'stretch',
    },
    code: { fontSize: 30, fontWeight: '800', letterSpacing: 2, color: colors.text },
    heading: { marginTop: 8, fontSize: 18, fontWeight: '700', color: colors.text },
    body: { fontSize: 15, lineHeight: 21, color: colors.textSecondary },
    small: { fontSize: 13, color: colors.textMuted },
    link: { fontSize: 15, fontWeight: '600', color: colors.accentBlue },
    error: { fontSize: 14, color: colors.danger },
    row: { gap: 4, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface },
    firm: { fontSize: 16, fontWeight: '700', color: colors.text },
    claim: { gap: 8, marginTop: 6 },
    input: {
      minHeight: 48,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: colors.background,
      color: colors.text,
      fontSize: 16,
    },
    button: {
      minHeight: 52,
      flexDirection: 'row',
      gap: 8,
      borderRadius: radius.card,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    disabled: { opacity: 0.5 },
    buttonText: { fontSize: 16, fontWeight: '800', color: colors.textOnAccent },
  });
}
