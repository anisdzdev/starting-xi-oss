import { useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, typeScale } from '@/theme';

type Props = TextInputProps & {
  label: string;
  error?: string | null;
};

export function TextField({ label, error, style, onFocus, onBlur, ...inputProps }: Props) {
  const [focused, setFocused] = useState(false);
  const filled = !!inputProps.value && inputProps.value.trim().length > 0;
  // error > focused (cyan, "you're here") > filled (green, "done") > default.
  // Explicit style, NOT a className swap: NativeWind appends the new border
  // class without removing the old one on TextInput, so stale colors win.
  const borderColor = error
    ? colors.danger
    : focused
      ? colors.accentCyan
      : filled
        ? colors.primary
        : colors.border;
  return (
    <View className="gap-xs">
      <Text className="text-sm font-medium text-textMuted">{label}</Text>
      <TextInput
        placeholderTextColor={colors.textFaint}
        className="h-12 rounded-lg border bg-surface px-md text-text"
        // fontSize via style, NOT the `text-base` class: NativeWind's text-base also
        // sets lineHeight (24), and a lineHeight taller than the font on a single-line
        // TextInput makes iOS render the text low (looks bottom-aligned / top padding).
        // No lineHeight → iOS vertically centers within the fixed h-12. paddingVertical:0
        // + textAlignVertical:'center' keep it centered on web/Android too.
        // outlineStyle must be concrete — 'auto' makes Chrome draw its own focus ring.
        style={[
          {
            borderColor,
            fontSize: typeScale.base[0],
            paddingVertical: 0,
            textAlignVertical: 'center',
            outlineStyle: 'solid',
            outlineWidth: 0,
          },
          style,
        ]}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...inputProps}
      />
      {error ? <Text className="text-sm text-danger">{error}</Text> : null}
    </View>
  );
}
