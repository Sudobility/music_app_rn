/**
 * The documentation screen, master–detail over `DOCS_TOPICS`.
 *
 * Two things here are worth pinning. The first is that the topic list is the
 * shared structure and not a hand-kept copy: a topic added for the web that
 * never appears here is documentation a reader on this platform simply cannot
 * reach, and nothing fails when that happens.
 *
 * The second is the live-data widget. The instrument section is *built from the
 * GM catalogue* rather than described in prose, because prose about a table is
 * a copy of that table and goes stale the first time an instrument is
 * regrouped. If the widget silently stopped rendering, the section would still
 * look complete — a heading, a summary, and nothing under it — so the test
 * asserts a catalogue row actually appears under the topic that declares it.
 *
 * The screen is driven by its own route: the selected topic is the `topicId`
 * route param, so a deep link to `docs/:topicId` opens that topic. The tests
 * therefore mount it in a navigator and set the param through it.
 *
 * Expected text is resolved through i18next rather than matched as a raw key:
 * `renderWithApp` starts i18n with the real English resources, so the screen
 * renders translated copy and asserting on `docs.editor.title` would find
 * nothing.
 */
import i18next from 'i18next';
import { fireEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { gmInstrumentRows } from '@sudobility/music_types';
import { renderWithApp } from '@/test/render';
import { DocsScreen } from './DocsScreen';
import { DOCS_GROUPS } from '@sudobility/music_types';
import { DOCS_TOPICS, docsGroupLabelKey } from '@sudobility/music_lib';

/** The visible string for a key; i18n is started by the first render. */
const label = (key: string): string => i18next.t(key);

const Stack = createNativeStackNavigator();

/**
 * DocsScreen reads its selection from the `topicId` route param, so it is
 * mounted in a navigator; `topicId` seeds it, the way a deep link would.
 */
function renderDocs(topicId?: string) {
  return renderWithApp(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Docs"
          component={DocsScreen}
          initialParams={topicId ? { topicId } : undefined}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>,
  );
}

describe('DocsScreen', () => {
  it('lists every shared topic', () => {
    const view = renderDocs();
    expect(DOCS_TOPICS.length).toBeGreaterThan(0);
    const missing = DOCS_TOPICS.filter(
      topic => view.queryAllByText(label(topic.title)).length === 0,
    ).map(topic => topic.id);
    expect(missing).toEqual([]);
  });

  it('heads the topic list with the shared groups, in words', () => {
    // The web's master list is grouped; this one was a flat run of topics.
    const view = renderDocs();
    for (const group of DOCS_GROUPS) {
      const key = docsGroupLabelKey(group);
      expect(i18next.exists(key)).toBe(true);
      expect(view.queryAllByText(label(key)).length).toBeGreaterThan(0);
    }
  });

  it('opens on the first topic rather than an empty pane', () => {
    // A master–detail that starts blank reads as broken.
    const view = renderDocs();
    const first = DOCS_TOPICS[0];
    expect(view.queryAllByText(label(first.summary)).length).toBeGreaterThan(0);
  });

  it('opens straight on the topic a deep link names', () => {
    // `docs/:topicId` → that topic's detail, not the first one.
    const target = DOCS_TOPICS[3];
    const view = renderDocs(target.id);
    expect(view.queryAllByText(label(target.summary)).length).toBeGreaterThan(
      0,
    );
    expect(view.queryAllByText(label(DOCS_TOPICS[0].summary))).toHaveLength(0);
  });

  it('switches the detail pane when another topic is chosen', () => {
    const view = renderDocs();
    const other = DOCS_TOPICS[3];
    expect(view.queryAllByText(label(other.summary))).toHaveLength(0);
    fireEvent.press(view.getAllByText(label(other.title))[0]);
    expect(view.queryAllByText(label(other.summary)).length).toBeGreaterThan(0);
    // ...and the previous topic's body is gone, not merely appended below.
    expect(view.queryAllByText(label(DOCS_TOPICS[0].summary))).toHaveLength(0);
  });

  it('marks exactly the open topic as selected for a screen reader', () => {
    // Counted on *host* nodes only. A `Pressable` renders three layers — the
    // composite Pressable, a composite View and the host View — and every one
    // of them repeats `accessibilityState`, so a naive props match sees 48
    // rows for 16 topics and would report three selections for one tap.
    const view = renderDocs();
    const target = DOCS_TOPICS[2];
    fireEvent.press(view.getAllByText(label(target.title))[0]);
    const rows = view
      .UNSAFE_queryAllByProps({ accessibilityRole: 'button' } as never)
      .filter(node => typeof node.type === 'string');
    const selected = rows.filter(
      row => row.props.accessibilityState?.selected === true,
    );
    expect(selected).toHaveLength(1);
  });

  it('builds the instrument section from the catalogue, not prose', () => {
    const topic = DOCS_TOPICS.find(t => t.widget === 'instruments')!;
    expect(topic).toBeDefined();
    const view = renderDocs(topic.id);
    // A real catalogue row, present only if the live widget rendered.
    const first = gmInstrumentRows('')[0]!;
    expect(
      view.queryAllByText(`${first.program}  ${first.name}`).length,
    ).toBeGreaterThan(0);
  });

  it('shows no instrument table on a topic that does not ask for one', () => {
    const plain = DOCS_TOPICS.find(t => !t.widget)!;
    const view = renderDocs(plain.id);
    const first = gmInstrumentRows('')[0]!;
    expect(view.queryAllByText(`${first.program}  ${first.name}`)).toHaveLength(
      0,
    );
  });
});
