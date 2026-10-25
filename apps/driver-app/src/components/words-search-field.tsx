import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { What3wordsAddressDto } from '@wagonwise/contracts/what3words';

import { useWordsToLocation } from '../api/use-what3words';
import { wordsLookupMessage } from '../lib/what3words-messages';
import { useThemeColors, type ThemeColors } from '../theme/colors';

interface Props {
  /** Called with the spot the three words name, once the driver has looked them up. */
  readonly onSelect: (address: What3wordsAddressDto) => void;
  /** Called when the driver starts typing again, so a destination set from earlier words is not left standing. */
  readonly onEdit?: (() => void) | undefined;
  readonly testID: string;
}

/**
 * Where to? by three words (what3words): type them, tap Find, and the spot is set with the nearest town shown beside it, so a
 * mistyped word that lands in the wrong county is plain to see before the driver sets off. Nothing is looked up as they type: each
 * lookup is billed, so it is one tap, one lookup.
 */
export function WordsSearchField({ onSelect, onEdit, testID }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState('');
  const [found, setFound] = useState<What3wordsAddressDto | undefined>(undefined);
  const lookup = useWordsToLocation();

  function find(): void {
    if (text.trim().length === 0 || lookup.isPending) return;
    lookup.mutate(text, {
      onSuccess: (address) => {
        setFound(address);
        onSelect(address);
      },
    });
  }

  function handleChange(next: string): void {
    setText(next);
    if (found !== undefined) {
      setFound(undefined);
      onEdit?.();
    }
    if (lookup.isError) lookup.reset();
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.slashes}>{'///'}</Text>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={handleChange}
          placeholder="filled.count.soap"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="search"
          onSubmitEditing={find}
          testID={`${testID}-input`}
        />
        <TouchableOpacity
          style={[
            styles.find,
            (text.trim().length === 0 || lookup.isPending) && styles.findDisabled,
          ]}
          disabled={text.trim().length === 0 || lookup.isPending}
          onPress={find}
          accessibilityRole="button"
          testID={`${testID}-find`}
        >
          {lookup.isPending ? (
            <ActivityIndicator color={colors.textOnAccent} />
          ) : (
            <Text style={styles.findText}>Find</Text>
          )}
        </TouchableOpacity>
      </View>
      {lookup.isError && (
        <Text style={styles.error} testID={`${testID}-error`}>
          {wordsLookupMessage(lookup.error)}
        </Text>
      )}
      {found !== undefined && (
        <Text style={styles.found} testID={`${testID}-found`}>
          {'///'}
          {found.words}
          {found.nearestPlace === undefined ? '' : ` · near ${found.nearestPlace}`}
        </Text>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { gap: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    slashes: { fontSize: 20, fontWeight: '800', color: '#E11F26' },
    input: {
      flex: 1,
      minHeight: 48,
      borderRadius: 12,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      fontSize: 17,
      color: colors.text,
    },
    find: {
      minHeight: 48,
      minWidth: 72,
      borderRadius: 12,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 14,
    },
    findDisabled: { opacity: 0.5 },
    findText: { fontSize: 16, fontWeight: '700', color: colors.textOnAccent },
    error: { fontSize: 15, color: colors.danger },
    found: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  });
}
