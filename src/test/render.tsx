/**
 * The scaffolding a component test needs, in one place.
 *
 * Two things every rendered component here depends on and neither of which a
 * test should have to remember: i18n (without it every label renders as its own
 * key, so an assertion on visible text checks nothing) and a document to edit.
 * `renderWithApp` provides the first; `testDocument` builds the second.
 */
import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react-native';
import { PortalHost } from '@sudobility/components-rn';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigatorProvider } from '@sudobility/music_ui_rn';
import type { MusicNavigator } from '@sudobility/music_lib';

/** A no-op navigator so shared UI's `useNavigator()` resolves under test. */
const stubNavigator: MusicNavigator = {
  go: () => {},
  replace: () => {},
  back: () => {},
  current: () => null,
};
import { createEmptyScore } from '@sudobility/music_types';
import { createDocumentStore } from '@sudobility/music_lib';
import { asDocument } from '@/documents/document';
import type { MusicDocument } from '@/documents/document';
import { initializeI18n } from '@/i18n';
import {
  appServicesInstalled,
  installTestAppServices,
} from '@/config/initialize';

let started = false;

/** A document over an eight-bar empty score, the app's own new-score shape. */
export function testDocument(
  options: { measures?: number; title?: string } = {},
): MusicDocument {
  return asDocument(
    createDocumentStore({
      title: options.title ?? 'Test',
      score: createEmptyScore({
        title: options.title ?? 'Test',
        measures: options.measures ?? 8,
      }),
    }),
    'test',
  );
}

/** Renders with i18n started. Pass a `navigator` to assert navigation. */
export function renderWithApp(
  ui: ReactElement,
  options: { navigator?: MusicNavigator } = {},
) {
  const navigator = options.navigator ?? stubNavigator;
  if (!started) {
    // Once per process: i18next is a singleton and re-initialising it mid-run
    // drops the resources every earlier test resolved against.
    initializeI18n(['en']);
    started = true;
  }
  /*
    Stand-ins rather than a real audio engine, and only when a test has not
    installed its own — a caller that injected a recording player must not have
    it replaced here. Guarding on `started` instead broke exactly one test per
    file: the first, which is the only one where this branch ran.
  */
  if (!appServicesInstalled()) installTestAppServices();
  /*
    `PortalHost`, exactly as `App.tsx` mounts it. Anything that opens a sheet
    portals its overlay to the root rather than rendering it in place — so
    without a host here that overlay renders nowhere, and a test asserting on
    it fails while the app works.

    Passed as RTL's `wrapper` rather than wrapped around `ui` by hand: a
    caller's `rerender(<Thing/>)` passes the bare element, which would replace
    the hand-written wrapper and unmount everything under it. `wrapper` is
    re-applied on every rerender, which is what makes it survive.

    The cost is that the tree is no longer empty when a component draws
    nothing — the host itself is always there — so "rendered nothing" is an
    assertion about its children.
  */
  /*
    A React Query client, exactly as `App.tsx` mounts one.

    Anything that reads server data through a hook throws "No QueryClient set"
    without it — which takes the whole render down rather than leaving a value
    missing, so a component that merely *might* ask the server would otherwise
    break every test that renders it.

    Fresh per render with retries off: a retrying query turns a deliberate
    failure into a slow one, and a cache shared between tests is a test that
    passes because of what the last one fetched.
  */
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <NavigatorProvider value={navigator}>
        <PortalHost>{children}</PortalHost>
      </NavigatorProvider>
    </QueryClientProvider>
  );
  return render(ui, { wrapper });
}
