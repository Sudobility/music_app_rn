/**
 * Asks before opening a document would throw another one's work away.
 *
 * Under a tab bar one project is open at a time, so opening a document
 * closes the one already open (`DocumentList`'s `single`). The list closes
 * without asking, as it always has — only a caller has a person to ask — so
 * every way of opening a document on those platforms goes through `guard`.
 *
 * **Saved first, asked second.** A document with somewhere to live, a file
 * or a project, is written before anything is asked: its pending work is
 * then not at risk, and a question about it would be one the app could have
 * answered itself. What is left to ask about is work with nowhere to go — a
 * score never saved, or one whose save failed. The decision is music_lib's
 * `decideQuit`, the one Android's Back asks (`UnsavedQuitGuard`), and the
 * prompt is drawn in the same `ConfirmSheet` with the same copy.
 *
 * Where several documents may be open this asks nothing and runs the action.
 */
import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { decideQuit } from '@sudobility/music_lib';
import { ConfirmSheet } from '@sudobility/music_ui_rn';
import { useDocumentList } from '@/documents/DocumentsContext';

type Pending = { titles: readonly string[]; action: () => void };

export type SingleDocumentGuard = {
  /** Runs `action`, after asking if it would lose unsaved work. */
  guard: (action: () => void) => void;
  /** The question, when there is one. Render it once, anywhere. */
  prompt: ReactNode;
};

export function useSingleDocumentGuard(single: boolean): SingleDocumentGuard {
  const { t } = useTranslation();
  const list = useDocumentList();
  const [pending, setPending] = useState<Pending | null>(null);
  // A second request while the first is still saving is the same press
  // twice, and would run its action twice.
  const flushing = useRef(false);

  const guard = useCallback(
    (action: () => void) => {
      if (!single) {
        action();
        return;
      }
      if (flushing.current) return;
      flushing.current = true;
      void list
        .flushAll()
        .finally(() => {
          flushing.current = false;
        })
        .then(() => {
          const decision = decideQuit(
            list.state.documents.map(document => document.store.getState()),
          );
          if (decision.kind === 'close') action();
          else {
            setPending({
              titles: decision.documents.map(state => state.title),
              action,
            });
          }
        });
    },
    [single, list],
  );

  const count = pending?.titles.length ?? 0;
  const prompt = (
    <ConfirmSheet
      open={pending !== null}
      title={t('document.unsavedTitle')}
      message={
        count === 1
          ? t('document.unsavedBody', { title: pending?.titles[0] ?? '' })
          : t('document.unsavedQuitBody', { count })
      }
      confirmLabel={t('document.closeWithoutSaving')}
      destructive
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const action = pending?.action;
        setPending(null);
        action?.();
      }}
    />
  );

  return { guard, prompt };
}
