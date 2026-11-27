import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  TACHOGRAPH_WORDING_VERSION,
  type TachographMineRow,
} from '@wagonwise/contracts/tachograph';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../api/errors';
import { useMyTachograph, useSendTachographFile } from '../api/use-tachograph';
import { ScreenHeader } from '../components/ui/screen-header';
import { canPickFiles, pickCardFile, type PickedFile } from '../lib/pick-card-file';
import { HAULIERS_SIGNUP_URL } from '../lib/referral-share';
import {
  dayText,
  downloadedDay,
  fileProblem,
  INTEREST_BOSS_BUTTON,
  INTEREST_HEADING,
  INTEREST_OWN_FIRM_LINK,
  INTEREST_TEXT,
  INTERVAL_TEXT,
  sendNotice,
  sizeText,
  statusText,
  ukDay,
} from '../lib/tachograph-send';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';

interface Chosen {
  readonly company: TachographMineRow;
  readonly file: PickedFile;
  /** The day the download was made, `YYYY-MM-DD`. */
  readonly day: string;
}

function sendProblem(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.tag === 'FirmNotEnabled') return 'This company has not switched this on.';
    if (error.tag === 'CompanyNotFound') return 'You no longer drive for this company.';
    if (error.tag === 'InvalidFile')
      return 'That file could not be sent. Check you picked the right one.';
  }
  return 'That did not go through. Check your signal and try again.';
}

/**
 * Send your driver card file to a company you drive for. The driver picks a file their download tool saved, sees which company gets it
 * and what that means, then sends. Nothing in the file is read: the company gets it exactly as it was, and the portal tracks when
 * the next download is due.
 */
export default function TachographScreen() {
  const mine = useMyTachograph();
  const send = useSendTachographFile();
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [chosen, setChosen] = useState<Chosen | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [done, setDone] = useState<string | undefined>(undefined);
  const [showDate, setShowDate] = useState(false);
  const now = new Date();

  async function choose(company: TachographMineRow) {
    setProblem(undefined);
    setDone(undefined);
    try {
      const file = await pickCardFile();
      if (file === null) return;
      const bad = fileProblem(file.sizeBytes);
      if (bad !== undefined) return setProblem(bad);
      setChosen({ company, file, day: downloadedDay(file.lastModifiedMs, new Date()) });
    } catch {
      setProblem('That file could not be opened. Try picking it again.');
    }
  }

  function submit() {
    if (chosen === undefined) return;
    setProblem(undefined);
    send.mutate(
      {
        companyId: chosen.company.companyId,
        file: {
          fileName: chosen.file.name,
          downloadedOn: chosen.day,
          dataBase64: chosen.file.dataBase64,
          wordingVersion: TACHOGRAPH_WORDING_VERSION,
        },
      },
      {
        onSuccess: (result) => {
          setDone(
            result.duplicate
              ? `${chosen.company.companyName} already had exactly this file, so nothing changed.`
              : `Sent to ${chosen.company.companyName}.`,
          );
          setChosen(undefined);
        },
        onError: (error) => setProblem(sendProblem(error)),
      },
    );
  }

  function onDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowDate(false);
    if (event.type === 'set' && selected !== undefined && chosen !== undefined) {
      const day = ukDay(selected);
      setChosen({ ...chosen, day: day > ukDay(new Date()) ? ukDay(new Date()) : day });
    }
  }

  const companies = mine.data ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="Send my tachograph file" />
        <Text style={styles.lead}>
          Your company needs a copy of your driver card. Download it with your usual tool, then send
          the file from here. {INTERVAL_TEXT}
        </Text>

        {!canPickFiles() ? (
          <Text style={styles.body} testID="tachograph-update">
            Update WagonWise from the Play Store or App Store to send a file from this screen.
          </Text>
        ) : mine.isLoading ? (
          <ActivityIndicator color={colors.text} />
        ) : mine.isError ? (
          <Text style={styles.error}>
            Could not load your companies. Check your signal and try again.
          </Text>
        ) : companies.length === 0 ? (
          <>
            <Text style={styles.body}>
              You are not linked to a company yet. Join one from My companies, then you can send
              them your file here.
            </Text>
            <View style={styles.card} testID="tachograph-interest">
              <Text style={styles.heading}>{INTEREST_HEADING}</Text>
              <Text style={styles.body}>{INTEREST_TEXT}</Text>
              <TouchableOpacity
                style={styles.button}
                onPress={() => router.push('/refer')}
                accessibilityRole="button"
                testID="tachograph-interest-boss"
              >
                <Text style={styles.buttonText}>{INTEREST_BOSS_BUTTON}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void Linking.openURL(HAULIERS_SIGNUP_URL).catch(() => undefined)}
                accessibilityRole="link"
                testID="tachograph-interest-own"
              >
                <Text style={styles.link}>{INTEREST_OWN_FIRM_LINK}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : chosen !== undefined ? (
          <View style={styles.card} testID="tachograph-confirm">
            <Text style={styles.heading}>Send to {chosen.company.companyName}?</Text>
            <Text style={styles.body}>
              {chosen.file.name} ({sizeText(chosen.file.sizeBytes)})
            </Text>
            {sendNotice(chosen.company.companyName).map((line) => (
              <Text key={line} style={styles.body}>
                {line}
              </Text>
            ))}
            <View style={styles.dateRow}>
              <Text style={styles.body}>Downloaded on {dayText(chosen.day)}.</Text>
              <TouchableOpacity
                onPress={() => setShowDate(true)}
                accessibilityRole="button"
                testID="tachograph-change-day"
              >
                <Text style={styles.link}>Wrong day? Change</Text>
              </TouchableOpacity>
            </View>
            {showDate && (
              <View>
                <DateTimePicker
                  value={new Date(`${chosen.day}T12:00:00`)}
                  mode="date"
                  maximumDate={now}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onDateChange}
                  testID="tachograph-day-picker"
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity onPress={() => setShowDate(false)}>
                    <Text style={styles.link}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {problem !== undefined && <Text style={styles.error}>{problem}</Text>}
            <TouchableOpacity
              style={[styles.button, send.isPending && styles.disabled]}
              disabled={send.isPending}
              onPress={submit}
              accessibilityRole="button"
              testID="tachograph-send"
            >
              <Text style={styles.buttonText}>
                {send.isPending ? 'Sending…' : `Send to ${chosen.company.companyName}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setChosen(undefined);
                setProblem(undefined);
              }}
              accessibilityRole="button"
              testID="tachograph-cancel"
            >
              <Text style={styles.link}>Go back</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {done !== undefined && (
              <Text style={styles.success} testID="tachograph-done">
                {done}
              </Text>
            )}
            {problem !== undefined && <Text style={styles.error}>{problem}</Text>}
            {companies.map((company) => (
              <View
                key={company.companyId}
                style={styles.card}
                testID={`tachograph-company-${company.companyId}`}
              >
                <Text style={styles.heading}>{company.companyName}</Text>
                {company.firmEnabled ? (
                  <>
                    <Text style={styles.body}>{statusText(company.lastDownloadedOn, now)}</Text>
                    <TouchableOpacity
                      style={styles.button}
                      onPress={() => void choose(company)}
                      accessibilityRole="button"
                      testID={`tachograph-choose-${company.companyId}`}
                    >
                      <Text style={styles.buttonText}>Choose my card file</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={styles.body}>
                    {company.companyName} has not switched this on. Ask them to turn on &ldquo;Let
                    drivers send their own card file&rdquo; on the Tachograph files page of their
                    portal.
                  </Text>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 12 },
    lead: { fontSize: 16, lineHeight: 22, color: colors.textSecondary },
    card: { gap: 10, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface },
    heading: { fontSize: 18, fontWeight: '700', color: colors.text },
    body: { fontSize: 15, lineHeight: 21, color: colors.textSecondary },
    link: { fontSize: 15, fontWeight: '600', color: colors.accentBlue },
    error: { fontSize: 14, color: colors.danger },
    success: { fontSize: 15, fontWeight: '600', color: colors.text },
    dateRow: { gap: 4 },
    button: {
      minHeight: 52,
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
