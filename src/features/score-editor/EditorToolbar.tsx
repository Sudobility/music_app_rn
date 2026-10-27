/**
 * The editing bar, mirroring the web app's — control for control.
 *
 * Same groups in the same order, divided the same way: tracks, then note value
 * with its dotted/triplet modifiers, then accidentals, then articulation and
 * ornament with the tie beside them, then the marks and modes that act on a
 * selection, then the clipboard, then quantize, then voice, then the rare
 * actions behind a menu. Zoom, layout, pitch display and the inspector toggle
 * sit **outside the scroller**, pinned to the right, for the reason the web
 * pins them: they change how you look at the score rather than the score
 * itself, and they were the first things to disappear behind the horizontal
 * scroll.
 *
 * **Several choices are a picker, not a row of chips**, and that is the single
 * biggest difference from what this file used to be. Six note values, five
 * accidentals, five articulations, five ornaments and four quantize grids came
 * to twenty-five chips — a bar three screens wide, where the web's is one. Each
 * of those is a `ToolbarSelect` with one glyph on the trigger and the words in
 * the sheet, exactly as the web draws its `Select`s, and for the same reason:
 * five near-identical marks are unreadable as a row of 18px glyphs.
 *
 * **Every action is `music_editing`'s.** `chooseDuration`, `changeAccidental`,
 * `toggleTie` and the rest each enforce rules about a score — a hairpin needs
 * two notes, a fermata reads whether the whole selection already has one — and
 * those rules belong in the library, not in a toolbar. This file decides only
 * what is offered, in what order, and when it is available.
 *
 * **Availability is music_editing's `selectToolbarAvailability`**, the same
 * function the web bar reads, so the two cannot disagree about when a
 * glissando can be written. It used to be copied from the web by hand, thirty
 * `canEdit && …` expressions that agreed only because nobody had changed
 * either bar since — and the More menu had already parted: only its Glissando
 * entry knew about the transport, so Add Bar, Delete Bar and Enter Lyrics were
 * live mid-playback and did nothing. The same goes for the few controls that
 * are more than one call: Insert Note (`insertDefaultNoteAtCaret`), quantize
 * (`quantizeSelectionToGrid`), the More menu (`EDITOR_MORE_ACTIONS` /
 * `runMoreAction`), the add-track answers (`addTrackChoices` /
 * `runAddTrackChoice`) and the edit modes (`EDIT_MODE_OPTIONS`).
 */
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import { Text } from '@sudobility/components-rn';
import {
  addTrackChoices,
  changeAccidental,
  changeArticulation,
  changeBeam,
  changeOrnament,
  chooseDuration,
  chooseEditMode,
  editModeHintKey,
  goToBarFromInput,
  insertBlankMeasuresAtCaret,
  insertDefaultNoteAtCaret,
  insertRestAtSelection,
  quantizeSelectionToGrid,
  runAddTrackChoice,
  runMoreAction,
  selectEffectiveEditMode,
  selectSelectedNotes,
  selectSelectedTrack,
  selectToolbarAvailability,
  toggleArpeggiate,
  toggleFermata,
  toggleHairpin,
  toggleSlur,
  toggleTie,
  voiceHintKey,
  zoomIn,
  zoomOut,
} from '@sudobility/music_editing';
import {
  ACCIDENTAL_ICON,
  ACCIDENTAL_OPTIONS,
  ARTICULATION_OPTIONS,
  BASE_DURATIONS,
  DURATION_ICON,
  NO_MARK,
  ORNAMENT_OPTIONS,
  barCount as scoreBarCount,
  durationDisplay,
  durationParts,
  isVocalInstrumentValue,
  withBase,
  withModifier,
} from '@sudobility/music_types';
import type {
  Accidental,
  Articulation,
  BaseDuration,
  NotationIconName,
  Ornament,
} from '@sudobility/music_types';
import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  EllipsisHorizontalIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  PencilIcon,
  PlusIcon,
} from 'react-native-heroicons/solid';
import { NotationIcon } from '@/components/icons/NotationIcon';
import { useNotationInk } from '@/components/icons/notation-ink';
import { IconButton } from '@/components/layout/IconButton';
import { VoiceRecordButton } from './VoiceRecordButton';
import { ToolbarSelect } from '@/components/controls/ToolbarSelect';
import type { ToolbarOption } from '@/components/controls/ToolbarSelect';
import { ChoiceSheet } from './ChoiceSheet';
import { GoToBarSheet } from './GoToBarSheet';
import { InsertBarsSheet } from './InsertBarsSheet';
import type { InsertBarsSheetResult } from './InsertBarsSheet';
import type { ReactNode } from 'react';
import type { MusicDocument } from '@/documents/document';
import { devicePrefs, useDevicePrefs } from '@/config/useDevicePrefs';
import {
  EDIT_MODE_OPTIONS,
  EDITOR_MORE_ACTIONS,
  EDITOR_VOICE_COUNT,
  QUANTIZE_GRIDS,
  QUANTIZE_GRID_SHORT,
} from '@sudobility/music_types';
import type {
  AddTrackChoice,
  EditorMoreAction,
  QuantizeGrid,
} from '@sudobility/music_types';
import type { LayoutMode } from '@sudobility/music_types';
import { usePendingAction } from '@/components/controls/usePendingAction';

const ICON_SIZE = 18;

/** One row of controls, matching the web bar's `h-8` plus its padding. */
const TOOLBAR_HEIGHT = 44;

/*
  Which glyph each note value, accidental and edit mode draws is music_types'
  (`DURATION_ICON`, `ACCIDENTAL_ICON`, `EDIT_MODE_OPTIONS`)
  — records keyed by the vocabulary, shared with the web bar. This file held
  three lists of its own that agreed with the web's only because nobody had
  redrawn one. `NOTATION_ICONS` holds the shapes, so a semiquaver here is the
  same drawing as a semiquaver there; Unicode was the shortcut, and it does not
  work — the multi-codepoint musical characters draw as `?`.
*/

export type EditorToolbarProps = {
  document: MusicDocument;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
  /** Starts lyric entry on the active track. */
  onEnterLyrics: () => void;
  /** Shows or hides the property sheet. */
  onToggleInspector: () => void;
  inspectorVisible: boolean;
  /**
   * Asks the server for one more track.
   *
   * Beside Add Track rather than in the title bar: both add a part, and the
   * only difference is who writes the notes.
   */
  onGenerateTrack?: () => void;
  /**
   * Starts AI generation for the newly inserted bars. Answers once the job
   * has been posted; the insert sheet waits on it with its button spinning.
   */
  onGenerateInsertedBars?: () => void | Promise<void>;
  onVoiceTranscriptionJob?: (
    projectId: string,
    cancel: () => void,
    progress?: {
      stage: 'plan' | 'part' | 'section' | 'chunk';
      label: string;
      done: number;
      total: number;
    },
  ) => void;
};

export function EditorToolbar({
  document,
  layoutMode,
  onLayoutModeChange,
  onEnterLyrics,
  onToggleInspector,
  inspectorVisible,
  onGenerateTrack,
  onGenerateInsertedBars,
  onVoiceTranscriptionJob,
}: EditorToolbarProps) {
  const { t } = useTranslation();
  const ink = useNotationInk();
  const store = document.store;
  const score = useStore(store, s => s.score);
  const snapGrid = useStore(store, s => s.snapGrid);
  const effectiveEditMode = useStore(store, selectEffectiveEditMode);
  const zoom = useStore(store, s => s.zoom);
  const noteInput = useStore(store, s => s.noteInput);
  const pitchDisplay = useStore(store, s => s.pitchDisplay);
  const trackInfo = useDevicePrefs(s => s.trackInfo);
  const activeVoiceIndex = useStore(store, s => s.activeVoiceIndex);
  const selectedNotes = useStore(store, selectSelectedNotes);
  const activeTrack = useStore(store, selectSelectedTrack);
  /*
    Which controls can be used right now. Reference-stable while no answer
    changes, so this re-renders on a transition only — not one of the
    high-frequency reads that must stay out of a component's top level.
  */
  const available = useStore(store, selectToolbarAvailability);
  const lyricsDisabled =
    !available.enterLyrics ||
    activeTrack === null ||
    !isVocalInstrumentValue(String(activeTrack.midiProgram));

  const [quantizeGrid, setQuantizeGrid] = useState<QuantizeGrid>('sixteenth');
  const [goToBarOpen, setGoToBarOpen] = useState(false);
  const [addTrackOpen, setAddTrackOpen] = useState(false);
  const [insertBarsOpen, setInsertBarsOpen] = useState(false);
  // Insert-and-generate and Quantize both answer later than the press; each
  // spins on its own control and refuses a second press meanwhile.
  const inserting = usePendingAction();
  const quantizing = usePendingAction();

  /*
    The mode a write will actually use: stack on a part that cannot play a
    chord reads as replace (asked through the *track*, because a drum track's
    program is a kit — Brush sits at 40, the Violin address).

    Shown, never written back. The library's write paths (`insertNoteAtCaret`,
    `paste`) read the effective mode themselves, so the stored choice survives a
    visit to a part that cannot stack: Stack chosen on a piano is still Stack
    after selecting a flute and coming back. This bar used to overwrite the
    stored mode from an effect, which is what lost that choice.
  */

  /**
   * What the one duration control shows: the armed length with nothing
   * selected, the selection's own length when they agree, "…" when they do not.
   */
  const durationShown = useMemo(
    () => durationDisplay(selectedNotes, score?.ppq ?? 480, snapGrid),
    [selectedNotes, score?.ppq, snapGrid],
  );

  // music_types' count, so this and every other surface agree on which track's
  // grid is the score's.
  const barCount = scoreBarCount(score);

  const zoomLabel = `${Math.round(zoom * 100)}%`;

  const durationOptions: ToolbarOption[] = BASE_DURATIONS.map(value => ({
    value,
    label: t(`duration.${value}`),
    icon: DURATION_ICON[value],
  }));

  /*
    The values and their copy keys come from music_types, so a sixth accidental
    reaches this bar without anybody editing it; only the *glyph* is the app's,
    since a drawing is not something a vocabulary can carry.
  */
  const accidentalOptions: ToolbarOption[] = ACCIDENTAL_OPTIONS.map(option => ({
    value: String(option.value),
    label: t(option.labelKey),
    icon: ACCIDENTAL_ICON[option.value],
  }));

  const articulationOptions: ToolbarOption[] = ARTICULATION_OPTIONS.map(
    option => ({ value: option.value, label: t(option.labelKey) }),
  );

  /*
    `ORNAMENT_CODE` in the renderer crosses `mordent`/`inverted-mordent` over,
    because VexFlow's two codes are the reverse of the words a musician uses.
    Nothing about that belongs here — this offers the words, and even the
    kebab-to-camel spelling of the key is the library's, so this bar and the
    property sheet cannot spell it differently.
  */
  const ornamentOptions: ToolbarOption[] = ORNAMENT_OPTIONS.map(option => ({
    value: option.value,
    label: t(option.labelKey),
  }));

  const quantizeOptions: ToolbarOption[] = QUANTIZE_GRIDS.map(grid => ({
    value: grid,
    label: `${QUANTIZE_GRID_SHORT[grid]} — ${t(`duration.${grid}`)}`,
  }));

  /*
    The rare ones live behind a menu, exactly as the web bar's "More actions"
    does: each is a real action, but none is reached often enough to be worth
    permanent width. Which entries, in what order and when each is available
    are music_editing's (`EDITOR_MORE_ACTIONS`, each naming the toolbar control
    whose availability it takes) — so an entry is greyed here exactly when it
    is on the web, and `runMoreAction` re-checks as it runs, because a sheet
    can outlive the moment the transport started under it.
  */
  const moreOptions: ToolbarOption[] = EDITOR_MORE_ACTIONS.map(action => ({
    value: action.value,
    label: t(action.labelKey),
    ...(action.value === 'enter-lyrics'
      ? { disabled: lyricsDisabled }
      : available[action.control]
        ? {}
        : { disabled: true }),
  }));

  const handleMoreAction = (value: string): void => {
    runMoreAction(store, value as EditorMoreAction, {
      goToBar: () => setGoToBarOpen(true),
      enterLyrics: onEnterLyrics,
      addMeasure: () => setInsertBarsOpen(true),
    });
  };

  const insertBars = (result: InsertBarsSheetResult): void =>
    void inserting.run(async () => {
      try {
        const inserted = insertBlankMeasuresAtCaret(
          store,
          result.count,
          result.position,
        );
        if (!inserted || !result.generate || !onGenerateInsertedBars) return;
        const nextScore = store.getState().score;
        const measureIds =
          nextScore?.tracks.flatMap(track =>
            track.measures
              .slice(inserted.startIndex, inserted.startIndex + inserted.count)
              .map(measure => measure.id),
          ) ?? [];
        store.getState().selectMeasures(measureIds);
        await onGenerateInsertedBars();
      } finally {
        setInsertBarsOpen(false);
      }
    });

  return (
    /*
      Two parts on one row: the tools scroll, the view controls do not. They sit
      outside the scrolling region because inside it they are the first thing to
      go past the right edge, reachable only by scrolling the whole bar — which
      is exactly what the web app measured and moved them for.
    */
    <View
      className="bg-card flex-row items-stretch"
      style={{ height: TOOLBAR_HEIGHT }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="toolbar"
        accessibilityLabel={t('editor.toolbar')}
        /*
          The height comes from the row above rather than from a `flexGrow: 0`
          of its own: a horizontal ScrollView has no intrinsic height and takes
          whatever it is offered, which is an empty band above and below the
          controls when nothing bounds it.
        */
        className="flex-1"
        contentContainerClassName="items-center gap-1 px-2"
      >
        {/* Tracks first: adding a part, before anything that acts within one.
            There is no track picker here. Tapping a staff makes its track the
            active one, so a second way to say the same thing was a control the
            width of a field on the widest bar in the app; which tracks are
            drawn is on the inspector's Track tab (`VisibleTracksField`). */}
        <Group label={t('editor.tracks')}>
          {/*
            One control that asks, rather than two that act — the same two
            answers the web app's Add Track menu offers, in the same order.
          */}
          <IconButton
            label={t('editor.addTrack')}
            disabled={!available.addTrack}
            onPress={() => setAddTrackOpen(true)}
          >
            <PlusIcon size={ICON_SIZE} color={ink.foreground} />
          </IconButton>
        </Group>

        <Divider />

        {/*
          One control, not six chips. What it shows depends on the selection —
          see `durationDisplay` — and choosing a value both rewrites every
          selected note and arms the next one, so the control never has to
          explain which of its two jobs it is doing.
        */}
        <ToolbarSelect
          label={t('editor.noteDuration')}
          hint={t('editor.noteDurationHint')}
          options={durationOptions}
          {...(durationShown.kind === 'mixed'
            ? {}
            : { value: durationShown.base })}
          disabled={!available.noteDuration}
          onChange={value =>
            chooseDuration(store, withBase(snapGrid, value as BaseDuration))
          }
        >
          {durationShown.kind === 'mixed' ? (
            // Not the first note's icon and not the armed one: either would
            // claim the selection is something it is not.
            <Text className="text-foreground text-base">…</Text>
          ) : (
            <NotationIcon
              name={DURATION_ICON[durationShown.base]}
              color={ink.foreground}
            />
          )}
        </ToolbarSelect>

        <Group label={t('editor.durationModifier')}>
          <GlyphChip
            icon="DottedIcon"
            label={t('editor.dotted')}
            hint={t('editor.dottedHint')}
            disabled={!available.dotted}
            selected={durationParts(snapGrid).modifier === 'dotted'}
            onPress={() =>
              chooseDuration(store, withModifier(snapGrid, 'dotted'))
            }
          />
          <GlyphChip
            icon="TripletIcon"
            label={t('editor.triplet')}
            hint={t('editor.tripletHint')}
            disabled={!available.triplet}
            selected={durationParts(snapGrid).modifier === 'triplet'}
            onPress={() =>
              chooseDuration(store, withModifier(snapGrid, 'triplet'))
            }
          />
        </Group>

        <Divider />

        {/* One picker, not five chips. Accidentals only ever act on a
            selection, so they are not something you reach for constantly while
            entering notes. */}
        <ToolbarSelect
          label={t('editor.accidental')}
          hint={t('editor.accidentalHint')}
          options={accidentalOptions}
          disabled={!available.accidental}
          onChange={value =>
            changeAccidental(store, Number(value) as Accidental)
          }
        >
          <NotationIcon name="SharpIcon" color={ink.foreground} />
        </ToolbarSelect>

        <Divider />

        {/*
          The trigger applies rather than reflects, so no `value` is passed —
          this adds an articulation to the selection, it does not hold one.
        */}
        <ToolbarSelect
          label={t('editor.articulation')}
          hint={t('editor.articulationHint')}
          options={articulationOptions}
          disabled={!available.articulation}
          onChange={value =>
            changeArticulation(
              store,
              value === NO_MARK ? undefined : (value as Articulation),
            )
          }
        >
          <NotationIcon name="ArticulationIcon" color={ink.foreground} />
        </ToolbarSelect>

        <ToolbarSelect
          label={t('editor.ornament')}
          hint={t('editor.ornamentHint')}
          options={ornamentOptions}
          disabled={!available.ornament}
          onChange={value =>
            changeOrnament(
              store,
              value === NO_MARK ? undefined : (value as Ornament),
            )
          }
        >
          <NotationIcon name="OrnamentIcon" color={ink.foreground} />
        </ToolbarSelect>

        <GlyphChip
          icon="TieIcon"
          label={t('editor.toggleTie')}
          hint={t('editor.toggleTie')}
          disabled={!available.tie}
          onPress={() => toggleTie(store, 'tieStart')}
        />

        <Divider />

        <Group label={t('editor.editMode')}>
          {EDIT_MODE_OPTIONS.map(mode => (
            <GlyphChip
              key={mode.value}
              icon={mode.icon}
              label={t(mode.labelKey)}
              /*
                Stack has a second hint for a part that cannot play a chord,
                saying why the button is off rather than describing a mode the
                reader cannot have. It takes the instrument's name.
              */
              hint={t(editModeHintKey(mode.value, available.stackMode), {
                instrument:
                  activeTrack?.instrumentName ?? t('editor.thisInstrument'),
              })}
              selected={effectiveEditMode === mode.value}
              disabled={!available[`${mode.value}Mode`]}
              onPress={() => chooseEditMode(store, mode.value)}
            />
          ))}
        </Group>

        <GlyphChip
          icon="InsertNoteIcon"
          label={t('editor.insertNote')}
          hint={t('editor.insertNoteHint')}
          disabled={!available.insertNote}
          /*
            Writes the default pitch at the caret and steps past it, so a second
            press continues the line — decision 4 of the parity plan, and the
            library's rather than an `advanceCaret: true` this bar has to
            remember.
          */
          onPress={() => insertDefaultNoteAtCaret(store)}
        />

        {/*
          A phrase mark over the selection. Needs two notes — one note cannot
          carry a slur — so it disables rather than doing nothing.
        */}
        <GlyphChip
          icon="SlurIcon"
          label={t('editor.slur')}
          hint={t('editor.slurHint')}
          disabled={!available.slur}
          onPress={() => toggleSlur(store)}
        />
        <VoiceRecordButton
          document={document}
          onTranscriptionJob={onVoiceTranscriptionJob}
        />
        {/*
          The hairpins. Two chips rather than a menu: crescendo and diminuendo
          are the two things anybody reaches for, and a wedge is faster to
          recognise as a shape than to read as a word. Two notes minimum, like
          the slur — a wedge over one note has nowhere to open.
        */}
        <GlyphChip
          icon="CrescendoIcon"
          label={t('editor.crescendo')}
          hint={t('editor.crescendoHint')}
          disabled={!available.crescendo}
          onPress={() => toggleHairpin(store, 'crescendo')}
        />
        <GlyphChip
          icon="DiminuendoIcon"
          label={t('editor.diminuendo')}
          hint={t('editor.diminuendoHint')}
          disabled={!available.diminuendo}
          onPress={() => toggleHairpin(store, 'diminuendo')}
        />
        {/* Rolling a chord. One note is enough to select; a lone note simply
            draws nothing. */}
        <GlyphChip
          icon="ArpeggioIcon"
          label={t('editor.arpeggiate')}
          hint={t('editor.arpeggiateHint')}
          disabled={!available.arpeggiate}
          onPress={() => toggleArpeggiate(store)}
        />
        {/*
          Beaming overrides. One note is enough for either: a break is a
          property of the note it sits on rather than a span, and so is taking a
          note out of beaming altogether.
        */}
        <GlyphChip
          icon="BeamBreakIcon"
          label={t('editor.beamBreak')}
          hint={t('editor.beamBreakHint')}
          disabled={!available.beamBreak}
          onPress={() => changeBeam(store, 'break')}
        />
        <GlyphChip
          icon="BeamNoneIcon"
          label={t('editor.beamNone')}
          hint={t('editor.beamNoneHint')}
          disabled={!available.beamNone}
          onPress={() => changeBeam(store, 'none')}
        />
        {/*
          A pause on the selection. One note is enough, unlike the slur beside
          it — a fermata belongs to a single note.
        */}
        <GlyphChip
          icon="FermataIcon"
          label={t('editor.fermata')}
          hint={t('editor.fermataHint')}
          disabled={!available.fermata}
          onPress={() => toggleFermata(store)}
        />

        {/*
          Note input is a mode, because a tap cannot mean two things: with it on
          a tap on a stave writes a note at that pitch, with it off the tap aims
          the caret. The caret is what selection ranges, insertion and "play
          from here" are all aimed with, so it stays the default. A pencil, like
          the web's, so the mode is not confused with the Insert Note action
          that shares the notehead glyph.
        */}
        <IconButton
          label={t('editor.noteInput')}
          hint={t('editor.noteInputHint')}
          selected={noteInput}
          disabled={!available.noteInput}
          onPress={() => store.getState().setNoteInput(!noteInput)}
        >
          <PencilIcon
            size={ICON_SIZE}
            color={noteInput ? ink.primary : ink.foreground}
          />
        </IconButton>

        <GlyphChip
          icon="InsertRestIcon"
          label={t('editor.insertRest')}
          hint={t('editor.insertRestHint')}
          disabled={!available.insertRest}
          onPress={() => insertRestAtSelection(store)}
        />

        {/*
          Copy, Cut, Paste and Delete used to sit here.

          They moved to the score's own long-press menu, on both platforms,
          because all four act on something already selected and none of them
          could say *what*. Delete means three different edits depending on
          whether a track, a span of bars or a run of notes is selected, and a
          button on a bar cannot name its subject. A menu opened on the thing
          itself can, and does.
        */}
        <Divider />

        <ToolbarSelect
          label={t('editor.quantizeGrid')}
          hint={t('editor.quantizeGridHint')}
          options={quantizeOptions}
          value={quantizeGrid}
          disabled={!available.quantizeGrid}
          onChange={value => setQuantizeGrid(value as QuantizeGrid)}
        >
          {/* The short form: the trigger is read at a glance, and the full
              words made this the widest control on the web bar. */}
          <Text className="text-foreground text-sm">
            {QUANTIZE_GRID_SHORT[quantizeGrid]}
          </Text>
        </ToolbarSelect>
        <GlyphChip
          icon="QuantizeIcon"
          label={t('editor.quantize')}
          hint={t('editor.quantizeHint')}
          disabled={!available.quantize}
          loading={quantizing.pending}
          onPress={() =>
            void quantizing.run(() =>
              quantizeSelectionToGrid(store, quantizeGrid),
            )
          }
        />

        <Divider />

        {/* How many voices is music_editing's `EDITOR_VOICE_COUNT` — two, where
            the notation actually needs them: stems up against stems down on
            one stave. Nothing else in the editor tells more apart yet, so
            offering four would be offering somewhere to lose notes. */}
        <Group label={t('editor.voice')}>
          {Array.from({ length: EDITOR_VOICE_COUNT }, (_, index) => (
            <TextChip
              key={index}
              label={String(index + 1)}
              name={t('editor.voiceNumber', { number: index + 1 })}
              hint={t(voiceHintKey(index))}
              selected={activeVoiceIndex === index}
              disabled={!available.voice}
              onPress={() => store.getState().setActiveVoice(index)}
            />
          ))}
        </Group>

        <Divider />

        <ToolbarSelect
          label={t('editor.moreActions')}
          options={moreOptions}
          disabled={!available.moreActions}
          onChange={handleMoreAction}
        >
          <EllipsisHorizontalIcon size={ICON_SIZE} color={ink.foreground} />
        </ToolbarSelect>
      </ScrollView>

      {/* Pinned outside the scroller: these change how you look at the score,
          not the score itself. */}
      <View className="border-border flex-row shrink-0 items-center gap-0.5 border-l pl-1">
        {/*
          Zoom is not an edit, so it stays live while the transport plays —
          reading along with the music is exactly when it is wanted.
        */}
        <IconButton
          label={t('editor.zoomOut')}
          onPress={() => store.getState().setZoom(zoomOut(zoom))}
        >
          <MagnifyingGlassMinusIcon size={ICON_SIZE} color={ink.foreground} />
        </IconButton>
        {/*
          The name sits on a wrapper: this package's `Text` styles text and
          takes no accessibility props of its own.
        */}
        <View accessibilityLabel={t('editor.currentZoom')} className="w-16">
          <Text className="text-foreground text-center text-sm">
            {zoomLabel}
          </Text>
        </View>
        <IconButton
          label={t('editor.zoomIn')}
          onPress={() => store.getState().setZoom(zoomIn(zoom))}
        >
          <MagnifyingGlassPlusIcon size={ICON_SIZE} color={ink.foreground} />
        </IconButton>

        <Group label={t('editor.layoutMode')}>
          <GlyphChip
            icon="PageLayoutIcon"
            label={t('editor.pageLayout')}
            hint={t('editor.pageHint')}
            selected={layoutMode === 'page'}
            onPress={() => onLayoutModeChange('page')}
          />
          <GlyphChip
            icon="ContinuousLayoutIcon"
            label={t('editor.continuousLayout')}
            hint={t('editor.continuousHint')}
            selected={layoutMode === 'continuous'}
            onPress={() => onLayoutModeChange('continuous')}
          />
        </Group>

        {/*
          The track-info column: the whole thing, or the instrument icons
          alone — one control that switches between the two, as the pitch
          switch below does; its label names what tapping does. A device
          pref, so it is the same in the next project.
        */}
        <GlyphChip
          icon="TrackInfoIconIcon"
          label={
            trackInfo === 'icon'
              ? t('editor.trackInfoFull')
              : t('editor.trackInfoIcon')
          }
          hint={t('editor.trackInfoHint')}
          selected={trackInfo === 'icon'}
          onPress={() =>
            devicePrefs
              .getState()
              .setTrackInfo(trackInfo === 'icon' ? 'full' : 'icon')
          }
        />

        {/*
          The label names what tapping *does*, not the current state, which is
          what a button should say — so the two names are two states of one
          control, not two controls.
        */}
        <TextChip
          /*
            Abbreviated because the chip is one glyph wide, but translated all
            the same: both apps hardcoded the same two English letters here,
            which is exactly why no parity check could see them.
          */
          label={t(
            pitchDisplay === 'written'
              ? 'editor.pitchWrittenShort'
              : 'editor.pitchConcertShort',
          )}
          name={
            pitchDisplay === 'written'
              ? t('editor.showConcertPitch')
              : t('editor.showWrittenPitch')
          }
          hint={t('editor.pitchDisplayHint')}
          selected={pitchDisplay === 'written'}
          /*
            A device pref, not this document's: written pitch is how the reader
            reads, on every tab and after a relaunch. The document stores are
            mirrored from the prefs store, so writing to this one alone would
            change one tab, persist nothing, and be overwritten by the next
            change made anywhere else.
          */
          onPress={() =>
            devicePrefs
              .getState()
              .setPitchDisplay(
                pitchDisplay === 'written' ? 'concert' : 'written',
              )
          }
        />
      </View>

      {/* Outside the scroller too, so it stays reachable however narrow the
          window gets. It controls the property sheet, not the score. */}
      <View className="flex-row shrink-0 items-center pr-1">
        <IconButton
          label={t('editor.toggleInspector')}
          hint={
            inspectorVisible
              ? t('editor.hideInspector')
              : t('editor.showInspector')
          }
          selected={inspectorVisible}
          onPress={onToggleInspector}
        >
          {/*
            Tinted when the sheet is open, because the grey chip that used to
            say so is gone — selection is the accent colour throughout.
          */}
          {inspectorVisible ? (
            <ChevronDoubleRightIcon size={ICON_SIZE} color={ink.primary} />
          ) : (
            <ChevronDoubleLeftIcon size={ICON_SIZE} color={ink.foreground} />
          )}
        </IconButton>
      </View>

      {/*
        Both answers are always listed, and Generate Track is *disabled* rather
        than dropped when the document is not a server project — a menu whose
        entries come and go teaches the reader nothing about where to find
        them, and the detail line can say why it is unavailable where an
        absence cannot.
      */}
      <ChoiceSheet
        open={addTrackOpen}
        title={t('editor.addTrack')}
        message={t('editor.addTrackPrompt')}
        /*
          The answers, their order, their hints and when Generate is off are
          music_editing's `addTrackChoices`, the list the web's menu draws.
        */
        choices={addTrackChoices({
          canGenerate: onGenerateTrack !== undefined,
        }).map((choice, index) => ({
          value: choice.value,
          label: t(choice.labelKey),
          detail: t(choice.hintKey),
          ...(index === 0 ? { primary: true } : {}),
          ...(choice.disabled ? { disabled: true } : {}),
        }))}
        onChoose={(choice: AddTrackChoice) => {
          setAddTrackOpen(false);
          // Both answers add content, so `runAddTrackChoice` refuses them
          // mid-playback — the trigger is already disabled, but the sheet can
          // outlive a play that started under it.
          runAddTrackChoice(store, choice, {
            ...(onGenerateTrack ? { generateTrack: onGenerateTrack } : {}),
          });
        }}
        onCancel={() => setAddTrackOpen(false)}
      />
      <GoToBarSheet
        open={goToBarOpen}
        barCount={barCount}
        onClose={() => setGoToBarOpen(false)}
        onGo={text => goToBarFromInput(store, text)}
      />
      <InsertBarsSheet
        open={insertBarsOpen}
        onClose={() => setInsertBarsOpen(false)}
        onSubmit={insertBars}
        submitting={inserting.pending}
      />
    </View>
  );
}

/**
 * Several controls that belong together, under one name.
 *
 * The web writes `role="group"`, which binds them for a screen reader without
 * claiming to be a control itself. React Native has no counterpart, so this is
 * a labelled view: the name is there for anything that walks the tree, and the
 * role is deliberately left off rather than borrowed from something this is
 * not. The toolbar role sits on the scroller, once, as the web puts it on the
 * bar rather than on each group.
 */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View accessibilityLabel={label} className="flex-row items-center gap-1">
      {children}
    </View>
  );
}

function Divider() {
  return <View className="bg-border mx-1 h-6 w-px" />;
}

/** A toolbar control showing one notation glyph. */
function GlyphChip({
  icon,
  label,
  hint,
  selected = false,
  disabled = false,
  loading = false,
  onPress,
}: {
  icon: NotationIconName;
  label: string;
  hint?: string;
  selected?: boolean;
  disabled?: boolean;
  /** The chip's work is under way: it spins and refuses a second press. */
  loading?: boolean;
  onPress: () => void;
}) {
  const ink = useNotationInk();
  return (
    <IconButton
      label={label}
      {...(hint ? { hint } : {})}
      selected={selected}
      disabled={disabled}
      loading={loading}
      onPress={onPress}
    >
      <View className={selected ? 'bg-primary rounded p-0.5' : 'rounded p-0.5'}>
        {/*
          The colour is passed rather than inherited: `currentColor` is an SVG
          idea react-native-svg does not resolve, so a glyph that relied on it
          would draw black on a selected chip's dark background — and would stay
          black in dark mode, which is what `useNotationInk` fixes.
        */}
        <NotationIcon
          name={icon}
          color={selected ? ink.onPrimary : ink.foreground}
        />
      </View>
    </IconButton>
  );
}

/** A toolbar control showing a word — for the two the web also spells out. */
function TextChip({
  label,
  name,
  hint,
  selected = false,
  disabled = false,
  onPress,
}: {
  /** The word drawn on the chip. */
  label: string;
  /** Its accessible name, when the drawn word is not one (`Wrt`). */
  name?: string;
  hint?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <IconButton
      label={name ?? label}
      {...(hint ? { hint } : {})}
      selected={selected}
      disabled={disabled}
      onPress={onPress}
    >
      {/*
        Two complete class strings rather than one with a hole in it: Tailwind
        extracts classes by scanning source text, so an interpolated variant
        never appears whole in the file and is silently never generated.
      */}
      <View className={selected ? 'bg-primary rounded px-1' : 'rounded px-1'}>
        <Text
          className={
            selected
              ? 'text-primary-foreground text-sm'
              : 'text-foreground text-sm'
          }
        >
          {label}
        </Text>
      </View>
    </IconButton>
  );
}
