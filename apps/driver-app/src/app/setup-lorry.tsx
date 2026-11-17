import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCreateVehicleProfile, useVehicleProfiles } from '../api/use-vehicle-profiles';
import {
  LoadStep,
  StartStep,
  VehicleStep,
  type StartChoice,
} from '../components/setup/setup-steps';
import { useCurrentLocation } from '../hooks/use-current-location';
import { routingErrorMessage } from '../lib/error-messages';
import { trackFlow } from '../lib/flow-events';
import {
  initialSelection,
  lorrySummary,
  param,
  planParams,
  presetById,
  vehicleChoice,
  type VehicleSelection,
} from '../lib/lorry-setup';
import { useLoadStore } from '../state/load-store';
import { useUsualVehicleStore } from '../state/usual-vehicle-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';

/**
 * The guided set-up before planning (first-trip redesign, steps 1 to 3): what you drive, what you are carrying, where you start.
 * It ends on Plan route, which asks where you are heading (step 4) with the rest filled in. Opened from Home's Set up my lorry
 * card, from Where to? while the driver has no vehicle, and from Change on Plan route.
 *
 * A typical size is saved as one of the driver's vehicles when they press Next, as Plan route already does for sizes typed there,
 * so the next route starts with it. Flow events: `plan_opened` here (from the card or Where to?), and the choices themselves when
 * Plan route is pressed, as before, so the redesign's numbers line up with today's.
 */
export default function SetupLorryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ entry?: string; step?: string }>();
  const entry = param(params.entry);
  const { data: profiles, isLoading } = useVehicleProfiles();
  const createVehicleProfile = useCreateVehicleProfile();
  const usualId = useUsualVehicleStore((s) => s.profileId);
  const setUsual = useUsualVehicleStore((s) => s.setUsual);
  const loaded = useLoadStore((s) => s.loaded);
  const setLoaded = useLoadStore((s) => s.setLoaded);
  const location = useCurrentLocation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState<VehicleSelection | undefined>(undefined);
  const [makeUsual, setMakeUsual] = useState(true);
  const [profileId, setProfileId] = useState<string | undefined>(undefined);
  const [start, setStart] = useState<StartChoice>('here');
  // The vehicles there were when the driver went to type their own sizes, so the one they add is picked on coming back.
  const [before, setBefore] = useState<readonly string[] | undefined>(undefined);
  const ownSizesId =
    before === undefined ? undefined : profiles?.find((p) => !before.includes(p.id))?.id;

  useEffect(() => {
    // Change on Plan route comes back here, which is not a new start at planning.
    if (entry !== 'change')
      trackFlow('plan_opened', entry === 'home_card' ? 'home_card' : 'where_to');
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Until the driver picks, the usual lorry (or their only one) is already chosen.
  const selection: VehicleSelection | undefined =
    picked ??
    (ownSizesId === undefined ? undefined : { kind: 'profile', id: ownSizesId }) ??
    initialSelection(profiles, usualId);
  const vehicleName =
    profiles?.find((p) => p.id === profileId)?.name ??
    (selection?.kind === 'preset' ? presetById(selection.id)?.name : undefined) ??
    'Your lorry';

  function leave(): void {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }

  function vehicleDone(id: string): void {
    setProfileId(id);
    if (makeUsual) void setUsual(id);
    setStep(2);
  }

  function handleVehicleNext(): void {
    if (selection === undefined) return;
    if (selection.kind === 'profile') {
      vehicleDone(selection.id);
      return;
    }
    const preset = presetById(selection.id);
    if (preset === undefined) return;
    createVehicleProfile.mutate(
      { name: preset.name, dimensions: preset.dimensions },
      { onSuccess: (profile) => vehicleDone(profile.id) },
    );
  }

  function handleStartNext(): void {
    if (profileId === undefined || selection === undefined) return;
    router.replace({
      pathname: '/plan-route',
      params: {
        ...planParams(
          profileId,
          start,
          selection.id === ownSizesId ? 'own_sizes' : vehicleChoice(selection),
        ),
      },
    });
  }

  const positionText =
    location.status === 'granted'
      ? "From your phone's location"
      : location.status === 'loading'
        ? 'Finding your position…'
        : 'Location is off: start somewhere else, or turn it on in Settings';

  return (
    <SafeAreaView style={styles.container}>
      {step === 1 ? (
        <VehicleStep
          saved={profiles ?? []}
          loadingSaved={isLoading}
          selection={selection}
          usual={makeUsual}
          pending={createVehicleProfile.isPending}
          error={
            createVehicleProfile.isError
              ? routingErrorMessage(createVehicleProfile.error)
              : undefined
          }
          onSelect={setPicked}
          onUsualChange={setMakeUsual}
          onOwnSizes={() => {
            setPicked(undefined);
            setBefore((profiles ?? []).map((p) => p.id));
            router.push('/profiles/new');
          }}
          onNext={handleVehicleNext}
          onBack={leave}
        />
      ) : step === 2 ? (
        <LoadStep
          vehicleName={vehicleName}
          loaded={loaded}
          onChange={(next) => void setLoaded(next)}
          onChangeVehicle={() => setStep(1)}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      ) : (
        <StartStep
          summary={lorrySummary(vehicleName, loaded)}
          start={start}
          positionText={positionText}
          onChange={setStart}
          onChangeLorry={() => setStep(1)}
          onNext={handleStartNext}
          onBack={() => setStep(2)}
        />
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
      backgroundColor: colors.background,
    },
  });
}
