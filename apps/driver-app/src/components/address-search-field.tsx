import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { searchAddress, type GeocodingResult } from '../lib/geocoding';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import type { MapPoint } from './route-map';

const SEARCH_DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 3;

interface Props {
  /** Shown above the box; the route screen leaves it off because its own picker names the field. */
  readonly label?: string | undefined;
  readonly placeholder: string;
  /** Undefined means address search is unavailable (no MapTiler key configured) — the field
   *  still renders as a plain text input, just never shows suggestions, same "degrade, don't
   *  break" shape as `mapStyleUrl`'s own keyless fallback. */
  readonly apiKey: string | undefined;
  /** Biases results towards wherever the driver actually is (design decision, 2026-09-24) — this
   *  app's whole tester base is around Hexham, and a nearer match is almost always the right one. */
  readonly near: MapPoint | undefined;
  readonly onSelect: (result: GeocodingResult) => void;
  readonly testID: string;
}

/**
 * Address search (design decision, 2026-09-24: "drivers more than likely will have an address to
 * go to" rather than a point they'd tap on a map). Debounced as-you-type, calling MapTiler's
 * geocoding API directly (`lib/geocoding.ts`) the same way the map style itself already does.
 * Deliberately additive, not a replacement for tap-to-set-on-map — a driver with no formal
 * address (a farm gate, a yard entrance) still needs that.
 */
export function AddressSearchField({ label, placeholder, apiKey, near, onSelect, testID }: Props) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestIdRef = useRef(0);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== undefined) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChangeText(newText: string): void {
    setText(newText);
    if (debounceRef.current !== undefined) clearTimeout(debounceRef.current);

    if (apiKey === undefined || newText.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const requestId = (requestIdRef.current += 1);
      setLoading(true);
      searchAddress(newText, apiKey, near)
        .then((found) => {
          // A slower earlier request landing after a faster later one must never overwrite it.
          if (requestId === requestIdRef.current) setResults(found);
        })
        .catch(() => {
          if (requestId === requestIdRef.current) setResults([]);
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleSelect(result: GeocodingResult): void {
    setText(result.placeName);
    setResults([]);
    onSelect(result);
  }

  return (
    <View style={styles.container}>
      {label !== undefined && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textDim}
          testID={`${testID}-input`}
        />
        {loading && <ActivityIndicator style={styles.spinner} color={colors.textMuted} />}
      </View>

      {results.length > 0 && (
        <View style={styles.suggestions}>
          {results.map((result, index) => (
            <TouchableOpacity
              key={`${result.placeName}-${index}`}
              style={styles.suggestion}
              onPress={() => handleSelect(result)}
              testID={`${testID}-suggestion-${index}`}
            >
              <Text style={styles.suggestionText} numberOfLines={1}>
                {result.placeName}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      gap: 4,
    },
    label: {
      fontSize: 14,
      color: colors.textMuted,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    input: {
      flex: 1,
      minHeight: 52,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 16,
    },
    spinner: {
      position: 'absolute',
      right: 16,
    },
    suggestions: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      overflow: 'hidden',
    },
    suggestion: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceStrong,
    },
    suggestionText: {
      fontSize: 15,
      color: colors.textSecondary,
    },
  });
}
