import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { requestOtp, verifyOtp } from '@/features/auth/api';

export default function VerifyScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);

  const submit = async () => {
    if (!email) {
      router.replace('/');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await verifyOtp(email, code);
      // No navigation here: the session lands via onAuthStateChange and the
      // root layout's protected groups switch to onboarding / app.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid code.');
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (!email) return;
    setResent(false);
    try {
      await requestOtp(email);
      setResent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resend.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 justify-center bg-bg px-xl"
    >
      <View className="gap-lg">
        <View className="gap-xs">
          <Text className="text-2xl font-bold text-text">Check your email</Text>
          <Text className="text-sm text-textMuted">
            We sent a 6-digit code to {email ?? 'your email'}.
          </Text>
        </View>
        <TextField
          label="Code"
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          placeholder="123456"
          error={error}
          onSubmitEditing={submit}
          maxLength={6}
        />
        <Button
          title="Verify"
          onPress={submit}
          loading={submitting}
          disabled={code.length !== 6}
        />
        <Button title={resent ? 'Code re-sent' : 'Resend code'} onPress={resend} variant="ghost" />
        <Button title="Use a different email" onPress={() => router.replace('/')} variant="ghost" />
      </View>
    </KeyboardAvoidingView>
  );
}
