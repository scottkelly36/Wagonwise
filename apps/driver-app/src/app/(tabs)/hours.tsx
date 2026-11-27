import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMyTachograph } from '../../api/use-tachograph';
import { Icon } from '../../components/ui/icon';
import { cardSimulatorEnabled } from '../../lib/card-simulator';
import { canPickFiles } from '../../lib/pick-card-file';
import { INTERVAL_TEXT, statusText } from '../../lib/tachograph-send';
import { useThemeColors, type ThemeColors } from '../../theme/colors';
import { cardStyle } from '../../theme/tokens';

/**
 * The Hours tab: the driver's own driving-hours clock, and their tachograph driver card (what each company they drive for last
 * received and when the next download is due, reading the card in a reader, or sending a file). These used to sit in More.
 */
export default function HoursScreen() {
  const router = useRouter();
  const mine = useMyTachograph();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const companies = mine.data ?? [];
  const now = new Date();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Hours and card</Text>

        <View style={styles.card}>
          <Text style={styles.heading}>Driving hours</Text>
          <Text style={styles.body}>
            Tap what you are doing and the app counts down to your next break. A guide only: your
            tachograph is the legal record.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/shift')}
            accessibilityRole="button"
            testID="shift-button"
          >
            <Icon name="timer-outline" size={22} color={colors.textOnAccent} />
            <Text style={styles.buttonText}>Open driving hours</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Your driver card</Text>
          <Text style={styles.body}>{INTERVAL_TEXT}</Text>
          {companies.map((company) => (
            <Text key={company.companyId} style={styles.body} testID={`hours-${company.companyId}`}>
              {company.companyName}:{' '}
              {company.firmEnabled
                ? statusText(company.lastDownloadedOn, now)
                : 'has not switched this on yet.'}
            </Text>
          ))}
          {mine.isSuccess && companies.length === 0 && (
            <Text style={styles.body}>You are not linked to a company yet.</Text>
          )}
          {cardSimulatorEnabled() && (
            <TouchableOpacity
              style={styles.button}
              onPress={() => router.push('/read-card')}
              accessibilityRole="button"
              testID="read-card-button"
            >
              <Icon name="card-account-details-outline" size={22} color={colors.textOnAccent} />
              <Text style={styles.buttonText}>Read my card (test)</Text>
            </TouchableOpacity>
          )}
          {canPickFiles() && (
            <TouchableOpacity
              style={cardSimulatorEnabled() ? styles.secondary : styles.button}
              onPress={() => router.push('/tachograph')}
              accessibilityRole="button"
              testID="tachograph-button"
            >
              <Icon
                name="file-upload-outline"
                size={22}
                color={cardSimulatorEnabled() ? colors.text : colors.textOnAccent}
              />
              <Text style={cardSimulatorEnabled() ? styles.secondaryText : styles.buttonText}>
                Send a card file
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 12 },
    title: { fontSize: 28, fontWeight: '800', color: colors.text },
    card: { ...cardStyle(colors), gap: 10, padding: 16 },
    heading: { fontSize: 18, fontWeight: '700', color: colors.text },
    body: { fontSize: 15, lineHeight: 21, color: colors.textSecondary },
    button: {
      minHeight: 52,
      borderRadius: 14,
      backgroundColor: colors.accent,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    buttonText: { fontSize: 16, fontWeight: '800', color: colors.textOnAccent },
    secondary: {
      minHeight: 52,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.divider,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    secondaryText: { fontSize: 16, fontWeight: '700', color: colors.text },
  });
}
