/**
 * Published scores, browsable without an account.
 *
 * One of the two screens the web app renders **signed out** — somebody deciding
 * whether to sign up has to be able to see what other people made. It needs a
 * server but not a session, which is why it checks those two separately.
 *
 * **Tiles in a grid, as My Projects draws its projects** — the same card and
 * the same arithmetic for how many across (`tileGrid`, over the width this is
 * given). What differs is what each is: a shared score has a person behind it,
 * so their picture and nickname head the tile, and it is somebody else's, so
 * it has no Duplicate and no Delete.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, SearchInput, Text } from '@sudobility/components-rn';
import { Spinner } from '@/components/controls/Spinner';
import { PressableCard } from '@/components/controls/PressableCard';
import {
  communityItemTitle,
  communityListState,
} from '@sudobility/music_types';
import { monogramFor } from '@sudobility/music_lib';
import { TILE_GAP, tileGrid } from '@/features/projects/ProjectTiles';
import { getMusicClient } from '@/config/server';
import type { CommunityItem } from '@sudobility/music_types';
import { ScreenScaffold, ServerUnavailable } from './ScreenScaffold';
import { TitledScreen } from '@/components/layout/SplitViewContainer';
import { trackScreenView } from '@/analytics';

/** How wide the publisher's picture is drawn, in points. */
const AVATAR_SIZE = 32;

/**
 * The publisher's picture, in a circle — or their initial, when they have none.
 *
 * Hidden from a screen reader: the name is printed beside it, and the tile's
 * own label already says who shared the score.
 */
function PublisherAvatar({
  name,
  pictureUrl,
}: {
  name: string;
  pictureUrl: string | null;
}) {
  /*
    A picture that will not load falls back to the initial too. The name of a
    picture is replaced whenever its owner changes it, so a list fetched a
    moment before can point at one that is gone.
  */
  const [broken, setBroken] = useState(false);
  const circle = {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  };
  if (pictureUrl && !broken) {
    return (
      <Image
        testID="publisher-picture"
        source={{ uri: pictureUrl }}
        accessibilityElementsHidden
        importantForAccessibility="no"
        onError={() => setBroken(true)}
        style={circle}
      />
    );
  }
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="border-border bg-muted items-center justify-center border"
      style={circle}
    >
      <Text className="text-muted-foreground text-sm font-medium">
        {monogramFor(name)}
      </Text>
    </View>
  );
}

/**
 * The app's navigator, as a prop from the screen's own navigator rather
 * than from `useNavigation()`, as Docs and Settings take it. `TitledScreen`
 * draws its bar with a navigator of its own, and inside it the hook answers
 * that one — which has no `Published` to go to, so a tap on a shared score
 * was refused with "NAVIGATE ... was not handled by any navigator".
 */
export type CommunityScreenProps = {
  navigation: CommunityNavigation;
};

type CommunityNavigation = {
  navigate: {
    (route: 'Resources'): void;
    (route: 'Published', params: { publicId: string }): void;
  };
};

export function CommunityScreen({ navigation }: CommunityScreenProps) {
  useEffect(() => {
    trackScreenView('CommunityScreen');
  }, []);

  const { t } = useTranslation();
  return (
    <TitledScreen title={t('nav.community')}>
      {/*
        No `SideClearance` wrapper: `ScreenScaffold` inside `CommunityList`
        already clears the side safe areas (as Resources does). Wrapping it in
        one too cleared the notch twice — on the iPhone Duo's folded cover the
        84pt right inset came off the content once here and once in the
        scaffold, leaving the tiles in a 266pt column with a dead 84pt gap
        beside them.
      */}
      <CommunityList navigation={navigation} />
    </TitledScreen>
  );
}

function CommunityList({ navigation }: { navigation: CommunityNavigation }) {
  const { t } = useTranslation();
  const client = getMusicClient();
  const [items, setItems] = useState<CommunityItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  // The width this is given, never the window's. One column until measured.
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);
  // Measured inside `ScreenScaffold`, which caps the page's width and pads
  // it: `tileGrid` allows for a padding the scaffold has already applied, so
  // it is handed that much more — Resources' arithmetic.
  const { columns, tileWidth } = tileGrid(width + 2 * TILE_GAP);

  /*
    Which state the list is in, and the rows it shows, are music_types'
    `communityListState` — the web page's own call. Filtered on the client,
    over the list already fetched, which is honest at this size.
  */
  const list = useMemo(
    () => communityListState(items, query, failed),
    [items, query, failed],
  );

  const load = useCallback(async () => {
    if (!client) return;
    setFailed(false);
    try {
      // No token: `music_api` mounts the public routes outside its auth
      // middleware precisely so this screen works signed out.
      setItems(await client.listCommunity());
    } catch {
      // A message about *this list*, not a raw network string: "fetch failed"
      // tells a reader nothing they can act on.
      setFailed(true);
      setItems([]);
    }
  }, [client]);

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
  /*
    One scroller, mounted with the screen and never replaced: the spinner, the
    empty states and the tiles are all drawn inside it, and how many tiles a
    row holds is each tile's width rather than a list re-keyed per column
    count. React Native Windows did not paint this screen when its scroller
    was swapped — the spinner's screen for the list, then the list for one
    keyed to the measured columns — and left it blank, tiles laid out beneath,
    until the next input. Resources, built this way, drew at once. The
    community is a short list; nothing is lost by not virtualizing it.
  */
  return (
    <ScreenScaffold>
      <View className="gap-2 pb-2" onLayout={onLayout} testID="community-tiles">
        <Text className="text-muted-foreground text-base">
          {t('community.intro')}
        </Text>
        <SearchInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('community.searchPlaceholder')}
          accessibilityLabel={t('community.searchLabel')}
        />
      </View>
      {list.kind === 'loading' ? (
        <View className="items-center py-8">
          <Spinner />
        </View>
      ) : list.visible.length === 0 ? (
        <View className="items-center gap-3 py-8">
          {/*
            Three different empty states, because they mean different things:
            a failed load, a community with nothing in it, and a search that
            matched nothing. Collapsing them would tell a reader who mistyped
            that nobody has published anything.
          */}
          <Text className="text-muted-foreground text-center">
            {list.kind === 'failed'
              ? t('community.loadFailed')
              : list.kind === 'noMatch'
                ? t('community.noMatch', { query })
                : t('community.empty')}
          </Text>
          {list.kind === 'empty' ? (
            <Button
              variant="outline"
              onPress={() => navigation.navigate('Resources')}
            >
              {t('community.browseResources')}
            </Button>
          ) : null}
        </View>
      ) : (
        <View className="flex-row flex-wrap" style={{ gap: TILE_GAP }}>
          {list.visible.map(item => (
            <CommunityTile
              key={item.publicId}
              item={item}
              width={columns > 1 ? tileWidth : undefined}
              avatarUrl={
                item.publisherAvatarId
                  ? client.avatarUrl(item.publisherAvatarId)
                  : null
              }
              onOpen={() =>
                navigation.navigate('Published', { publicId: item.publicId })
              }
            />
          ))}
        </View>
      )}
    </ScreenScaffold>
  );
}

function CommunityTile({
  item,
  width,
  avatarUrl,
  onOpen,
}: {
  item: CommunityItem;
  /** Undefined for one column, which fills the row. */
  width: number | undefined;
  avatarUrl: string | null;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  // `communityItemTitle`, not `publicName || name`: a public title of spaces
  // is truthy and printed an empty tile.
  const title = communityItemTitle(item);
  return (
    <View
      testID="community-tile"
      style={width === undefined ? { width: '100%' } : { width }}
    >
      <PressableCard
        // "Title, by Ada": a name under a picture reads as who shared it, but
        // read aloud after a title it could be the composer, which is a
        // different person.
        label={
          item.publisherName
            ? `${title}, ${t('community.sharedBy', {
                name: item.publisherName,
              })}`
            : title
        }
        onPress={onOpen}
      >
        <View className="flex-row items-center gap-2 pb-2">
          <PublisherAvatar name={item.publisherName} pictureUrl={avatarUrl} />
          <Text
            className="text-muted-foreground flex-1 text-sm"
            numberOfLines={1}
          >
            {item.publisherName}
          </Text>
        </View>
        <Text className="text-foreground font-medium" numberOfLines={2}>
          {title}
        </Text>
        <Text className="text-muted-foreground text-sm">
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </PressableCard>
    </View>
  );
}
