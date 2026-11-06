import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Upload } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { completeOnboarding, uploadAvatar } from '@/features/auth/api';
import { PRESET_AVATARS } from '@/features/auth/preset-avatars';
import { useSession } from '@/features/auth/session-context';
import { colors } from '@/theme';

export default function OnboardingScreen() {
  const { refreshProfile, signOut } = useSession();
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickImage = async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return;
    setUploading(true);
    try {
      setAvatarUrl(await uploadAvatar(asset.base64, asset.mimeType ?? 'image/jpeg'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setError(null);
    if (displayName.trim().length < 2) {
      setError('Pick a display name (at least 2 characters).');
      return;
    }
    if (!avatarUrl) {
      setError('Pick or upload an avatar.');
      return;
    }
    setSaving(true);
    try {
      await completeOnboarding(displayName, avatarUrl);
      await refreshProfile(); // flips onboarded_at → route guards switch to the app
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.');
      setSaving(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="gap-xl px-xl py-3xl">
      <View className="gap-xs">
        <Text className="text-2xl font-bold text-text">Set up your profile</Text>
        <Text className="text-sm text-textMuted">How the league will see you all season.</Text>
      </View>

      <TextField
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        autoCorrect={false}
        maxLength={20}
        placeholder="e.g. El Capitán"
      />

      <View className="gap-sm">
        <Text className="text-sm font-medium text-textMuted">Avatar</Text>
        <View className="flex-row flex-wrap gap-md">
          {PRESET_AVATARS.map((url) => (
            <Pressable key={url} onPress={() => setAvatarUrl(url)}>
              <Image
                source={url}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  borderWidth: 2,
                  borderColor: avatarUrl === url ? colors.primary : colors.border,
                }}
              />
            </Pressable>
          ))}
          <Pressable
            onPress={pickImage}
            disabled={uploading}
            className="h-[56px] w-[56px] items-center justify-center rounded-full border-2 border-dashed border-border bg-surface"
          >
            {avatarUrl && !PRESET_AVATARS.includes(avatarUrl) ? (
              <Image
                source={avatarUrl}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  borderWidth: 2,
                  borderColor: colors.primary,
                }}
              />
            ) : (
              <Upload size={20} color={uploading ? colors.textFaint : colors.textMuted} />
            )}
          </Pressable>
        </View>
        <Text className="text-xs text-textFaint">Tap a preset or upload your own.</Text>
      </View>

      {error ? <Text className="text-sm text-danger">{error}</Text> : null}

      <Button title="Join the league" onPress={save} loading={saving || uploading} />
      <Button title="Sign out" onPress={signOut} variant="ghost" />
    </ScrollView>
  );
}
