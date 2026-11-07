/**
 * The Spatial 3D view, bound to a document — the web app's `SpatialSection`.
 *
 * Its own subscriber, not part of `AppLayout`'s render: `useSoundingTrackIds`
 * updates on every note of every track, and reading it at the layout's top
 * level would re-render the whole editor — inspector, toolbar, every sheet —
 * on every note-on and note-off while playing. Here it touches only the
 * stage.
 *
 * Unplugged mixing is in effect for exactly as long as this is mounted, the
 * way the old Unplugged tab did it: `setUnpluggedActive(true)` on mount,
 * false on unmount, and `bind-player.ts`'s shadow score does the rest.
 *
 * Reflects and invokes only. Every edit is a store action, because the
 * rules those enforce are rules about a score; `music_spatial_rn` never
 * touches the store or the player itself.
 */
import { useEffect } from 'react';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import { SpatialView } from '@sudobility/music_spatial_rn';
import { controlLocked, selectEditLocked } from '@sudobility/music_editing';
import { useNotationInk } from '@sudobility/music_ui_rn';
import type { MusicDocument } from '@/documents/document';
import { useSoundingTrackIds } from './useSoundingTrackIds';

export type SpatialSectionProps = {
  /**
   * The store whose score is staged and whose arrangement is moved. A
   * document's in the editor; a published page's own on that page, which
   * has no document — a visitor listens in 3D to a score nobody here edits.
   */
  store: MusicDocument['store'];
};

export function SpatialSection({ store }: SpatialSectionProps) {
  const { t } = useTranslation();
  const ink = useNotationInk();
  const score = useStore(store, s => s.score);
  const locked = useStore(
    store,
    s => selectEditLocked(s) && controlLocked(s, 'unpluggedArrangement'),
  );
  const soundingTrackIds = useSoundingTrackIds();

  useEffect(() => {
    store.getState().setUnpluggedActive(true);
    return () => store.getState().setUnpluggedActive(false);
  }, [store]);

  if (!score) return null;
  return (
    <SpatialView
      score={score}
      soundingTrackIds={soundingTrackIds}
      locked={locked}
      onMoveListener={patch => store.getState().setUnpluggedListener(patch)}
      onMoveTrack={(trackId, point) =>
        store.getState().setUnpluggedTrackPosition(trackId, point)
      }
      onResetArrangement={() => store.getState().resetUnpluggedArrangement()}
      // The active track follows whatever the listener is facing: the
      // inspector, the keyboard and the notation highlight then all show
      // the part being looked at. Turning away from everything keeps the
      // last one rather than clearing it.
      onFacingTrackChange={trackId => {
        if (trackId) store.getState().setActiveTrack(trackId);
      }}
      mapLabels={{
        stage: t('inspector.unpluggedStage'),
        listener: t('inspector.unpluggedListener'),
        turnHandle: t('inspector.unpluggedTurnHandle'),
        reset: t('inspector.unpluggedReset'),
        wander: t('inspector.unpluggedWander'),
      }}
      color={ink.foreground}
      style={{ flex: 1 }}
    />
  );
}
