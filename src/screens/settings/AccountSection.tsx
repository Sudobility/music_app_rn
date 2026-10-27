/**
 * The account: signing in, and once signed in, the name a user publishes
 * under and their picture — the web dashboard's Account page.
 *
 * **Signed out, this is the way in**, and nothing else: the sign-in page
 * (`SignInPage`, the family's `LoginPage`), since this pane is where somebody
 * goes in order to sign in — a row saying "Sign in" would be a step before
 * it, and a modal over a pane that has nothing else to show would be one too.
 *
 * **The nickname is what the publish sheet offers.** A snapshot is shared
 * under a publisher name typed into that sheet, which used to pre-fill
 * whatever was typed last. Saying it once here makes it the answer; the sheet
 * still lets one publication go out under another name.
 */
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@sudobility/components-rn';
import { FieldRow } from '@/components/controls/FieldRow';
import { trackButtonClick } from '@/analytics';
import {
  useDeleteAvatar,
  useProfile,
  useUpdateProfile,
  useUploadAvatar,
} from '@sudobility/music_client';
import type { MusicHookContext } from '@sudobility/music_client';
import { NICKNAME_MAX_LENGTH } from '@sudobility/music_types';
import { useAuth } from '@/auth/AuthContext';
import { getMusicClient } from '@/config/server';
import { useServerContext } from '@/config/useServerContext';
import { useAvatarPicker } from '@/features/account/useAvatarPicker';
import { ScreenScaffold, ServerUnavailable } from '../ScreenScaffold';
import { SignInPage } from '@/features/account/SignInPage';
import { usePendingAction } from '@/components/controls/usePendingAction';

/** The picture's drawn size, in points. */
const PICTURE_SIZE = 72;

export function AccountSection() {
  const { user } = useAuth();
  const context = useServerContext();
  if (!user) {
    // Signed out, the section is the way in: the page, which scrolls itself.
    return <SignInPage />;
  }
  if (!context) {
    return (
      <ScreenScaffold>
        <Identity />
        <ServerUnavailable />
      </ScreenScaffold>
    );
  }
  return (
    <ScreenScaffold>
      <Identity />
      <Profile context={context} />
    </ScreenScaffold>
  );
}

/** Who is signed in, and the way out. */
function Identity() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const signingOut = usePendingAction();
  return (
    <View className="border-border flex-row items-center justify-between gap-3 border-b pb-3">
      <Text className="text-foreground flex-1 text-base" numberOfLines={1}>
        {user?.email ?? user?.uid ?? ''}
      </Text>
      <Button
        size="sm"
        variant="outline"
        loading={signingOut.pending}
        onPress={() =>
          void signingOut.run(async () => {
            trackButtonClick('sign_out');
            await signOut();
          })
        }
      >
        {t('nav.signOut')}
      </Button>
    </View>
  );
}

function Profile({ context }: { context: MusicHookContext }) {
  const { t } = useTranslation();
  const profile = useProfile(context);
  const update = useUpdateProfile(context);
  const upload = useUploadAvatar(context);
  const remove = useDeleteAvatar(context);
  const picker = useAvatarPicker();

  const saved = profile.data?.nickname ?? '';
  const [nickname, setNickname] = useState(saved);
  // What the server holds, once it says: the field starts empty while the
  // profile loads, and must not stay empty when the answer is a name.
  useEffect(() => setNickname(saved), [saved]);
  const [problem, setProblem] = useState<string | null>(null);

  const trimmed = nickname.trim();
  // One profile write at a time; the control that started it spins.
  const writing = usePendingAction<'nickname' | 'picture' | 'remove'>();
  const busy = writing.pending;
  const avatarId = profile.data?.avatarId ?? null;
  const pictureUrl = avatarId
    ? (getMusicClient()?.avatarUrl(avatarId) ?? null)
    : null;
  const failed = () => setProblem(t('account.saveFailed'));

  const saveNickname = () =>
    void writing.run(async () => {
      setProblem(null);
      try {
        await update.mutateAsync({ nickname: trimmed === '' ? null : trimmed });
      } catch {
        failed();
      }
    }, 'nickname');

  // Pending from the chooser opening to the upload's answer: the picture is
  // cropped and reduced on the device before it is sent, and both are a wait.
  const choosePicture = () =>
    writing.run(async () => {
      setProblem(null);
      let file;
      try {
        file = await picker.pick();
      } catch {
        setProblem(t('account.pictureUnsupported'));
        return;
      }
      // Null is the reader closing the chooser.
      if (!file) return;
      try {
        await upload.mutateAsync({ file, filename: file.name });
      } catch {
        failed();
      }
    }, 'picture');

  return (
    <>
      <View className="gap-2">
        <Text className="text-foreground text-base font-medium">
          {t('account.nickname')}
        </Text>
        <FieldRow
          label={t('account.nickname')}
          value={nickname}
          onChangeText={setNickname}
          action={t('common.save')}
          onAction={saveNickname}
          actionDisabled={busy || profile.isLoading || trimmed === saved}
          actionLoading={writing.pendingKey === 'nickname'}
          input={{
            maxLength: NICKNAME_MAX_LENGTH,
            editable: !profile.isLoading,
          }}
        />
        <Text className="text-muted-foreground text-sm">
          {t('account.nicknameHint')}
        </Text>
      </View>

      <View className="gap-3">
        <Text className="text-foreground text-base font-medium">
          {t('account.picture')}
        </Text>
        <View className="flex-row items-center gap-4">
          {pictureUrl ? (
            <Image
              source={{ uri: pictureUrl }}
              accessibilityLabel={t('account.picture')}
              style={{
                width: PICTURE_SIZE,
                height: PICTURE_SIZE,
                borderRadius: PICTURE_SIZE / 2,
              }}
            />
          ) : (
            <View
              className="border-border bg-muted border"
              style={{
                width: PICTURE_SIZE,
                height: PICTURE_SIZE,
                borderRadius: PICTURE_SIZE / 2,
              }}
            />
          )}
          <View className="flex-row flex-wrap gap-2">
            {picker.supported ? (
              <Button
                variant="outline"
                disabled={busy}
                loading={writing.pendingKey === 'picture'}
                onPress={() => void choosePicture()}
                accessibilityLabel={t('account.choosePicture')}
              >
                {t('account.choosePicture')}
              </Button>
            ) : null}
            {avatarId ? (
              <Button
                variant="outline"
                disabled={busy}
                loading={writing.pendingKey === 'remove'}
                onPress={() =>
                  void writing.run(async () => {
                    setProblem(null);
                    try {
                      await remove.mutateAsync(undefined);
                    } catch {
                      failed();
                    }
                  }, 'remove')
                }
                accessibilityLabel={t('account.removePicture')}
              >
                {t('account.removePicture')}
              </Button>
            ) : null}
          </View>
        </View>
        <Text className="text-muted-foreground text-sm">
          {t('account.pictureHint')}
        </Text>
      </View>

      {problem ? (
        <Text className="text-destructive text-base">{problem}</Text>
      ) : null}
    </>
  );
}
