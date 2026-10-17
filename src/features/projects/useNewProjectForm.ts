/**
 * The New Project form's state and rules, shared by the sheet
 * (`NewProjectSheet.tsx`, phone/tablet and the macOS File menu) and the
 * desktop Projects window's inline New pane (`NewPane.tsx`) — extracted so
 * two surfaces asking "what should a new project be?" cannot answer it
 * differently. Over the same draft reducer and the same two music_lib
 * builders the web's `NewProjectDialog` uses, so all three apps agree.
 */
import { useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import {
  initialNewProjectDraft,
  newProjectCreditState,
  newProjectDefaultTitleKey,
  newProjectSubmission,
  reduceNewProjectDraft,
} from '@sudobility/music_lib';
import type {
  NewProjectAccountState,
  NewProjectDraftAction,
  NewProjectFormDraft,
  NewProjectSubmission,
} from '@sudobility/music_lib';

const reducer = (
  draft: NewProjectFormDraft,
  action: NewProjectDraftAction,
): NewProjectFormDraft => reduceNewProjectDraft(draft, action);

/**
 * Who is asking, for New Project's credit rules: signed in, whether there is
 * a server, the balance (null while unknown) and whether they are a site
 * administrator. The caller knows; the form only hands it to music_lib.
 */
export type NewProjectAccount = Omit<NewProjectAccountState, 'submitting'>;

export type UseNewProjectFormOptions = {
  submitting?: boolean;
  account: NewProjectAccount;
  onSubmit: (submission: NewProjectSubmission) => void;
};

export function useNewProjectForm({
  submitting = false,
  account,
  onSubmit,
}: UseNewProjectFormOptions) {
  const { t, i18n } = useTranslation();
  // Open the lyric language on the reader's working language, so a Chinese UI
  // writes Chinese words by default; undefined would mean English regardless.
  // The reader can still change it on the form.
  const [draft, dispatch] = useReducer(reducer, undefined, () => ({
    ...initialNewProjectDraft(),
    lyricsLanguage: (i18n.language.startsWith('zh') ? 'zh' : 'en') as
      | 'en'
      | 'zh',
  }));
  /*
    Every credit rule — whether "Generate for me" may be switched on, whether
    Create is offered, and what to say about either — is music_lib's
    `newProjectCreditState`, the same call the web dialog makes. Nothing here
    decides any of it.

    Its `generating` is the draft's own *and* the switch being available, so a
    draft left switched on (a session that ended while the sheet was open)
    stops counting the moment it may not, and the submission below is built
    from the effective form.
  */
  const credit = newProjectCreditState(draft, { ...account, submitting });
  const { generating, generationAvailable, canCreate } = credit;
  const form: NewProjectFormDraft = generating
    ? draft
    : { ...draft, generating: false };

  const setGenerating = (next: boolean): void =>
    dispatch({
      type: 'setGenerating',
      generating: next && generationAvailable,
    });

  const handleCreate = (): void => {
    if (!canCreate) return;
    /*
      The default title names the *project*: it rides on a generation
      request, and is a blank project's title while the score itself still
      says "Untitled" — the score's title and the project's name are
      different things.
    */
    const submission = newProjectSubmission(
      form,
      t(newProjectDefaultTitleKey(form)),
    );
    if (submission) onSubmit(submission);
  };

  return {
    form,
    dispatch,
    generating,
    generationAvailable,
    setGenerating,
    credit,
    canCreate,
    handleCreate,
  };
}

export type NewProjectFormState = ReturnType<typeof useNewProjectForm>;
export type { NewProjectSubmission };
