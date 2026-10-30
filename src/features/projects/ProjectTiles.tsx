/**
 * The reader's projects, as tiles in a grid — the web's Projects page, here.
 *
 * They were rows. A row is as wide as the pane, so a list of names and dates
 * was mostly empty, and a tablet showed five projects where it has room for
 * fifteen. A tile is the width a name and a date need.
 *
 * **How many across comes from the width this is given, never the window's.**
 * The pane is measured (`onLayout`), since it shares the window with a list
 * on a tablet and is the whole of it on a phone, and the window's width says
 * which of those it is only by accident. Until it has been measured there is
 * one column, which is what a phone has anyway.
 *
 * **Duplicate and Delete are on the tile**, as on the web: Duplicate copies on
 * the server and the copy appears in the grid; Delete asks first, because it
 * cannot be undone, and closes the project here if it was the one open — an
 * editor left showing a project that no longer exists saves into nothing.
 */
import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@sudobility/components-rn';
import {
  useDeleteProject,
  useDuplicateProject,
} from '@sudobility/music_client';
import type { MusicHookContext } from '@sudobility/music_client';
import type { ProjectSummary } from '@sudobility/music_types';
import { ConfirmSheet } from '@/components/controls/ConfirmSheet';
import { usePendingAction } from '@/components/controls/usePendingAction';
import { PressableCard } from '@/components/controls/PressableCard';
import {
  useContentPadding,
  useSidesHandled,
} from '@/components/layout/EmbeddedScreen';
import { useSafeAreaInsets } from '@/platform/SafeArea';
import { useSafeEdges } from '@/platform/safe-edges';
import { useDocumentList } from '@/documents/DocumentsContext';

/** The narrowest a tile is drawn: a name and a date on a line each. */
export const TILE_MIN_WIDTH = 240;
/** Between tiles, and around the grid. */
export const TILE_GAP = 12;

/**
 * How many tiles fit across `width`, and how wide each is.
 *
 * Every tile the same width, the last row included: a lone tile stretched
 * across the grid reads as a different kind of thing from the ones above it.
 */
export function tileGrid(
  width: number,
  /** Around the grid, where it is not the gap between tiles. */
  padding: number = TILE_GAP,
): {
  columns: number;
  tileWidth: number;
} {
  const inner = Math.max(0, width - 2 * padding);
  const columns = Math.max(
    1,
    Math.floor((inner + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP)),
  );
  const tileWidth = Math.max(
    0,
    Math.floor((inner - (columns - 1) * TILE_GAP) / columns),
  );
  return { columns, tileWidth };
}

export type ProjectTilesProps = {
  projects: readonly ProjectSummary[];
  context: MusicHookContext;
  /** A project was chosen. */
  onOpen: (id: string) => void;
  /** Above the grid, scrolling with it: the screen's own buttons. */
  header?: ReactElement;
};

/** Around the grid as a screen of its own; as a detail pane it is the pane's. */
const SCREEN_PADDING = TILE_GAP;

export function ProjectTiles({
  projects,
  context,
  onOpen,
  header,
}: ProjectTilesProps) {
  const { t } = useTranslation();
  const list = useDocumentList();
  const duplicate = useDuplicateProject(context);
  const remove = useDeleteProject(context);
  const [width, setWidth] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(
    null,
  );
  const [problem, setProblem] = useState<string | null>(null);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    // Whole points: a width that moves by a fraction must not re-lay the grid.
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);
  const padding = useContentPadding(SCREEN_PADDING);
  // The grid is not scrolled sideways, so it clears the side safe areas it
  // meets — unless the split view already has (`sidesHandled`). The column
  // maths uses the width left after those insets.
  const insets = useSafeAreaInsets();
  const edges = useSafeEdges();
  const sidesHandled = useSidesHandled();
  const sideLeft = !sidesHandled && edges.left ? insets.left : 0;
  const sideRight = !sidesHandled && edges.right ? insets.right : 0;
  const { columns, tileWidth } = tileGrid(
    width - sideLeft - sideRight,
    padding,
  );

  // Which tile's Duplicate / Delete is waiting on the server: that one spins,
  // and no tile starts a second one meanwhile.
  const duplicating = usePendingAction<string>();
  const deleting = usePendingAction<string>();

  const duplicateProject = (project: ProjectSummary) =>
    duplicating.run(async () => {
      setProblem(null);
      try {
        await duplicate.mutateAsync({ id: project.id });
      } catch {
        setProblem(t('errors.duplicateProject'));
      }
    }, project.id);

  // The confirm sheet stays up, its Delete spinning, until the server has
  // answered: closing it first left nothing on screen saying anything was
  // happening.
  const deleteProject = (project: ProjectSummary) =>
    deleting.run(async () => {
      setProblem(null);
      try {
        await remove.mutateAsync(project.id);
        const open = list.findOpen({ kind: 'project', projectId: project.id });
        if (open) list.close(open.id);
      } catch {
        setProblem(t('errors.deleteProject'));
      } finally {
        setPendingDelete(null);
      }
    }, project.id);

  return (
    <View className="flex-1" onLayout={onLayout} testID="project-tiles">
      <FlatList<ProjectSummary>
        // A FlatList cannot change how many columns it has; one that can is
        // a different list.
        key={columns}
        data={projects}
        extraData={`${duplicating.pendingKey}:${deleting.pendingKey}`}
        numColumns={columns}
        keyExtractor={(project: ProjectSummary) => project.id}
        accessibilityLabel={t('dashboard.myProjects')}
        contentContainerStyle={{
          padding,
          paddingLeft: padding + sideLeft,
          paddingRight: padding + sideRight,
          gap: TILE_GAP,
        }}
        {...(columns > 1 ? { columnWrapperStyle: { gap: TILE_GAP } } : {})}
        ListHeaderComponent={
          <View className="gap-3">
            {header}
            {problem ? (
              <View accessibilityRole="alert">
                <Text className="text-destructive">{problem}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text className="text-muted-foreground py-8 text-center">
            {t('dashboard.empty')}
          </Text>
        }
        renderItem={({ item }: { item: ProjectSummary }) => {
          // A busy project opens like any other: generated or transcribed,
          // its notes stream into the editor as they are written, and
          // opening it is how you watch. The label says which is happening.
          const statusLabel =
            item.status === 'transcribing'
              ? t('dashboard.transcribing')
              : item.status === 'generating'
                ? t('dashboard.generating')
                : null;
          return (
            <View
              testID="project-tile"
              style={columns > 1 ? { width: tileWidth } : undefined}
            >
              <PressableCard
                label={item.name}
                onPress={() => onOpen(item.id)}
                footer={
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={duplicating.pending}
                      loading={duplicating.pendingKey === item.id}
                      accessibilityLabel={t('dashboard.duplicateProject', {
                        name: item.name,
                      })}
                      onPress={() => void duplicateProject(item)}
                    >
                      {t('dashboard.duplicate')}
                    </Button>
                    {/* Ghost with the destructive token on its words, not
                        `variant="destructive-outline"`: the library looks that
                        name up as `variants.button['destructive-outline']`,
                        which does not exist, and falls back to the primary
                        fill — a red block. The web tile works round the same
                        gap. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      textClassName="text-destructive"
                      disabled={deleting.pending}
                      loading={deleting.pendingKey === item.id}
                      accessibilityLabel={t('dashboard.deleteProject', {
                        name: item.name,
                      })}
                      onPress={() => setPendingDelete(item)}
                    >
                      {t('common.delete')}
                    </Button>
                  </>
                }
              >
                <Text className="text-foreground font-medium" numberOfLines={2}>
                  {item.name}
                </Text>
                <Text className="text-muted-foreground text-sm">
                  {t('dashboard.updated', {
                    date: new Date(item.updatedAt).toLocaleDateString(),
                  })}
                </Text>
                {statusLabel ? (
                  <Text className="text-info mt-1 text-sm">{statusLabel}</Text>
                ) : null}
              </PressableCard>
            </View>
          );
        }}
      />
      <ConfirmSheet
        open={pendingDelete !== null}
        title={t('dashboard.deleteTitle')}
        message={t('dashboard.deleteMessage', {
          name: pendingDelete?.name ?? '',
        })}
        confirmLabel={t('common.delete')}
        destructive
        busy={deleting.pending}
        onConfirm={() => {
          if (pendingDelete) void deleteProject(pendingDelete);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </View>
  );
}
