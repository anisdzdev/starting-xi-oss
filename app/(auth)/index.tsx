import { router } from 'expo-router';
import { Shirt } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { isValidInviteCode, requestOtp } from '@/features/auth/api';
import { colors } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setCodeError(null);
    setEmailError(null);
    if (!isValidInviteCode(inviteCode)) {
      setCodeError('Wrong invite code — ask the league admin.');
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      await requestOtp(email);
      router.push({ pathname: '/verify', params: { email: email.trim().toLowerCase() } });
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : 'Could not send the code. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 justify-center bg-bg px-xl"
    >
      <View className="items-center gap-sm pb-2xl">
        <Shirt size={44} color={colors.primary} strokeWidth={1.5} />
        <Text className="text-3xl font-bold text-text">Starting XI</Text>
        <Text className="text-center text-sm text-textMuted">
          Friends-only football fantasy league
        </Text>
      </View>

      <View className="gap-lg">
        <TextField
          label="Invite code"
          value={inviteCode}
          onChangeText={(t) => {
            setInviteCode(t);
            setCodeError(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="From the league admin"
          error={codeError}
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setEmailError(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
          error={emailError}
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        <Button title="Send sign-in code" onPress={submit} loading={submitting} />
      </View>
    </KeyboardAvoidingView>
  );
}
