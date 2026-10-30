/**
 * The editor's title bar, on the platform's own bar.
 *
 * On iOS and Android the document's name, its save state and every title-bar
 * button are handed to the navigator, which draws them on the navigation bar
 * (iOS) and the top app bar (Android) — where either platform's reader looks
 * for them — instead of a row the app draws beneath the status bar. The
 * controls are `TitleBar`'s own pieces, so what each does, and when it is
 * absent or disabled, is stated once.
 *
 * Under a tab bar the editor is pushed above the tabs, so the bar also
 * carries the way out: the navigator's own back control, and beside it the
 * button that draws the Projects sidebar over the score (`onMaster`). There
 * the bar outlives the document — an editor with nothing open still needs
 * its way back — and what is taken down with the document is only what
 * described it. Without `onMaster` the editor is the stack's first route:
 * there is nothing to go back to, and no bar at all once the document goes.
 */
import { useLayoutEffect } from 'react';
import { Platform, View } from 'react-native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { hasNativeHeader } from '@/app/native-header';
import { useTranslation } from 'react-i18next';
import { Bars3Icon, ChevronLeftIcon } from 'react-native-heroicons/outline';
import { useNotationInk } from '@/components/icons/notation-ink';
import { IconButton } from '@/components/layout/IconButton';
import { useFormFactor } from '@sudobility/components-rn';
import { TitleBarActions, TitleBarTitle } from '@/components/layout/TitleBar';
import type { TitleBarProps } from '@/components/layout/TitleBar';

/** The one thing asked of the navigator, so a test can stand in for it. */
export type EditorHeaderNavigation = {
  setOptions: (options: NativeStackNavigationOptions) => void;
  /** Back to the tabs. Asked for only where the header draws no back of its own. */
  goBack?: () => void;
};

/**
 * Whether the way back has to be drawn here.
 *
 * The native stack keeps its own back control beside a `headerLeft`
 * (`headerBackVisible`). The JS stack a desktop window runs has no such
 * option: a `headerLeft` there *is* the left of the bar, and the back control
 * it replaced goes with it — so the editor would have covered the tabs with
 * no way back to them but the menu.
 */
function drawsOwnBack(): boolean {
  return Platform.OS === 'macos' || Platform.OS === 'windows';
}

/** Matches the title bar's glyph size. */
const ICON_SIZE = 18;

export function useEditorHeader(
  navigation: EditorHeaderNavigation,
  {
    document,
    onSave,
    onExport,
    exporting = false,
    onSettings,
    onDocuments,
    onShortcuts,
    onSnapshots,
    onPrint,
    printing = false,
  }: TitleBarProps,
  /** Draws the Projects sidebar over the editor. Given only under a tab bar. */
  onMaster?: () => void,
): void {
  const { t } = useTranslation();
  const ink = useNotationInk();
  const pushed = onMaster !== undefined;
  // A phone groups the secondary title-bar actions behind an overflow "…";
  // a tablet shows them all. See `TitleBarActions`.
  const phone = useFormFactor() === 'phone';
  useLayoutEffect(() => {
    if (!hasNativeHeader()) return;
    navigation.setOptions({
      headerShown: true,
      // Stated, because a `headerLeft` otherwise takes the back control's
      // place rather than standing beside it.
      headerBackVisible: pushed,
      ...(onMaster
        ? {
            headerLeft: () => (
              <View className="flex-row items-center gap-1 pl-2">
                {drawsOwnBack() && navigation.goBack ? (
                  <IconButton
                    label={t('nav.back')}
                    onPress={() => navigation.goBack?.()}
                  >
                    <ChevronLeftIcon size={ICON_SIZE} color={ink.onPrimary} />
                  </IconButton>
                ) : null}
                <IconButton label={t('nav.projects')} onPress={onMaster}>
                  <Bars3Icon size={ICON_SIZE} color={ink.onPrimary} />
                </IconButton>
              </View>
            ),
          }
        : {}),
      // The title bar's colours: `bg-primary` (red) under inverse ink. The
      // band above it on a pushed screen is painted the same red by the app
      // root (`App.tsx`'s `bg-primary` fill), so the bar reads to the top edge.
      headerStyle: { backgroundColor: ink.primary },
      headerTintColor: ink.onPrimary,
      headerTitle: () => (
        // Bounded, so a long name is cut short rather than run under the
        // buttons.
        <View className="max-w-72 flex-row items-center">
          <TitleBarTitle document={document} />
        </View>
      ),
      headerRight: () => (
        <TitleBarActions
          document={document}
          onSave={onSave}
          onExport={onExport}
          exporting={exporting}
          {...(onSnapshots ? { onSnapshots } : {})}
          {...(onPrint ? { onPrint } : {})}
          printing={printing}
          onSettings={onSettings}
          onDocuments={onDocuments}
          {...(onShortcuts ? { onShortcuts } : {})}
          phone={phone}
        />
      ),
    });
  }, [
    navigation,
    ink,
    t,
    phone,
    pushed,
    onMaster,
    document,
    onSave,
    onExport,
    exporting,
    onSettings,
    onDocuments,
    onShortcuts,
    onSnapshots,
    onPrint,
    printing,
  ]);

  // Its own effect, so the header is taken down when the document leaves the
  // screen and not each time a callback changes.
  useLayoutEffect(() => {
    if (!hasNativeHeader()) return;
    return () =>
      navigation.setOptions(
        pushed
          ? {
              headerTitle: '',
              headerRight: () => null,
              headerLeft: () => null,
            }
          : { headerShown: false },
      );
  }, [navigation, pushed]);
}
