import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { searchAddress, type GeocodingResult } from '../lib/geocoding';
import type { MapPoint } from './route-map';

const SEARCH_DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 3;

interface Props {
  readonly label: string;
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
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor="#6B7280"
          testID={`${testID}-input`}
        />
        {loading && <ActivityIndicator style={styles.spinner} color="#9CA3AF" />}
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

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  label: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minHeight: 48,
    fontSize: 16,
    color: '#FFFFFF',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  spinner: {
    position: 'absolute',
    right: 16,
  },
  suggestions: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    overflow: 'hidden',
  },
  suggestion: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  suggestionText: {
    fontSize: 15,
    color: '#E5E7EB',
  },
});
