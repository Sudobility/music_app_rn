/**
 * Projects on the server — the web app's dashboard.
 *
 * Every import in the web app ends in `newProject(...)` and a navigation, which
 * is why they live on the dashboard rather than in the editor's own title bar:
 * an Import menu inside a project could only throw you out of the project you
 * had open. The same reasoning holds here.
 *
 * The *project list* requires a server and an account, and says which is
 * missing rather than showing an empty list either way. **Import does not, and
 * used to be gated behind both.** MIDI, MusicXML and a tracker module are
 * decoded on the device by `useImport` and become a local document; nothing
 * about them needs a row on a server. They were inside `ProjectList`, which
 * only renders for a signed-in user with a server configured — and since this
 * app opens straight into a scratch document, the empty state in `EditorScreen`
 * that also carries them is never reached. Measured on Android: a signed-out
 * install could not open a file of any kind, on a build whose whole premise
 * (`App.tsx` has no auth gate) is that a local document needs no account.
 * Audio is the one exception and stays behind the gate, because it is
 * transcribed server-side.
 */
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/Navigation';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@sudobility/components-rn';
import { Spinner } from '@sudobility/music_ui_rn';
import { ProjectTiles } from '@/features/projects/ProjectTiles';
import { useProjects } from '@sudobility/music_client';
import type { NewProjectSubmission } from '@sudobility/music_lib';
import { useAuth } from '@/auth/AuthContext';
import { getMusicClient } from '@/config/server';
import type { NativeUploadFile } from '@sudobility/music_client';
import { useServerContext } from '@/config/useServerContext';
import { ImportButtons } from '@/features/documents/ImportButtons';
import { NewProjectSheet } from '@/features/projects/NewProjectSheet';
import {
  ServerProjectCreationFeedback,
  useServerProjectCreation,
} from '@/features/projects/useServerProjectCreation';
import { SyncToServerButton } from '@/features/documents/SyncToServerButton';
import { ScreenScaffold, ServerUnavailable } from './ScreenScaffold';
import { SignInRequired } from '@/features/account/SignInRequired';
import { usePendingAction } from '@sudobility/music_ui_rn';

export type DashboardScreenProps = {
  /**
   * Overrides how opening a project is handled. Defaults to navigating this
   * screen's own stack to `Editor` — the phone/tablet route, where Dashboard
   * is a screen in the same navigator as the one it opens into.
   *
   * The desktop Projects window (`ProjectsWindow.tsx`) passes one: it has no
   * `Editor` screen of its own — it is a *separate* native window from the
   * one that does — so "opening" a project there means activating it in the
   * document list both windows share and bringing the other window forward,
   * not a navigation this stack could perform.
   */
  onOpenProject?: (id: string) => void;
};

export function DashboardScreen({ onOpenProject }: DashboardScreenProps = {}) {
  const { t } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const context = useServerContext();

  const openProject = useCallback(
    (id: string) =>
      onOpenProject
        ? onOpenProject(id)
        : navigation.navigate('Editor', { projectId: id }),
    [navigation, onOpenProject],
  );

  if (!context) {
    return (
      <ScreenScaffold title={t('nav.projects')}>
        {/*
          Above the gate on purpose: a MIDI, MusicXML or module file is decoded
          here and becomes a local document, so it is available with no server
          and no account. `onTranscribeAudio` is left off, which is what makes
          the sheet say a recording cannot be transcribed rather than offering
          a button that fails.
        */}
        <ImportButtons />
        <ServerUnavailable />
      </ScreenScaffold>
    );
  }
  if (!user) {
    return (
      <ScreenScaffold title={t('nav.projects')}>
        <ImportButtons />
        {/* Over this screen, not a route away: once signed in, the list is
            what this screen shows. */}
        <SignInRequired />
      </ScreenScaffold>
    );
  }
  return (
    <ProjectList
      context={context}
      onOpen={openProject}
      onOpened={openProject}
      onOpenCredits={() => navigation.navigate('Credits')}
    />
  );
}

function ProjectList({
  context,
  onOpen,
  onOpened,
  onOpenCredits,
}: {
  context: NonNullable<ReturnType<typeof useServerContext>>;
  onOpen: (id: string) => void;
  /** Opens the project a finished upload created. */
  onOpened: (id: string) => void;
  onOpenCredits: () => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isFetching, error, refetch } = useProjects(context);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  /**
   * Turns what the sheet asked for into a project on the server, then opens it.
   *
   * The same shape as the web dashboard's, including the rule that a refused
   * job **deletes the project it just created** (`createServerProject`), that
   * a 402 opens the paywall rather than failing silently, and that the sheet
   * closes either way (`useServerProjectCreation`).
   */
  const creation = useServerProjectCreation();
  const { create } = creation;
  /*
    Create spins from the press until the project is in the list and about to
    open — the list's refetch is part of the wait — and the sheet stays up
    meanwhile, so the reader is never left looking at nothing happening.
  */
  const creating = usePendingAction();
  const runCreate = creating.run;
  const createProject = useCallback(
    (submission: NewProjectSubmission) =>
      runCreate(async () => {
        const projectId = await create(submission);
        if (projectId !== null) await refetch();
        setNewProjectOpen(false);
        if (projectId !== null) onOpened(projectId);
      }),
    [create, refetch, onOpened, runCreate],
  );

  /**
   * Uploads a recording and opens the project it becomes.
   *
   * The project is created in a `transcribing` state and this goes straight
   * to it, as a generation does and for the same reason: the editor watches
   * the project's live stream, where each part lands in the score as the
   * transcriber finishes it, under a strip naming the part being worked on.
   * The place to wait is in front of the score, not on a row with a badge.
   */
  const transcribeAudio = useCallback(
    async (file: NativeUploadFile) => {
      const client = getMusicClient();
      // Read now rather than at render: the button is only offered with a
      // server behind it, but the session can still have ended since.
      const token = await context.getToken?.();
      if (!client || !token) return;
      const project = await client.transcribeAudio(file, file.name, token);
      await refetch();
      onOpened(project.id);
    },
    [context, refetch, onOpened],
  );

  if (isLoading) {
    return (
      <ScreenScaffold title={t('nav.projects')}>
        <View className="items-center py-8">
          <Spinner />
        </View>
      </ScreenScaffold>
    );
  }
  if (error) {
    return (
      <ScreenScaffold title={t('nav.projects')}>
        <Text className="text-destructive">{t('errors.loadProjects')}</Text>
        <Button loading={isFetching} onPress={() => void refetch()}>
          {t('library.retry')}
        </Button>
      </ScreenScaffold>
    );
  }

  const projects = data ?? [];
  return (
    <View className="bg-background flex-1">
      <ProjectTiles
        projects={projects}
        context={context}
        onOpen={onOpen}
        header={
          <View className="gap-3 pb-2">
            <Button onPress={() => setNewProjectOpen(true)}>
              {t('dashboard.newProject')}
            </Button>
            {/*
              Import lives here because every import makes a *new* document:
              an Import control inside a project could only throw you out of
              the project you had open.
            */}
            <ImportButtons onTranscribeAudio={transcribeAudio} />
            <SyncToServerButton />
          </View>
        }
      />
      <NewProjectSheet
        open={newProjectOpen}
        submitting={creating.pending}
        // Only reached with a server context, so there is a server.
        account={{ ...creation.account, serverAvailable: true }}
        onOpenCredits={() => {
          setNewProjectOpen(false);
          onOpenCredits();
        }}
        onClose={() => setNewProjectOpen(false)}
        onSubmit={submission => void createProject(submission)}
      />
      <ServerProjectCreationFeedback
        creation={creation}
        onOpenCredits={onOpenCredits}
      />
    </View>
  );
}
