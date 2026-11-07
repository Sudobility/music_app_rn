/**
 * The way back out of a pushed screen — macOS, where nothing else offers one.
 *
 * Every screen but the editor is pushed onto a native stack with
 * `headerShown: true`, and on this react-native-macos / react-native-screens
 * build that header is **not drawn at all** — measured on the accessibility
 * tree: Settings and Docs expose their content and no back control of any kind,
 * to the pointer or to VoiceOver. There is no swipe-back on a Mac either, so a
 * pushed screen is a one-way trip: the app has to be relaunched to get out of
 * it.
 *
 * That was invisible while nothing navigated anywhere — which is exactly the
 * state Settings was in. Making it reachable makes this reachable too, so the
 * body of each screen draws the control the header would have.
 *
 * `canGoBack` rather than always: the editor is the stack's first route and
 * renders no scaffold, but a screen shown as a root would otherwise offer a
 * back that does nothing.
 */
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon } from 'react-native-heroicons/outline';
import { MIN_TOUCH_TARGET, Text, touchSlop } from '@sudobility/components-rn';
import { useNotationInk } from '@sudobility/music_ui_rn';
import { useEmbedded } from './EmbeddedScreen';

/** Matches the title bar's glyph size. */
const ICON_SIZE = 18;
const SLOP = touchSlop(MIN_TOUCH_TARGET, MIN_TOUCH_TARGET);

export function ScreenBackBar() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  // Literal, because an svg glyph never resolves a NativeWind class — the same
  // reason every notation glyph is handed one.
  const ink = useNotationInk();
  // A pane of another screen leaves the way back to the screen that holds it.
  const embedded = useEmbedded();
  if (embedded || !navigation.canGoBack()) return null;

  return (
    <View className="flex-row">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('nav.back')}
        onPress={() => navigation.goBack()}
        // macOS has no synthesized-touch fallback for an assistive press, so a
        // VoiceOver press would otherwise do nothing.
        onAccessibilityTap={() => navigation.goBack()}
        hitSlop={SLOP}
        className="flex-row items-center gap-1 self-start py-2 pr-3"
      >
        <ChevronLeftIcon size={ICON_SIZE} color={ink.primary} />
        <Text className="text-primary text-base">{t('nav.back')}</Text>
      </Pressable>
    </View>
  );
}
