/**
 * Which right-hand pane `ProjectsSplitView` shows — shared with
 * `ProjectsSidebar.tsx` so the two cannot disagree about the set.
 *
 * `open` is the documents already open in the editor. It is offered only
 * under a tab bar, where leaving the editor leaves them behind a screen with
 * no other way back; a desktop build keeps its editor window in view. And
 * only signed out: signed in, the open project is in My Projects already.
 */
export type PaneKey =
  'connect' | 'myProjects' | 'open' | 'new' | 'template' | 'import';
