/**
 * One published score, read-only.
 *
 * The other screen the web app renders signed out. It draws with the same
 * `ScrollingScore` the editor uses — read-only is the absence of an editing
 * surface, not a second renderer.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

import { View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Text } from '@sudobility/components-rn';
import { Spinner } from '@/components/controls/Spinner';
import {
  communityItemTitle,
  getMusicPosition,
  getMusicPositionSource,
  publishedSnapshotUrl,
} from '@sudobility/music_types';
import type { FlagReason, PublishedSnapshot } from '@sudobility/music_types';
import { getMusicClient } from '@/config/server';
import { ScrollingScore } from '@/features/score/ScrollingScore';
import { TransportBar } from '@/features/transport/TransportBar';
import { SpatialSection } from '@/features/spatial/SpatialSection';
import { SafeAreaView } from '@/platform/SafeArea';
import { useSafeEdgeList } from '@/platform/safe-edges';
import type { RootStackParamList } from '@/app/Navigation';
import { Share } from 'react-native';
import { ShareIcon, FlagIcon } from 'react-native-heroicons/solid';
import { IconButton } from '@/components/layout/IconButton';
import { useNotationInk } from '@/components/icons/notation-ink';
import { useAuth, readIdToken } from '@/auth/AuthContext';
import { SignInModal } from '@/features/account/SignInModal';
import { FlagSnapshotSheet } from '@/features/community/FlagSnapshotSheet';
import { usePendingAction } from '@/components/controls/usePendingAction';
import { createDocumentStore } from '@sudobility/music_lib';
import { usePlayerBinding } from '@/features/transport/usePlayerBinding';
import { appToasts } from '@/features/toasts/Toasts';
import { CONSTANTS } from '@/config/constants';
import { ScreenScaffold, ServerUnavailable } from './ScreenScaffold';
import { trackScreenView } from '@/analytics';

const SIDE_EDGES = ['left', 'right'] as const;
const BOTTOM_EDGES = ['left', 'right', 'bottom'] as const;

export function PublishedScreen() {
  useEffect(() => {
    trackScreenView('PublishedScreen');
  }, []);

  const route = useRoute<RouteProp<RootStackParamList, 'Published'>>();
  const client = getMusicClient();
  const [snapshot, setSnapshot] = useState<PublishedSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setSnapshot(await client.getPublishedSnapshot(route.params.publicId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client, route.params.publicId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!client) {
    return (
      <ScreenScaffold>
        <ServerUnavailable />
      </ScreenScaffold>
    );
  }
  if (error) {
    return (
      <ScreenScaffold>
        <Text className="text-destructive">{error}</Text>
      </ScreenScaffold>
    );
  }
  if (!snapshot) {
    return (
      <ScreenScaffold>
        <View className="items-center py-8">
          <Spinner />
        </View>
      </ScreenScaffold>
    );
  }

  return <PublishedScore snapshot={snapshot} />;
}

/**
 * The score, and the two things a visitor can do with it.
 *
 * **Listening is the whole point of a public page** — "anyone can listen, no
 * account needed" is what the community screen promises — and this screen
 * showed the notation with no way to hear it. Its own component because the
 * player must not be bound before the snapshot has arrived: a hook cannot be
 * skipped, and loading a null score into the player is not a state worth
 * modelling.
 *
 * **The page has a store of its own**, an unsaved document over the snapshot's
 * score, because `bindPlayer` binds a store: it is where the transport state and
 * the load progress are mirrored, and where a failed play is reported — to the
 * app's toast queue, like every other store here. The web's published page had
 * the opposite bug, binding the app's singleton store and so playing whatever
 * the editor last had open. Nothing saves it: an unsaved origin has nowhere to
 * write, and nothing on this page edits.
 *
 * Sharing is the other half: a page whose whole purpose is being passed on
 * should offer the system share sheet rather than making somebody copy a URL
 * out of a browser they are not in.
 */
export function PublishedScore({ snapshot }: { snapshot: PublishedSnapshot }) {
  const { t, i18n } = useTranslation();
  const ink = useNotationInk();
  const store = useMemo(
    () =>
      createDocumentStore({
        title: communityItemTitle(snapshot),
        score: snapshot.score,
        context: { toasts: appToasts },
      }),
    [snapshot],
  );
  useEffect(() => () => store.getState().dispose(), [store]);
  const transport = usePlayerBinding(store);
  /*
    The playhead is the app's one position, and the editor underneath this
    screen keeps its caret there. Opening a document store does not move it
    (`resetPosition` defaults to false), so this page's Play started wherever
    the editor's caret was and its playback then carried that caret off. So:
    the piece starts at its top, and the editor's caret is put back on the way
    out — the web page's rule. Declared after the binding so its cleanup runs
    after the binding's, whose unbind pauses and reports where it paused.
  */
  useEffect(() => {
    const editorCaret = getMusicPosition().tick;
    getMusicPositionSource().moveTo(0);
    return () => getMusicPositionSource().moveTo(editorCaret);
  }, [store]);
  const sideEdges = useSafeEdgeList(SIDE_EDGES);
  const bottomEdges = useSafeEdgeList(BOTTOM_EDGES);
  const [spatialActive, setSpatialActive] = useState(false);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Flagging requires an account — a report has a reporter. A signed-out reader
  // is sent through sign-in first, then the sheet opens.
  const { user } = useAuth();
  const [flagOpen, setFlagOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const flagging = usePendingAction();
  const onFlag = useCallback(() => {
    if (user) setFlagOpen(true);
    else setSignInOpen(true);
  }, [user]);
  const submitFlag = useCallback(
    (reason: FlagReason, details: string) =>
      void flagging.run(async () => {
        const client = getMusicClient();
        const token = await readIdToken();
        if (!client || !token) {
          appToasts.push({
            id: `flag-${Date.now()}`,
            message: t('flag.failed'),
            severity: 'error',
          });
          return;
        }
        try {
          await client.flagSnapshot(snapshot.publicId, reason, details, token);
          setFlagOpen(false);
          appToasts.push({
            id: `flag-${Date.now()}`,
            message: t('flag.thanks'),
            severity: 'success',
          });
        } catch {
          appToasts.push({
            id: `flag-${Date.now()}`,
            message: t('flag.failed'),
            severity: 'error',
          });
        }
      }),
    [flagging, snapshot.publicId, t],
  );

  const share = useCallback(() => {
    /*
      The web page's own address, `<web>/<lang>/p/<id>` — the route a link
      opens whichever app copied it. It used to be derived from the API's
      host with no language segment, which matched no web route.
    */
    void Share.share({
      title: communityItemTitle(snapshot),
      message: publishedSnapshotUrl(
        CONSTANTS.WEB_URL,
        i18n.language.startsWith('zh') ? 'zh' : 'en',
        snapshot.publicId,
      ),
    });
  }, [snapshot, i18n.language]);
  /*
    The score's name and who shared it are the navigation bar's title, and
    Share is its right-hand control — the bar the screen already has, rather
    than a second row under it saying the same things. `useLayoutEffect`, as
    the editor's header is filled, so the bar is never seen without them.
  */
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View className="max-w-72 items-center">
          <Text className="text-foreground font-medium" numberOfLines={1}>
            {communityItemTitle(snapshot)}
          </Text>
          <Text className="text-muted-foreground text-sm" numberOfLines={1}>
            {t('community.sharedBy', { name: snapshot.publisherName })}
          </Text>
        </View>
      ),
      headerRight: () => (
        <View className="flex-row items-center">
          <IconButton label={t('published.flag')} onPress={onFlag}>
            <FlagIcon size={18} color={ink.foreground} />
          </IconButton>
          <IconButton label={t('published.share')} onPress={share}>
            <ShareIcon size={18} color={ink.foreground} />
          </IconButton>
        </View>
      ),
    });
  }, [navigation, snapshot, share, onFlag, ink.foreground, t]);

  return (
    // The bars run to the screen's edges and their content clears the
    // notch's side (`useSafeEdges`): each row is its own safe-area view
    // with its own background, as the editor's rows are, so a bar's colour
    // reaches the edge while what is on it does not sit under the island.
    <View className="bg-background flex-1">
      {/*
        No editing `onPress`: the score view still allows click-to-seek. The
        gutter is the instrument icons alone, always: a visitor is here to
        listen, and the column of names was a fifth of a phone's width taken
        from the music they came for.
      */}
      <SafeAreaView edges={sideEdges} className="min-h-0 flex-1">
        {spatialActive ? (
          <SpatialSection store={store} />
        ) : (
          <ScrollingScore score={snapshot.score} trackInfo="icon" />
        )}
      </SafeAreaView>
      {/*
        The editor's own transport, whole — position, loop, metronome, speed,
        volume — rather than a lone Play button in the title row, as on the
        web. It plays this page's store through this page's binding, so a
        project open behind this screen is never what is heard. Read-only:
        the tempo is a readout, since nothing here may change the score. No
        keyboard or 3D stage is offered because neither is mounted here.
      */}
      {/*
        The bar clears the bottom as well, where the rule says to (a
        tablet): Android draws the app under its own navigation bar, and on
        a tablet with the three-button bar the transport was beneath it —
        "I don't see the playback bar".
      */}
      <SafeAreaView
        edges={bottomEdges}
        className="border-border bg-card border-t"
      >
        <TransportBar
          score={snapshot.score}
          transport={transport}
          store={store}
          readOnly
          // The 3D stage, as in the editor: listening in 3D is listening,
          // which is what a visitor is here for.
          spatialActive={spatialActive}
          onToggleSpatial={() => setSpatialActive(active => !active)}
        />
      </SafeAreaView>

      <FlagSnapshotSheet
        open={flagOpen}
        onClose={() => setFlagOpen(false)}
        onSubmit={submitFlag}
        submitting={flagging.pending}
      />
      {/* A signed-out reader signs in over this page, then the sheet opens. */}
      <SignInModal
        visible={signInOpen}
        onClose={() => setSignInOpen(false)}
        onSuccess={() => {
          setSignInOpen(false);
          setFlagOpen(true);
        }}
      />
    </View>
  );
}
