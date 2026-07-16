import React, { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  KeyboardAvoidingViewProps,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';

type KeyboardSafeViewProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
  behavior?: KeyboardAvoidingViewProps['behavior'];
};

export function KeyboardSafeView({
  children,
  style,
  keyboardVerticalOffset = 0,
  behavior = Platform.OS === 'ios' ? 'padding' : 'height',
}: KeyboardSafeViewProps) {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={behavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
