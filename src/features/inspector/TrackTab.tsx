/**
 * The active track's properties — the web inspector's Track tab.
 *
 * Reflects and invokes only. The rules the actions enforce (carrying notes into
 * a new instrument's compass, refusing to delete the last track, resolving a
 * drum kit from a catalogue value, trimming a name and refusing a blank one,
 * snapping a mix value onto the mixer's step) are rules about a score, which is
 * why they live in `music_editing` — and the track slice picks each edit's undo
 * label itself from `commandLabel`, so this tab passes none. It used to pass
 * its own words (`inspector.renameTrack`, `inspector.mixChange`…), which is how
 * the same edit came to read differently in the undo history depending on
 * which app made it.
 *
 * The name is a **draft committed on blur** — dispatching per keystroke makes
 * every letter its own undo entry — and it is re-seeded when the track changes,
 * so switching tracks does not carry a half-typed name across. When
 * `renameTrack` declines (blank, or unchanged) the field goes back to the name
 * the track has, as the web's does.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  Select,
  SheetSelector,
  Switch,
  Text,
} from '@sudobility/components-rn';
import { PanSlider, VolumeSlider } from '@sudobility/music_ui_rn';
import {
  controlLocked,
  selectEditLocked,
  selectSelectedTrack,
} from '@sudobility/music_editing';
import {
  CLEF_OPTIONS,
  clampPan,
  clampVolume,
  instrumentPickerFor,
  isPercussionTrack,
  midiToPitch,
  pitchToString,
} from '@sudobility/music_types';
import type { Clef } from '@sudobility/music_types';
import { ConfirmSheet } from '@sudobility/music_ui_rn';
import { InstrumentIcon } from '@sudobility/music_ui_rn';
import { useNotationInk } from '@sudobility/music_ui_rn';
import { Field, EmptyTab } from './Field';
import { ReplaceButton } from './ReplaceButton';
import { VisibleTracksField } from './VisibleTracksField';
import type { ReplaceScope } from '@sudobility/music_types';
import type { MusicDocument } from '@/documents/document';
import type { TrackMixPatch } from '@sudobility/music_types';
import { outOfRangeNoteIds } from '@sudobility/music_types';

export function TrackTab({
  document,
  onReplace,
}: {
  document: MusicDocument;
  onReplace?: (scope: ReplaceScope) => void;
}) {
  const { t } = useTranslation();
  const ink = useNotationInk();
  const store = document.store;
  const track = useStore(store, selectSelectedTrack);
  const score = useStore(store, s => s.score);
  /*
    Content controls lock while the transport plays; mixing does not. The
    exemption is music_editing's `MIX_ONLY_CONTROLS`, asked through
    `controlLocked` by name, so the list of what stays live is one decision
    written down rather than a missing `disabled` on four controls.
  */
  const locked = useStore(store, selectEditLocked);
  const mixLocked = useStore(
    store,
    s =>
      controlLocked(s, 'trackVolume') ||
      controlLocked(s, 'trackPan') ||
      controlLocked(s, 'trackMute') ||
      controlLocked(s, 'trackSolo'),
  );
  /*
    Subscribed, not read once with `getState()`: a read during render goes
    stale the moment a track is added or removed elsewhere — adding a second
    part left Delete Track disabled until something else re-rendered the tab.
  */
  const canDelete = useStore(store, s => s.canDeleteTrack());
  const [draftName, setDraftName] = useState(track?.name ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setDraftName(track?.name ?? ''), [track?.id, track?.name]);

  /*
    Volume and pan are drawn from a local draft and committed on release.

    A mix change per frame is a store write per frame, and the fill would
    otherwise wait for the value to come back through the store — so it lagged
    the finger. The web inspector's `CommitSlider` draws from a draft for
    exactly this reason. The draft is clamped with music_types' `clampVolume` /
    `clampPan`; `setTrackMix` snaps the committed value onto `MIX_STEP` itself,
    so a drag's float noise is never stored.
  */
  const [volumeDraft, setVolumeDraft] = useState(track?.volume ?? 1);
  const [panDraft, setPanDraft] = useState(track?.pan ?? 0);
  useEffect(
    () => setVolumeDraft(track?.volume ?? 1),
    [track?.id, track?.volume],
  );
  useEffect(() => setPanDraft(track?.pan ?? 0), [track?.id, track?.pan]);

  const mix = useCallback(
    (patch: TrackMixPatch) => {
      if (!track) return;
      // Mute/solo exclusivity is normalized by the shared score command. Keep
      // this host as a reflector: both native and web must go through the same
      // business rule rather than reimplementing it in their controls.
      store.getState().setTrackMix(track.id, patch);
    },
    [store, track],
  );

  /**
   * Changing the instrument, and the one refusal that has words.
   *
   * `setTrackInstrument` carries the notes into the new instrument's compass by
   * whole octaves, and reports `outOfRange` rather than half-applying when the
   * part is wider than the instrument can play. The result was once discarded
   * here, so a refused change looked exactly like one that happened; then the
   * sentence went under the picker, because this app had no toasts. It has
   * them now (`features/toasts`), and a refusal is an error toast on the web,
   * so it goes through the store's `pushToast` — the same queue every other
   * editing refusal reaches.
   */
  const chooseInstrument = useCallback(
    (value: string) => {
      if (!track) return;
      const result = store.getState().setTrackInstrument(track.id, value);
      if (!result.ok && result.reason === 'outOfRange')
        store.getState().pushToast({
          message: t('inspector.instrumentRangeError', {
            instrument: result.instrumentName,
          }),
          severity: 'error',
        });
    },
    [store, track, t],
  );

  /**
   * What this track holds that its instrument cannot play — music_types'
   * `outOfRangeNoteIds`, the scan the notation colours those notes from and
   * the web Track tab's own call, so the panel and the page agree by
   * construction. Rescanned on the score's identity.
   */
  const trackId = track?.id;
  const outOfRange = useMemo(
    () =>
      outOfRangeNoteIds(score).byTrack.find(
        entry => entry.trackId === trackId,
      ) ?? null,
    [score, trackId],
  );

  const commitName = useCallback(() => {
    if (!track) return;
    if (!store.getState().renameTrack(track.id, draftName))
      setDraftName(track.name);
  }, [store, draftName, track]);

  if (!track) return <EmptyTab message={t('inspector.selectTrack')} />;

  /*
    Which list, which value and which title, from music_types'
    `instrumentPickerFor` — the web's call. **Two lists, not one**: on a
    percussion track `midiProgram` addresses a *kit*, so the melodic catalogue
    names the wrong thing outright (Brush is kit 40 and program 40 is Violin).
    `setTrackInstrument` takes the value either list produces and resolves it.
  */
  const picker = instrumentPickerFor(track);
  const percussion = isPercussionTrack(track);

  return (
    <View className="gap-3">
      <Field label={t('inspector.name')}>
        <Input
          value={draftName}
          onChangeText={setDraftName}
          onBlur={commitName}
          editable={!locked}
          accessibilityLabel={t('inspector.name')}
        />
      </Field>

      <Field label={t(picker.titleKey)}>
        {/*
          The icon beside the picker, as the web has it: a row of instrument
          names is a wall of text, and the shape is what a reader finds a part
          by. The art is music_types', the same drawing the canvas gutter
          strokes into the score.
        */}
        <View className="flex-row items-center gap-2">
          <InstrumentIcon track={track} color={ink.foreground} />
          <View className="flex-1">
            <SheetSelector
              title={t(picker.titleKey)}
              value={picker.value}
              options={[...picker.options]}
              disabled={locked}
              onChange={chooseInstrument}
              accessibilityLabel={
                percussion
                  ? t('inspector.kitOf', { name: track.name })
                  : t(picker.titleKey)
              }
            />
          </View>
        </View>
      </Field>

      {/*
        Notes this instrument cannot play, said in words. The notation marks
        them in its own colour, which says *that* something is wrong; this says
        what, beside the instrument picker — the other half of the fix, since
        choosing an instrument that can play the part is as good an answer as
        moving the notes.
      */}
      {outOfRange ? (
        <Text className="text-muted-foreground text-sm">
          {t('inspector.outOfRange', {
            count: outOfRange.count,
            low: pitchToString(midiToPitch(outOfRange.compass.min)),
            high: pitchToString(midiToPitch(outOfRange.compass.max)),
          })}
        </Text>
      ) : null}

      {/*
        The clef the part *opens* in. Mid-score changes live on the bar, in the
        Bar tab — this is `Track.clef`, and crossing into or out of percussion
        re-resolves the program, since a kit and an instrument are different
        things at the same number.
      */}
      <Field label={t('inspector.clef')}>
        <Select
          value={track.clef}
          accessibilityLabel={t('inspector.clef')}
          disabled={locked}
          options={CLEF_OPTIONS.map(option => ({
            value: option.value,
            label: t(option.labelKey),
          }))}
          onValueChange={(value: string) =>
            store.getState().setTrackClef(track.id, value as Clef)
          }
        />
      </Field>

      {/*
        Each owns its whole row — label, control, readout — so the two line up
        by construction. `Field` is for a label above a control; these carry
        their own label column, and wrapping them in one would put the word
        twice on screen and twice in the accessible name.
      */}
      <VolumeSlider
        label={t('inspector.trackVolume')}
        rowLabel={t('inspector.volume')}
        value={volumeDraft}
        disabled={mixLocked}
        onChange={value => setVolumeDraft(clampVolume(value))}
        onCommit={value => mix({ volume: value })}
      />
      {/* -1 hard left, 0 centre, 1 hard right — the model's own range. */}
      <PanSlider
        label={t('inspector.trackPan')}
        rowLabel={t('inspector.pan')}
        value={panDraft}
        disabled={mixLocked}
        onChange={value => setPanDraft(clampPan(value))}
        onCommit={value => mix({ pan: value })}
        resetLabel={t('inspector.centerPan')}
        onReset={() => {
          // Straight to the store rather than through the drag's commit: the
          // button is not the slider, and centring is a decision rather than
          // the end of a gesture.
          setPanDraft(0);
          mix({ pan: 0 });
        }}
      />

      {/*
        Mixing stays live while the transport plays; the content controls above
        do not. Muting a part while listening is how an arrangement gets
        listened to.
      */}
      <View className="flex-row items-center justify-between">
        <Text className="text-foreground text-base">{t('inspector.mute')}</Text>
        <Switch
          checked={track.muted === true}
          disabled={mixLocked}
          onCheckedChange={(checked: boolean) => mix({ muted: checked })}
          accessibilityLabel={t('inspector.mute')}
        />
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="text-foreground text-base">{t('inspector.solo')}</Text>
        <Switch
          checked={track.solo === true}
          disabled={mixLocked}
          onCheckedChange={(checked: boolean) => mix({ solo: checked })}
          accessibilityLabel={t('inspector.solo')}
        />
      </View>

      <VisibleTracksField document={document} />

      {/*
        Deleting the part. `canDeleteTrack` is the store's own rule, asked
        rather than restated here — a score with no tracks is not a score, and
        the panel should not be the second place that knows it.
      */}
      <Button
        variant="destructive"
        disabled={!canDelete || locked}
        onPress={() => setConfirmDelete(true)}
        accessibilityLabel={t('inspector.deleteTrack')}
      >
        {t('inspector.deleteTrack')}
      </Button>
      <ConfirmSheet
        open={confirmDelete}
        title={t('inspector.deleteTrack')}
        message={t('inspector.deleteTrackConfirm', { name: track.name })}
        confirmLabel={t('inspector.deleteTrack')}
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          store.getState().removeTrack(track.id);
        }}
        onCancel={() => setConfirmDelete(false)}
      />

      {onReplace ? (
        <ReplaceButton
          document={document}
          scope="track"
          label={t('inspector.replaceTrack')}
          onReplace={onReplace}
        />
      ) : null}
    </View>
  );
}
