import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Props {
  readonly name: IconName;
  readonly size?: number;
  readonly color: ColorValue;
}

/** The app's one icon set (Material Community Icons), so every screen draws from the same family and
 *  stroke weight. Takes an explicit colour: icons follow the theme, never a default black. */
export function Icon({ name, size = 24, color }: Props) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}
