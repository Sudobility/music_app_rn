/**
 * Starting a new score, with or without a model writing it.
 *
 * The twin of the web's `NewProjectDialog`, over the same draft reducer and the
 * same two music_lib builders — so the toggle decides only which builder runs,
 * and the two apps cannot disagree about what a new project is. The state and
 * the rules live in `useNewProjectForm`, shared with the desktop Projects
 * window's inline `NewPane.tsx`; this is the modal shell around it.
 *
 * It emits a *decision*, not a project. Where that lands is the caller's: the
 * dashboard makes a project on the server, and the macOS File menu makes a
 * local document — which is why generation can be switched off entirely.
 */
import { useEffect } from 'react';
import { publicServerContext } from '@/config/server';
import { useTranslation } from 'react-i18next';
import { FormModal } from '@sudobility/components-rn';
import type { NewProjectSubmission } from '@sudobility/music_lib';
import { ScoreSetupFields } from '@sudobility/music_ui_rn';
import { trackButtonClick } from '@/analytics';
import { GenerateToggle } from './GenerateToggle';
import { useNewProjectForm, type NewProjectAccount } from './useNewProjectForm';

export type NewProjectSheetProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (submission: NewProjectSubmission) => void;
  submitting?: boolean;
  /**
   * Who is asking — signed in, a server, the balance, site administrator —
   * decided by the caller and handed to music_lib's credit rules.
   *
   * Passed in rather than looked up here: reading it would drag the auth
   * provider, and Firebase with it, into a form for choosing a key signature,
   * and a form that cannot render in a test is a form nobody tests.
   *
   * From the macOS File menu a blank score is a local document, but a
   * generated one is still a server project, so generation is offered there
   * on exactly the same terms.
   */
  account: NewProjectAccount;
  /** Opens Credits; offered beside a refusal for want of credits. */
  onOpenCredits?: () => void;
  /**
   * Switches Generate on each time the sheet opens. For a store screenshot
   * (`ScreenshotLinks.tsx`); the toggle is otherwise the reader's.
   */
  generate?: boolean;
};

function ignore(): void {}

export function NewProjectSheet({
  open,
  onClose,
  onSubmit,
  submitting = false,
  account,
  onOpenCredits,
  generate = false,
}: NewProjectSheetProps) {
  const { t } = useTranslation();
  const newProject = useNewProjectForm({ submitting, account, onSubmit });
  const {
    form,
    dispatch,
    generating,
    generationAvailable,
    setGenerating,
    canCreate,
    handleCreate,
  } = newProject;
  /*
    Through the toggle's own handler, so it adds the singer the toggle adds —
    and only when off, since switching it on twice would add a second one.
    On opening, and again if generation becomes available while open (a
    sign-in landing after the sheet did) — not on every render, since the
    reader may switch it off again.
  */
  useEffect(() => {
    if (open && generate && !generating) setGenerating(true);
  }, [open, generate, generationAvailable]);

  return (
    <FormModal
      visible={open}
      title={t('newProject.title')}
      // While Create spins the sheet stays up: nothing on it answers until
      // the project exists (or was refused), Android's Back included.
      onClose={submitting ? ignore : onClose}
      saving={submitting}
      size="large"
      closeAriaLabel={t('common.closeDialog')}
      actions={[
        {
          label: t('common.cancel'),
          onPress: onClose,
          variant: 'ghost',
          disabled: submitting,
        },
        {
          label: t('dashboard.create'),
          onPress: () => {
            trackButtonClick('create_project', { generate: generating });
            handleCreate();
          },
          disabled: !canCreate,
          loading: submitting,
        },
      ]}
    >
      {/* No ScrollView of its own: FormModal's body already scrolls, and a
          second one nested inside it grew to its content and never scrolled. */}
      <ScoreSetupFields
        draft={form}
        dispatch={dispatch}
        serverContext={publicServerContext()}
        generateToggle={
          <GenerateToggle
            form={newProject}
            {...(onOpenCredits ? { onOpenCredits } : {})}
          />
        }
      />
    </FormModal>
  );
}
