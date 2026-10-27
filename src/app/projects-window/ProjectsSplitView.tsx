/**
 * Projects, as master and detail: a list and whichever pane it has
 * selected — see `paneKey.ts` for the set and `ProjectsSidebar.tsx` for
 * why Connect and My Projects are one slot, not two. The split view is
 * `sudojo_app_rn`'s (`SplitViewContainer`), as its Techniques tab uses it:
 * the list under a navigation bar of its own, and the chosen pane beside it
 * under another.
 *
 * One component in two places. On macOS and Windows it is the content of the
 * separate Projects window (`ProjectsWindow.tsx`); on iOS and Android it is
 * the Projects tab (`ProjectsScreen.tsx`). What differs is what happens once
 * a project is open, so that is the caller's: `onProjectOpened` and
 * `onOpenCredits`.
 *
 * **Left by opening a project, never by anything drawn here.** New,
 * Template, an existing project chosen from My Projects, and every format
 * under Import all funnel through `onProjectOpened` — on a desktop it
 * focuses the main window and dismisses this one, under a tab bar it pushes
 * the editor — so picking a project always lands the reader somewhere they
 * can see it. Signing in is deliberately not on that list: it only swaps
 * which slot the sidebar's first item is.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormModal, Text } from '@sudobility/components-rn';
import type { ProjectTemplate } from '@sudobility/music_lib';
import type { NewProjectSubmission } from '@/features/projects/useNewProjectForm';
import { newDocument, openProjectInto } from '@/documents/document';
import {
  useActiveDocument,
  useDocumentList,
  useDocumentServices,
  useDocuments,
} from '@/documents/DocumentsContext';
import {
  ServerProjectCreationFeedback,
  useServerProjectCreation,
} from '@/features/projects/useServerProjectCreation';
import { useAuth } from '@/auth/AuthContext';
import { useServerContext } from '@/config/useServerContext';
import {
  SplitPanel,
  SplitViewContainer,
} from '@/components/layout/SplitViewContainer';
import { SignInPage } from '@/features/account/SignInPage';
import { useSingleDocumentGuard } from '@/features/documents/useSingleDocumentGuard';
import { ProjectsSidebar, paneLabelKey } from './ProjectsSidebar';
import { MyProjectsPane } from './MyProjectsPane';
import { NewPane } from './NewPane';
import { TemplatePane } from './TemplatePane';
import { ImportPane } from './ImportPane';
import { OpenDocumentsPane } from './OpenDocumentsPane';
import type { PaneKey } from './paneKey';
import { usePendingAction } from '@/components/controls/usePendingAction';

export type ProjectsSplitViewProps = {
  /** A document was opened, and is the active one: show it. */
  onProjectOpened: () => void;
  /** The reader is out of credits and asked where to get more. */
  onOpenCredits: () => void;
  /**
   * A pane asked for from outside — the editor's popup of this sidebar.
   * `at` tells one request from the next: asking for the same pane twice is
   * two requests, and the second must win over a choice made in between.
   */
  requested?: { pane: PaneKey; at: number } | undefined;
  /**
   * Whether one project is open at a time, as under a tab bar. The open one
   * is then offered in the list (`paneKey.ts`), and opening another asks
   * before it closes work that has nowhere to be saved.
   */
  single?: boolean;
  /**
   * Whether the split view collapses to one column where the window is narrow
   * — the Projects tab on a phone in portrait. Off for the desktop Projects
   * window and the editor's popup, which are only ever shown wide.
   */
  collapsible?: boolean;
};

export function ProjectsSplitView({
  onProjectOpened: projectOpened,
  onOpenCredits,
  requested,
  single = false,
  collapsible = false,
}: ProjectsSplitViewProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const serverContext = useServerContext();
  const list = useDocumentList();
  const services = useDocumentServices();
  // Unused directly, but reading it keeps this component subscribed to the
  // same document-list changes `useActiveDocument` consumers elsewhere react
  // to — cheap insurance against a future pane needing "what's open" without
  // remembering to add the subscription back.
  useActiveDocument();
  const creation = useServerProjectCreation();
  // Create spins from the press until the new project is open: the creation
  // and the read of what it made are one wait.
  const creatingNew = usePendingAction();
  const runCreateNew = creatingNew.run;
  const signedIn = user !== null;
  /*
    Signed in, the reader's own projects are what they came for, so the list
    opens on My Projects; signed out there are none, and New is the start.
    The session is often restored a moment after mount, so until the reader
    picks something themselves the selection follows it rather than staying
    on whatever the first render guessed.
  */
  const homePane: PaneKey = signedIn ? 'myProjects' : 'new';
  const [selected, setSelectedState] = useState<PaneKey>(homePane);
  const [picked, setPicked] = useState(false);
  const setSelected = useCallback((pane: PaneKey) => {
    setPicked(true);
    setSelectedState(pane);
  }, []);
  useEffect(() => {
    if (!picked) setSelectedState(homePane);
  }, [picked, homePane]);
  const [failure, setFailure] = useState<string | null>(null);

  // A model writes into a project on the server, so generating needs an
  // account with a server behind it — and credits, by music_lib's rules. The
  // same account `MenuFileCommands`'s File-menu New hands its sheet.
  const newProjectAccount = {
    ...creation.account,
    serverAvailable: serverContext !== null,
  };

  /*
    Keeps the sidebar's first slot pointed at whichever half of it is valid
    right now, rather than leaving a reader looking at a Connect pane they
    just used, or a My Projects pane behind a session that just ended.
  */
  useEffect(() => {
    // Until the reader picks, `homePane` above already follows the session.
    if (!picked) return;
    if (signedIn && selected === 'connect') setSelectedState('myProjects');
    if (!signedIn && selected === 'myProjects') setSelectedState('connect');
  }, [picked, signedIn, selected]);

  const requestedPane = requested?.pane;
  const requestedAt = requested?.at;
  useEffect(() => {
    if (requestedPane !== undefined) setSelected(requestedPane);
  }, [requestedPane, requestedAt]);

  const { documents } = useDocuments();
  /*
    Not offered when signed in: the open project is one of the reader's own,
    and My Projects already lists it — two entries leading to one project.
  */
  const offersOpen = single && documents.length > 0 && !signedIn;
  const { guard, prompt } = useSingleDocumentGuard(single);
  // The last open document was closed while its pane was showing, or the
  // reader signed in and the pane went away.
  useEffect(() => {
    if (!offersOpen && selected === 'open') setSelectedState(homePane);
  }, [offersOpen, selected, homePane]);

  const openExisting = useCallback(
    (id: string) => {
      openProjectInto(list, services, id)
        .then(() => projectOpened())
        .catch((error: unknown) =>
          setFailure(error instanceof Error ? error.message : String(error)),
        );
    },
    [list, services, projectOpened],
  );

  const submitNew = useCallback(
    (submission: NewProjectSubmission) => {
      if (submission.kind === 'blank') {
        list.open(
          newDocument(services, {
            score: submission.score,
            title: submission.title,
          }),
        );
        projectOpened();
        return;
      }
      void runCreateNew(async () => {
        const projectId = await creation.create(submission);
        if (projectId === null) return;
        try {
          await openProjectInto(list, services, projectId);
          projectOpened();
        } catch (error) {
          setFailure(error instanceof Error ? error.message : String(error));
        }
      });
    },
    [list, services, creation, projectOpened, runCreateNew],
  );

  const chooseTemplate = useCallback(
    (template: ProjectTemplate) => {
      list.open(
        newDocument(services, {
          score: template.build(),
          title: template.name,
        }),
      );
      projectOpened();
    },
    [list, services, projectOpened],
  );

  return (
    // Paints the root itself (`SplitView`'s `bg-background`): nothing did
    // before, so the native window's own default colour showed everywhere a
    // pane didn't paint its own (only `ScreenScaffold`'s `ScrollView` did,
    // which is why Connect's sign-in box looked like a different colour from
    // the window around it, rather than every pane looking that way equally).
    <>
      <SplitViewContainer
        collapsible={collapsible}
        primaryPanel={
          <SplitPanel title={t('nav.projects')}>
            <ProjectsSidebar
              selected={selected}
              signedIn={signedIn}
              showOpen={offersOpen}
              onSelect={setSelected}
            />
          </SplitPanel>
        }
        secondaryPanel={
          <SplitPanel secondary title={t(paneLabelKey(selected))}>
            {selected === 'connect' ? (
              // Connect is where a reader goes in order to sign in, so it is
              // the page (`LoginPage`), which brings its own scrolling.
              <SignInPage />
            ) : null}
            {selected === 'myProjects' ? (
              <MyProjectsPane onOpen={id => guard(() => openExisting(id))} />
            ) : null}
            {selected === 'new' ? (
              <NewPane
                account={newProjectAccount}
                submitting={creatingNew.pending}
                onOpenCredits={onOpenCredits}
                onSubmit={submission => guard(() => submitNew(submission))}
              />
            ) : null}
            {selected === 'template' ? (
              <TemplatePane
                onChoose={template => guard(() => chooseTemplate(template))}
              />
            ) : null}
            {selected === 'import' ? (
              <ImportPane onOpened={projectOpened} guard={guard} />
            ) : null}
            {selected === 'open' ? (
              <OpenDocumentsPane
                onOpen={document => {
                  list.activate(document.id);
                  projectOpened();
                }}
              />
            ) : null}
          </SplitPanel>
        }
      />
      {prompt}
      <ServerProjectCreationFeedback
        creation={creation}
        onOpenCredits={onOpenCredits}
      />
      <FormModal
        visible={failure !== null}
        title={t('errors.openProject')}
        onClose={() => setFailure(null)}
        onSave={() => setFailure(null)}
        saveLabel={t('common.ok')}
        closeAriaLabel={t('common.closeDialog')}
      >
        <Text className="text-foreground text-base">{failure}</Text>
      </FormModal>
    </>
  );
}
