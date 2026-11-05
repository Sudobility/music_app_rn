/**
 * The Projects split view's list — its primary panel.
 *
 * Connect and My Projects are the same slot, not two items: signed out, the
 * slot says Connect and opens the sign-in pane; signed in, it says My
 * Projects and opens the list — `ProjectsSplitView` decides which by
 * `signedIn` alone, so the two can never both be selectable, and a reader
 * who was looking at Connect the moment they finished signing in lands on
 * My Projects rather than a pane that no longer applies to them.
 */
import { useTranslation } from 'react-i18next';
import { SplitMenuList } from '@sudobility/components-rn';
import type { PaneKey } from './paneKey';

export type ProjectsSidebarProps = {
  /** Null where nothing is selected: the editor's popup, which shows no pane. */
  selected: PaneKey | null;
  signedIn: boolean;
  /** Whether to offer the documents open in the editor — see `paneKey.ts`. */
  showOpen?: boolean;
  onSelect: (pane: PaneKey) => void;
};

/** What each pane is called in the list, and above the pane itself. */
export function paneLabelKey(pane: PaneKey): string {
  return PANE_LABEL[pane];
}

/** A record, so a pane added to the set fails to compile without a name. */
const PANE_LABEL: Record<PaneKey, string> = {
  connect: 'dashboard.connect',
  myProjects: 'dashboard.myProjects',
  open: 'dashboard.openDocuments',
  new: 'newProject.title',
  template: 'dashboard.newFromTemplateAction',
  import: 'dashboard.import',
};

export function ProjectsSidebar({
  selected,
  signedIn,
  showOpen = false,
  onSelect,
}: ProjectsSidebarProps) {
  const { t } = useTranslation();
  const panes: PaneKey[] = [
    signedIn ? 'myProjects' : 'connect',
    ...(showOpen ? (['open'] as const) : []),
    'new',
    'template',
    'import',
  ];

  return (
    <SplitMenuList
      label={t('nav.projects')}
      entries={panes.map(pane => ({ id: pane, label: t(PANE_LABEL[pane]) }))}
      selected={selected}
      onSelect={id => onSelect(id as PaneKey)}
    />
  );
}
