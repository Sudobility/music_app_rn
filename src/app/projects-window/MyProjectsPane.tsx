/**
 * The desktop Projects window's My Projects pane — what the sidebar's
 * Connect item turns into once signed in (`ProjectsSidebar.tsx`).
 *
 * A trimmed `DashboardScreen`'s `ProjectList`: the same fetch
 * (`useProjects`) and the same grid of tiles (`ProjectTiles`: name, updated
 * date, which job is writing it when one is, Duplicate and Delete), without
 * that screen's own New Project button and
 * Import menu — this window's sidebar is where both of those live now, and
 * offering them a second time here would be the same entry point twice.
 */
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@sudobility/components-rn';
import { Spinner } from '@sudobility/music_ui_rn';
import { useProjects } from '@sudobility/music_client';
import { useServerContext } from '@/config/useServerContext';
import { ProjectTiles } from '@/features/projects/ProjectTiles';
import { ServerUnavailable } from '@/screens/ScreenScaffold';
import { useDetailScroll } from '@/components/layout/detail-safe-area';

export type MyProjectsPaneProps = {
  /** A ready project was chosen. */
  onOpen: (id: string) => void;
};

export function MyProjectsPane({ onOpen }: MyProjectsPaneProps) {
  const context = useServerContext();
  // The unavailable message clears the safe area through the one rule, the
  // same as the tiles would; the grid itself brings its own (`ProjectTiles`).
  const detail = useDetailScroll();

  if (!context) {
    return (
      <ScrollView {...detail}>
        <ServerUnavailable />
      </ScrollView>
    );
  }

  return <ProjectListing context={context} onOpen={onOpen} />;
}

function ProjectListing({
  context,
  onOpen,
}: {
  context: NonNullable<ReturnType<typeof useServerContext>>;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isFetching, error, refetch } = useProjects(context);

  if (isLoading) {
    return (
      <View className="items-center py-8">
        <Spinner />
      </View>
    );
  }
  if (error) {
    return (
      <View className="items-center gap-2 py-8">
        <Text className="text-destructive">{t('errors.loadProjects')}</Text>
        <Button
          variant="link"
          textClassName="text-base"
          // The retry is a wait like any other: it spins until the list
          // answers, and cannot be pressed into a second request meanwhile.
          loading={isFetching}
          onPress={() => void refetch()}
        >
          {t('library.retry')}
        </Button>
      </View>
    );
  }

  return (
    <ProjectTiles projects={data ?? []} context={context} onOpen={onOpen} />
  );
}
