/**
 * What to print, on what paper, which way up — then print.
 *
 * The web print view's three pickers, in its order: the whole score or one
 * player's part, the paper, the orientation. Native used to print straight off
 * the title bar with none of them, so every printout was the whole score on
 * portrait A4 — a US Letter printer got a page laid out for a sheet it does not
 * have, and a player could not print their own part at all.
 *
 * The options are music_types' (`PAPER_OPTIONS`, `ORIENTATION_OPTIONS`, with
 * their label keys) and music_drawing's (`WHOLE_SCORE`); what each choice *does* is
 * `printPlan`'s. A part is written for its instrument with the score's
 * rehearsal marks and page turns laid out for that player; the whole score is
 * the visible tracks in concert pitch. This sheet only collects the answers.
 *
 * The paper is remembered (the `paperSize` device pref): a reader's printer
 * does not change between printouts. Until they choose one it follows the
 * device's region — Letter where the region prints on Letter, A4 elsewhere
 * (`defaultPaperSizeFor`). What to print and which way up are held here: they
 * are about this printout, not the printer.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FormModal, Select } from '@sudobility/components-rn';
import { WHOLE_SCORE } from '@sudobility/music_drawing';
import type { PrintPlanOptions } from '@sudobility/music_drawing';
import type { Score } from '@sudobility/music_types';
import { Field } from '@sudobility/music_ui_rn';
import {
  ORIENTATION_OPTIONS,
  PAPER_OPTIONS,
  defaultPaperSizeFor,
} from '@sudobility/music_types';
import { getDeviceLocaleTags } from '@sudobility/building_blocks_rn';
import { devicePrefs, useDevicePrefs } from '@/config/useDevicePrefs';
import type { PaperOrientation, PaperSize } from '@sudobility/music_types';

export type PrintSheetProps = {
  open: boolean;
  score: Score;
  /** What the whole score prints; hidden tracks stay off the paper. */
  visibleTrackIds: readonly string[];
  /** Cancel, the close button, Back — and, while drawing, abandons the print. */
  onClose: () => void;
  onPrint: (options: PrintPlanOptions) => void;
  /**
   * The pages are being drawn. The sheet stays up with Print spinning until
   * they are, then the caller closes it and asks for the print dialog: a long
   * score takes seconds, and a sheet that closed at once left the reader
   * staring at a frozen editor with no sign anything was happening.
   */
  printing?: boolean;
  /**
   * The track whose part the sheet opens on, each time it opens; the whole
   * score when absent. Set by a store screenshot (`ScreenshotLinks.tsx`).
   */
  initialScope?: string;
};

export function PrintSheet({
  open,
  score,
  visibleTrackIds,
  onClose,
  onPrint,
  initialScope,
  printing = false,
}: PrintSheetProps) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<string>(WHOLE_SCORE);
  useEffect(() => {
    if (open && initialScope) setScope(initialScope);
  }, [open, initialScope]);
  const chosenPaper = useDevicePrefs(s => s.paperSize);
  const [devicePaper] = useState(() =>
    defaultPaperSizeFor(getDeviceLocaleTags()),
  );
  const paper = chosenPaper ?? devicePaper;
  const setPaper = (value: PaperSize) =>
    devicePrefs.getState().setPaperSize(value);
  const [orientation, setOrientation] = useState<PaperOrientation>('portrait');

  // A part whose track has since been deleted falls back to the whole score
  // rather than printing nothing.
  const effectiveScope = score.tracks.some(track => track.id === scope)
    ? scope
    : WHOLE_SCORE;

  return (
    <FormModal
      visible={open}
      title={t('print.action')}
      onClose={onClose}
      closeAriaLabel={t('common.closeDialog')}
      actions={[
        { label: t('common.cancel'), onPress: onClose, variant: 'ghost' },
        {
          label: t('print.action'),
          loading: printing,
          onPress: () =>
            onPrint({
              scope: effectiveScope,
              visibleTrackIds,
              paper,
              orientation,
            }),
        },
      ]}
    >
      <View className="gap-3">
        <Field label={t('print.whatToPrint')}>
          <Select
            value={effectiveScope}
            accessibilityLabel={t('print.whatToPrint')}
            options={[
              { value: WHOLE_SCORE, label: t('print.wholeScore') },
              ...score.tracks.map(track => ({
                value: track.id,
                label: track.name,
              })),
            ]}
            onValueChange={setScope}
          />
        </Field>
        <Field label={t('print.paper')}>
          <Select
            value={paper}
            accessibilityLabel={t('print.paper')}
            options={PAPER_OPTIONS.map(option => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
            onValueChange={value => setPaper(value as PaperSize)}
          />
        </Field>
        <Field label={t('print.orientation')}>
          <Select
            value={orientation}
            accessibilityLabel={t('print.orientation')}
            options={ORIENTATION_OPTIONS.map(option => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
            onValueChange={value => setOrientation(value as PaperOrientation)}
          />
        </Field>
      </View>
    </FormModal>
  );
}
