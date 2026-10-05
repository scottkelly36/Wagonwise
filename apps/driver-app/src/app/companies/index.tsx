import type { DriverLinkDto } from '@wagonwise/contracts/fleet';
import { useRouter } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLeaveLink, useMyLinks, useRespondToInvitation } from '../../api/use-fleet';
import { fleetErrorMessage } from '../../lib/error-messages';
import { Icon } from '../../components/ui/icon';
import { ScreenHeader } from '../../components/ui/screen-header';
import { useThemeColors, type ThemeColors } from '../../theme/colors';
import { cardStyle, radius } from '../../theme/tokens';

/** P2-M2.7: which companies a driver is invited by, waiting on, or working for, and leaving one.
 *  A driver can be active with several at once (agency drivers) — the company always decides who
 *  gets in, this screen only ever asks or answers. */
export default function CompaniesScreen() {
  const router = useRouter();
  const { data, isLoading, isError, isRefetching, refetch } = useMyLinks();
  const respond = useRespondToInvitation();
  const leave = useLeaveLink();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const invitations = data?.filter((link) => link.status === 'invited') ?? [];
  const requests = data?.filter((link) => link.status === 'requested') ?? [];
  const active = data?.filter((link) => link.status === 'active') ?? [];
  const actionError = respond.error ?? leave.error;

  function confirmLeave(link: DriverLinkDto): void {
    Alert.alert(`Leave ${link.companyName ?? 'this company'}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => leave.mutate(link.id) },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      >
        <ScreenHeader
          title="My companies"
          fallbackHref="/more"
          right={
            <TouchableOpacity
              style={styles.joinButton}
              onPress={() => router.push('/companies/join')}
              accessibilityRole="button"
              testID="join-company-button"
            >
              <Icon name="plus" size={22} color={colors.textOnAccent} />
              <Text style={styles.joinButtonText}>Join</Text>
            </TouchableOpacity>
          }
        />

        {actionError !== null && <Text style={styles.error}>{fleetErrorMessage(actionError)}</Text>}

        {isLoading ? (
          <ActivityIndicator style={styles.loading} size="large" color={colors.text} />
        ) : isError ? (
          <Text style={styles.message}>Could not load your companies. Pull down to try again.</Text>
        ) : (
          <>
            <Section
              title="Invitations"
              empty="No open invitations."
              items={invitations}
              styles={styles}
              renderActions={(link) => (
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.acceptButton}
                    disabled={respond.isPending}
                    onPress={() => respond.mutate({ id: link.id, accept: true })}
                    testID={`accept-link-${link.id}`}
                  >
                    <Text style={styles.acceptButtonText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.declineButton}
                    disabled={respond.isPending}
                    onPress={() => respond.mutate({ id: link.id, accept: false })}
                    testID={`decline-link-${link.id}`}
                  >
                    <Text style={styles.declineButtonText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              )}
            />

            <Section
              title="Requests waiting"
              empty="No requests waiting on a company."
              items={requests}
              styles={styles}
              renderActions={(link) => (
                <TouchableOpacity
                  style={styles.declineButton}
                  disabled={leave.isPending}
                  onPress={() => leave.mutate(link.id)}
                  testID={`withdraw-link-${link.id}`}
                >
                  <Text style={styles.declineButtonText}>Withdraw</Text>
                </TouchableOpacity>
              )}
            />

            <Section
              title="Active"
              empty="You're not linked to any company yet."
              items={active}
              styles={styles}
              renderActions={(link) => (
                <TouchableOpacity
                  style={styles.declineButton}
                  disabled={leave.isPending}
                  onPress={() => confirmLeave(link)}
                  testID={`leave-link-${link.id}`}
                >
                  <Text style={styles.declineButtonText}>Leave</Text>
                </TouchableOpacity>
              )}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section(props: {
  title: string;
  empty: string;
  items: readonly DriverLinkDto[];
  styles: ReturnType<typeof createStyles>;
  renderActions: (link: DriverLinkDto) => ReactNode;
}) {
  const styles = props.styles;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{props.title}</Text>
      {props.items.length === 0 ? (
        <Text style={styles.message}>{props.empty}</Text>
      ) : (
        props.items.map((link) => (
          <View key={link.id} style={styles.row} testID={`company-row-${link.id}`}>
            <View style={styles.rowTop}>
              <View style={styles.badge}>
                <Icon name="office-building-outline" size={26} color={styles.badgeIcon.color} />
              </View>
              <Text style={styles.rowName}>{link.companyName ?? 'A company'}</Text>
            </View>
            {props.renderActions(link)}
          </View>
        ))
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
      gap: 8,
    },
    joinButton: {
      minHeight: 48,
      paddingHorizontal: 16,
      backgroundColor: colors.accent,
      borderRadius: 16,
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'center',
      alignItems: 'center',
    },
    joinButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textOnAccent,
    },
    loading: {
      marginTop: 48,
    },
    message: {
      fontSize: 15,
      color: colors.textMuted,
    },
    error: {
      fontSize: 15,
      color: colors.danger,
      marginBottom: 8,
    },
    section: {
      marginTop: 16,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    row: {
      ...cardStyle(colors),
      padding: 14,
      marginBottom: 12,
      gap: 12,
    },
    rowTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    badge: {
      width: 48,
      height: 48,
      borderRadius: radius.badge,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    badgeIcon: {
      color: colors.accent,
    },
    rowName: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.text,
      flex: 1,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    acceptButton: {
      flex: 1,
      minHeight: 52,
      paddingHorizontal: 14,
      backgroundColor: colors.accent,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    acceptButtonText: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textOnAccent,
    },
    declineButton: {
      flex: 1,
      minHeight: 52,
      paddingHorizontal: 14,
      borderWidth: 2,
      borderColor: colors.danger,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    declineButtonText: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.danger,
    },
  });
}
