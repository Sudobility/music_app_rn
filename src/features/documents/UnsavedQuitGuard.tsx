/**
 * Android's Back button must not throw away work without asking.
 *
 * The editor is the stack's `initialRouteName`, so there is nothing to pop
 * there and Back finishes the activity. Reproduced on a Pixel 9 Pro XL: write
 * two notes, the title bar reads "Unsaved", press Back — straight to the
 * launcher — relaunch, and the score is empty with no prompt having been
 * shown. The autosave debounce is the window that work lived in, and Back is
 * outside it: `AppState` flushes on *background*, which a finished activity
 * does not reliably reach.
 *
 * **The decision is music_lib's, not this component's.** `decideQuit` sits in
 * `unsaved-guard.ts` beside the `decideClose` a tab's × already uses, and both
 * answer the same `CloseDecision`. A second statement of "what counts as
 * unsaved" is exactly the kind that drifts — this asks the guard and draws the
 * answer in the `ConfirmSheet` the tab bar draws it in, with the same
 * `document.unsaved*` copy.
 *
 * `decideQuit` rather than `decideClose`, because Back at the root is a **quit**
 * and not a tab close: it asks about every open document at once, which is what
 * its doc comment and `DocumentList.unsaved` were both written for and what
 * nothing had called until now. Three prompts in a row is how somebody taps
 * "discard" on the one they meant to keep.
 *
 * Registered through `useFocusEffect`, which is the whole of "do not hijack
 * Back anywhere else": `BackHandler` subscriptions are global and run newest
 * first, so a listener left registered while Settings or Docs is on top would
 * swallow the pop that should take the reader back to the editor. Losing focus
 * removes it and React Navigation's own handler pops as it always did. An open
 * sheet needs no allowance either — a React Native `Modal` is a dialog holding
 * the window's focus, so Android hands Back to its `onRequestClose` and these
 * listeners never run.
 *
 * iOS and macOS have no hardware Back. `BackHandler.addEventListener` is a
 * no-op there rather than an error, so this costs them a subscription and
 * nothing else, and there is no platform branch to keep in step.
 */
import { useCallback, useState } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { decideQuit } from '@sudobility/music_lib';
import { ConfirmSheet } from '@sudobility/music_ui_rn';
import { useDocumentList } from '@/documents/DocumentsContext';

/** What the prompt names, taken off the stores the guard was given. */
type Unsaved = { title: string };

export function UnsavedQuitGuard() {
  const { t } = useTranslation();
  const list = useDocumentList();
  const [asking, setAsking] = useState<readonly Unsaved[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      const onBack = (): boolean => {
        /*
          The *states*, not the documents: `decideQuit` is generic over
          anything carrying `dirty`, and the state is also what holds the
          title the prompt names — the same shape `DocumentTabs` hands
          `decideClose`.
        */
        const decision = decideQuit(
          list.state.documents.map(document => document.store.getState()),
        );
        // Nothing to lose: let Android finish the activity as it would have.
        if (decision.kind === 'close') return false;
        setAsking(decision.documents.map(state => ({ title: state.title })));
        return true;
      };
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onBack,
      );
      return () => subscription.remove();
    }, [list]),
  );

  const count = asking?.length ?? 0;
  return (
    <ConfirmSheet
      open={asking !== null}
      title={t('document.unsavedTitle')}
      message={
        count === 1
          ? t('document.unsavedBody', { title: asking?.[0]?.title ?? '' })
          : t('document.unsavedQuitBody', { count })
      }
      confirmLabel={t('document.quitWithoutSaving')}
      destructive
      onCancel={() => setAsking(null)}
      /*
        Leaves, rather than dismissing and waiting for a second Back: the
        reader answered the question Back asked, and asking them to press it
        again would read as the prompt having failed. `exitApp` is what Back
        would have done had nothing been dirty.
      */
      onConfirm={() => {
        setAsking(null);
        BackHandler.exitApp();
      }}
    />
  );
}
