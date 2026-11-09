import { useState } from 'react';
import { TextInput, type StyleProp, type TextStyle } from 'react-native';

import { l100kmToMpg, mpgToL100km } from '../lib/units';
import { useThemeColors } from '../theme/colors';

interface Props {
  /** The value, in litres per 100 km as text, that the box starts from. */
  readonly l100km: string;
  readonly onChangeL100km: (l100km: string) => void;
  readonly placeholder: string;
  readonly inputStyle: StyleProp<TextStyle>;
  readonly testID: string;
}

/**
 * A box in miles per gallon that reports its value in litres per 100 km, which is what the form checks and sends. It starts from the
 * current value and then belongs to the driver, as the feet and inches boxes do. Use a `key` that includes the unit, so the box is
 * filled afresh when the unit is changed.
 */
export function MpgInput({ l100km, onChangeL100km, placeholder, inputStyle, testID }: Props) {
  const colors = useThemeColors();
  const [text, setText] = useState(() => l100kmToMpg(l100km));
  return (
    <TextInput
      style={inputStyle}
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChangeL100km(mpgToL100km(next));
      }}
      placeholder={placeholder}
      placeholderTextColor={colors.textDim}
      keyboardType="decimal-pad"
      testID={testID}
    />
  );
}
