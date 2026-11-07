/**
 * The desktop Projects window's New pane — the same form `NewProjectSheet`
 * shows as a modal (phone/tablet, and the macOS File menu's New), inline
 * instead, over the same `useNewProjectForm`. A blank project stays local
 * with nothing connected; a generated one needs the server and an account,
 * and the credit rules are music_lib's, so the toggle and Create are refused
 * exactly where `NewProjectSheet`'s are, with the same explanation under the
 * switch (`GenerateToggle`).
 */
import { ScrollView, View } from 'react-native';
import { publicServerContext } from '@/config/server';
import { useTranslation } from 'react-i18next';
import { Button } from '@sudobility/components-rn';
import { ScoreSetupFields } from '@sudobility/music_ui_rn';
import { GenerateToggle } from '@/features/projects/GenerateToggle';
import {
  useNewProjectForm,
  type NewProjectAccount,
  type NewProjectSubmission,
} from '@/features/projects/useNewProjectForm';
import {
  useDetailScroll,
  AboveTabBar,
} from '@/components/layout/detail-safe-area';

export type NewPaneProps = {
  account: NewProjectAccount;
  submitting: boolean;
  /** Opens Credits; offered beside a refusal for want of credits. */
  onOpenCredits?: () => void;
  onSubmit: (submission: NewProjectSubmission) => void;
};

export function NewPane({
  account,
  submitting,
  onOpenCredits,
  onSubmit,
}: NewPaneProps) {
  const { t } = useTranslation();
  const newProject = useNewProjectForm({ submitting, account, onSubmit });
  const { form, dispatch, canCreate, handleCreate } = newProject;
  // The form scrolls (full-bleed + scroll inset + safe-area sides); the Create
  // bar below it does not, so it is laid out inside the tab content's safe area
  // (`AboveTabBar`) and stops above the bar rather than running behind it.
  const body = useDetailScroll({ gap: 12 });

  return (
    // The whole pane sits inside the tab content's safe area, so its bottom is
    // the top of the tab bar: the form scrolls above the pinned Create bar, and
    // the bar stops above the tab bar rather than behind it. `AboveTabBar` is a
    // flex-1 view (react-native-screens' own), so it wraps the flex-1 pane, not
    // the footer row alone.
    <AboveTabBar>
      <View className="flex-1">
        <ScrollView
          {...body}
          className="flex-1"
          accessibilityLabel={t('newProject.title')}
        >
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
        </ScrollView>

        {/*
          Sticky footer, outside the ScrollView — the same shape `FormModal`'s
          own `actions` footer gives every sheet-based form (Create pinned below
          scrollable content, never scrolling away with it).
        */}
        <View className="bg-background border-border border-t px-6 py-4">
          <Button
            onPress={handleCreate}
            disabled={!canCreate}
            loading={submitting}
          >
            {t('dashboard.create')}
          </Button>
        </View>
      </View>
    </AboveTabBar>
  );
}
