/**
 * The Projects tab: the split view, under a tab bar.
 *
 * The same master and detail the desktop Projects window shows
 * (`ProjectsSplitView`), with the one thing that differs supplied here — an
 * opened project pushes the editor above the tabs, which is what takes the
 * tab bar and the sidebar off the screen and gives the score all of it.
 */
import { useEffect } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '@/app/Navigation';
import { ProjectsSplitView } from '@/app/projects-window/ProjectsSplitView';
import { trackScreenView } from '@/analytics';

export function ProjectsScreen() {
  useEffect(() => {
    trackScreenView('ProjectsScreen');
  }, []);

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<MainTabParamList, 'Dashboard'>>();
  const pane = route.params?.pane;

  return (
    <ProjectsSplitView
      single
      collapsible
      requested={pane ? { pane, at: route.params?.at ?? 0 } : undefined}
      // With a project id, the editor route opens it and shows a loader while
      // it reads, so the click navigates at once instead of waiting on the
      // fetch; with none (a blank, template or import) the document is already
      // open and active, and the editor shows whichever one that is.
      onProjectOpened={projectId =>
        navigation.navigate('Editor', projectId ? { projectId } : undefined)
      }
      onOpenCredits={() => navigation.navigate('Credits')}
    />
  );
}
