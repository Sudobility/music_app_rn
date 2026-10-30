/**
 * The shell every non-editor screen shares.
 *
 * Scrolling body, consistent padding, the way back out, and one place for the
 * "this needs a server" state — which several screens have and which must read
 * the same way in each, or it looks like a different failure every time.
 */
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Heading, Text } from '@sudobility/components-rn';
import { useSafeAreaInsets } from '@/platform/SafeArea';
import { useSafeEdges } from '@/platform/safe-edges';
import { ScreenBackBar } from '@/components/layout/ScreenBackBar';
import {
  SCREEN_WIDTH_STYLE,
  useContentPadding,
  useEmbedded,
  useSidesHandled,
} from '@/components/layout/EmbeddedScreen';

/**
 * The scaffold's own padding as a screen, in points — `p-4`, stated so a side
 * inset can add to it. As the detail of a split view it is the detail's.
 */
const SCREEN_PADDING = 16;

export function ScreenScaffold({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  // The navigator owns the top inset. Only the content clears side cutouts;
  // the background and bottom still extend to the screen edges.
  const insets = useSafeAreaInsets();
  // Which sides to clear is the one rule's (`useSafeEdges`). A pane shown
  // beside another clears neither (`sidesHandled`): the split view already
  // has, and clearing them again would indent the pane by a notch it is
  // nowhere near. A standalone screen — or a pane drawn full-width in a
  // collapsed split view — meets the screen's own edges and clears them here.
  const edges = useSafeEdges();
  const embedded = useEmbedded();
  const sidesHandled = useSidesHandled();
  const PADDING = useContentPadding(SCREEN_PADDING);
  return (
    <ScrollView
      className="bg-background flex-1"
      /*
        Clears the tab bar, and whatever else the system puts over the
        screen's edges. Under the tabs a screen runs beneath the bar, and the
        navigator only adjusts a scroll view it finds first in line under the
        screen — which one under a header is not, so the last of a long page
        was drawn behind the bar with no way to scroll it out.
      */
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        // A pane is held to the detail's width by the split view it is in.
        ...(embedded ? {} : SCREEN_WIDTH_STYLE),
        gap: PADDING,
        paddingTop: PADDING,
        paddingBottom: PADDING,
        paddingLeft: PADDING + (!sidesHandled && edges.left ? insets.left : 0),
        paddingRight:
          PADDING + (!sidesHandled && edges.right ? insets.right : 0),
      }}
    >
      {/*
        The way back. Nothing on iOS and Android, whose stack draws its own
        header; on macOS that header is not drawn at all, so without this every
        screen the editor pushes is a room with no door.
      */}
      <ScreenBackBar />
      {title ? <Heading className="text-foreground">{title}</Heading> : null}
      {children}
    </ScrollView>
  );
}

/**
 * What a screen shows when this build has no server.
 *
 * Deliberately not an error: a local-only build is a supported state, and the
 * feature is *unavailable*, not broken. The same words everywhere, from the
 * library's own message catalogue.
 */
export function ServerUnavailable() {
  const { t } = useTranslation();
  return (
    <View className="items-center py-8">
      <Text className="text-muted-foreground text-center">
        {t('library.serverUnavailable')}
      </Text>
    </View>
  );
}
