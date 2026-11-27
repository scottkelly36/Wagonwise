import {
  TACHOGRAPH_WORDING_VERSION,
  type TachographMineRow,
} from '@wagonwise/contracts/tachograph';
import * as Device from 'expo-device';
import { useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ui/screen-header';
import { useMyTachograph, useSendTachographFile } from '../api/use-tachograph';
import { PRETEND_FILE_PREFIX, useCardRead } from '../hooks/use-card-read';
import { canShareFiles, deleteSavedFile, shareBytes } from '../lib/share-card-file';
import { toBase64 } from '../lib/tachograph-card/base64';
import { sizeText } from '../lib/tachograph-card/card-flow';
import { SCENARIOS } from '../lib/tachograph-card/scenarios';
import { usbReaderSupported } from '../lib/tachograph-card/usb-reader';
import { sendNotice, ukDay } from '../lib/tachograph-send';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';

type Source = 'real' | 'pretend';

interface UploadStep {
  readonly ddd: Uint8Array;
  readonly confirming?: TachographMineRow | undefined;
  readonly sentTo?: string | undefined;
  readonly error?: string | undefined;
}

/** The text a log is shared as: what built it, what phone, when, then the lines. Never anything from the card itself. */
function logText(lines: readonly string[]): string {
  return [
    'WagonWise card read log',
    new Date().toISOString(),
    `phone: ${Device.manufacturer ?? '?'} ${Device.modelName ?? '?'}, ${Platform.OS} ${String(Platform.Version)}`,
    '',
    ...lines,
  ].join('\n');
}

/**
 * Read my card, for test builds only (More shows it only there). It reads a PRETEND card with the same reading logic, or, in a build
 * that has the USB reader support, a REAL card in a reader plugged into the phone. A real read makes the card's file on the phone and
 * a log of what the reader and card said (sizes and status words, never what is on the card). Nothing is sent by the app: the driver
 * chooses whether to share the file or the log, and where.
 */
export default function ReadCardScreen() {
  const { state, start, startReal, cancel, reset, log, download } = useCardRead();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const realAvailable = usbReaderSupported();
  const [source, setSource] = useState<Source>(realAvailable ? 'real' : 'pretend');
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0]?.id ?? '');
  const [showLog, setShowLog] = useState(false);
  const [shareError, setShareError] = useState<string | undefined>(undefined);
  const mine = useMyTachograph();
  const send = useSendTachographFile();
  // Where the driver is in uploading this read's file: who they tapped Upload for (they see who gets it and what that means, then
  // confirm), then the outcome. It belongs to one file, so a new read starts it again.
  const [step, setStep] = useState<UploadStep | undefined>(undefined);
  const current = download !== undefined && step?.ddd === download.ddd ? step : undefined;
  const confirming = current?.confirming;
  const sentTo = current?.sentTo;
  const uploadError = current?.error;
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const busy = state.status === 'reading';
  const real = source === 'real';

  const shareFile = async () => {
    if (download === undefined) return;
    setShareError(undefined);
    try {
      await shareBytes(download.fileName, download.ddd, 'application/octet-stream');
    } catch {
      setShareError('The file could not be shared from this phone.');
    }
  };

  function upload(company: TachographMineRow) {
    if (download === undefined) return;
    setStep({ ddd: download.ddd, confirming: company });
    send.mutate(
      {
        companyId: company.companyId,
        file: {
          fileName: download.fileName,
          downloadedOn: ukDay(new Date()),
          dataBase64: toBase64(download.ddd),
          wordingVersion: TACHOGRAPH_WORDING_VERSION,
        },
      },
      {
        onSuccess: (result) => {
          setStep({
            ddd: download.ddd,
            sentTo: result.duplicate
              ? `${company.companyName} already had exactly this file, so nothing changed.`
              : `Uploaded to ${company.companyName}'s portal.`,
          });
        },
        onError: () =>
          setStep({
            ddd: download.ddd,
            confirming: company,
            error: 'That did not go through. Check your signal and try again.',
          }),
      },
    );
  }

  const companies = mine.data ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="Read my card (test)" />

        {realAvailable && (
          <View style={styles.row}>
            {(['real', 'pretend'] as const).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.tab, s === source && styles.tabOn]}
                disabled={busy}
                onPress={() => {
                  setSource(s);
                  reset();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: s === source, disabled: busy }}
                testID={`source-${s}`}
              >
                <Text style={styles.choiceLabel}>
                  {s === 'real' ? 'Real reader' : 'Pretend card'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.notice} testID="read-card-notice">
          <Text style={styles.noticeText}>
            {real
              ? 'This reads the driver card in a USB card reader plugged into the phone. The file holds the card holder’s name, licence number and recent driving. It stays on this phone unless you share it. Only read a card you have the holder’s OK to read, and not while they need it to drive.'
              : 'This reads a pretend card. Nothing real is read, and nothing is sent unless you choose to upload the pretend file to a company, so the steps can be tried without a real card or reader. The file is named PRETEND_ so it can be told apart.'}
          </Text>
        </View>

        {real ? (
          <Text style={styles.body}>
            Plug the reader into the phone and tap Allow if the phone asks. Put the driver card in
            with the chip facing the right way, then tap Read the card.
          </Text>
        ) : (
          <>
            <Text style={styles.heading}>Pick a pretend card</Text>
            {SCENARIOS.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[styles.choice, s.id === scenarioId && styles.choiceOn]}
                disabled={busy}
                onPress={() => {
                  setScenarioId(s.id);
                  reset();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: s.id === scenarioId, disabled: busy }}
                testID={`scenario-${s.id}`}
              >
                <Text style={styles.choiceLabel}>{s.label}</Text>
                <Text style={styles.small}>{s.expect}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {busy ? (
          <View style={styles.card} testID="read-card-progress">
            <Text style={styles.heading}>Reading the card…</Text>
            <View style={styles.bar}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.round((state.step / state.steps) * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.body}>
              {state.file} ({state.step} of {state.steps})
            </Text>
            <TouchableOpacity onPress={cancel} accessibilityRole="button" testID="read-card-cancel">
              <Text style={styles.link}>Stop</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              if (real) void startReal();
              else if (scenario !== undefined) void start(scenario);
            }}
            accessibilityRole="button"
            testID="read-card-start"
          >
            <Text style={styles.buttonText}>Read the card</Text>
          </TouchableOpacity>
        )}

        {state.status === 'failed' && (
          <Text style={styles.error} testID="read-card-error">
            {state.message}
          </Text>
        )}

        {state.status === 'done' && (
          <View style={styles.card} testID="read-card-done">
            <Text style={styles.heading}>Card read</Text>
            <Text style={styles.body}>
              {state.summary.fileName}, {sizeText(state.summary.totalBytes)}.{' '}
              {state.summary.signedCount} of {state.summary.files.length} parts were signed by the
              card.
              {state.summary.skippedCount > 0
                ? ` ${state.summary.skippedCount} optional part was not on this card.`
                : ''}
            </Text>
            {state.summary.files.map((f) => (
              <Text key={f.name} style={styles.small}>
                {f.skipped ? '–' : f.signed ? '✓' : '·'} {f.name}
                {f.skipped ? ' (not on this card)' : ` (${sizeText(f.bytes)})`}
              </Text>
            ))}
            <Text style={styles.small}>
              The file is kept exactly as the card gave it. Nothing in it has been read or checked
              yet.
            </Text>
            {download !== undefined && confirming !== undefined && (
              <View style={styles.card} testID="read-card-confirm">
                <Text style={styles.heading}>Upload to {confirming.companyName}?</Text>
                {download.fileName.startsWith(PRETEND_FILE_PREFIX) && (
                  <Text style={styles.error} testID="read-card-pretend-warning">
                    This is a PRETEND card file. {confirming.companyName} will see it in their
                    portal as a file from you, and it counts as your latest card download. Ask them
                    to delete it afterwards.
                  </Text>
                )}
                {sendNotice(confirming.companyName).map((line) => (
                  <Text key={line} style={styles.body}>
                    {line}
                  </Text>
                ))}
                {uploadError !== undefined && <Text style={styles.error}>{uploadError}</Text>}
                <TouchableOpacity
                  style={[styles.button, send.isPending && styles.disabled]}
                  disabled={send.isPending}
                  onPress={() => upload(confirming)}
                  accessibilityRole="button"
                  testID="read-card-upload-confirm"
                >
                  <Text style={styles.buttonText}>
                    {send.isPending ? 'Uploading…' : `Upload to ${confirming.companyName}`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setStep(undefined)}
                  accessibilityRole="button"
                  testID="read-card-upload-cancel"
                >
                  <Text style={styles.link}>Go back</Text>
                </TouchableOpacity>
              </View>
            )}
            {download !== undefined && confirming === undefined && (
              <>
                {sentTo !== undefined && (
                  <Text style={styles.success} testID="read-card-uploaded">
                    {sentTo}
                  </Text>
                )}
                {companies.map((company) =>
                  company.firmEnabled ? (
                    <TouchableOpacity
                      key={company.companyId}
                      style={styles.button}
                      onPress={() => setStep({ ddd: download.ddd, confirming: company })}
                      accessibilityRole="button"
                      testID={`read-card-upload-${company.companyId}`}
                    >
                      <Text style={styles.buttonText}>
                        Upload to {company.companyName}’s portal
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text key={company.companyId} style={styles.small}>
                      {company.companyName} has not switched this on yet, so the file cannot go to
                      its portal.
                    </Text>
                  ),
                )}
                {mine.isSuccess && companies.length === 0 && (
                  <Text style={styles.small}>
                    You are not linked to a company, so the file stays on this phone.
                  </Text>
                )}
                {canShareFiles() && (
                  <>
                    <TouchableOpacity
                      onPress={() => void shareFile()}
                      accessibilityRole="button"
                      testID="read-card-share-file"
                    >
                      <Text style={styles.link}>Save or share the file instead</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        deleteSavedFile(download.fileName);
                        reset();
                      }}
                      accessibilityRole="button"
                      testID="read-card-delete"
                    >
                      <Text style={styles.link}>Delete the saved copy</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
            {shareError !== undefined && <Text style={styles.error}>{shareError}</Text>}
          </View>
        )}

        {real && log.length > 0 && (
          <View style={styles.card} testID="read-card-log">
            <Text style={styles.heading}>What the reader said</Text>
            <Text style={styles.small}>
              Sizes and status words only, not what is on the card. Share it if something went
              wrong.
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => void Share.share({ message: logText(log) })}
              accessibilityRole="button"
              testID="read-card-share-log"
            >
              <Text style={styles.buttonText}>Share the log</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowLog((v) => !v)} accessibilityRole="button">
              <Text style={styles.link}>{showLog ? 'Hide the log' : 'Show the log'}</Text>
            </TouchableOpacity>
            {showLog && (
              <Text style={styles.mono} selectable>
                {log.join('\n')}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 12 },
    row: { flexDirection: 'row', gap: 8 },
    tab: {
      flex: 1,
      padding: 12,
      borderRadius: radius.card,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    tabOn: { borderWidth: 2, borderColor: colors.accent },
    notice: { padding: 14, borderRadius: radius.card, backgroundColor: colors.accentSoft },
    noticeText: { fontSize: 15, lineHeight: 21, color: colors.text },
    heading: { fontSize: 18, fontWeight: '700', color: colors.text },
    body: { fontSize: 15, lineHeight: 21, color: colors.textSecondary },
    small: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
    mono: { fontSize: 11, lineHeight: 15, color: colors.textMuted, fontFamily: 'monospace' },
    link: { fontSize: 15, fontWeight: '600', color: colors.accentBlue },
    error: { fontSize: 15, lineHeight: 21, color: colors.danger },
    success: { fontSize: 15, fontWeight: '600', color: colors.text },
    disabled: { opacity: 0.5 },
    choice: { gap: 2, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface },
    choiceOn: { borderWidth: 2, borderColor: colors.accent },
    choiceLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
    card: { gap: 8, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface },
    bar: { height: 10, borderRadius: 5, backgroundColor: colors.background, overflow: 'hidden' },
    barFill: { height: 10, backgroundColor: colors.accent },
    button: {
      minHeight: 52,
      borderRadius: radius.card,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    buttonText: { fontSize: 16, fontWeight: '800', color: colors.textOnAccent },
  });
}
