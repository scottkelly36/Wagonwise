import { useState } from 'react';
import { TextInput, type StyleProp, type TextStyle } from 'react-native';

import { kphToMph, mphToKph } from '../lib/units';
import { useThemeColors } from '../theme/colors';

interface Props {
  /** The value, in km/h as text, that the box starts from. */
  readonly kph: string;
  readonly onChangeKph: (kph: string) => void;
  readonly placeholder: string;
  readonly inputStyle: StyleProp<TextStyle>;
  readonly testID: string;
}

/**
 * A box in miles per hour that reports its value in km/h, which is what the form checks and sends. It starts from the current value and
 * then belongs to the driver, as the miles per gallon box does.
 */
export function SpeedInput({ kph, onChangeKph, placeholder, inputStyle, testID }: Props) {
  const colors = useThemeColors();
  const [text, setText] = useState(() => kphToMph(kph));
  return (
    <TextInput
      style={inputStyle}
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChangeKph(mphToKph(next));
      }}
      placeholder={placeholder}
      placeholderTextColor={colors.textDim}
      keyboardType="decimal-pad"
      testID={testID}
    />
  );
}
