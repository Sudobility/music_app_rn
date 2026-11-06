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
 * Expected text is resolved through i18next rather than matched as a raw key:
 * `renderWithApp` starts i18n with the real English resources, so the screen
 * renders translated copy and asserting on `docs.editor.title` would find
 * nothing. Resolving the key keeps the assertion about *which* copy is wired to
 * the topic — this component's job — without hard-coding English into the test.
 */
import i18next from 'i18next';
import { fireEvent } from '@testing-library/react-native';
import { gmInstrumentRows } from '@sudobility/music_types';
import { renderWithApp } from '@/test/render';
import { DocsScreen } from './DocsScreen';
import { DOCS_GROUPS } from '@sudobility/music_types';
import { DOCS_TOPICS, docsGroupLabelKey } from '@sudobility/music_lib';

/** The visible string for a key; i18n is started by the first render. */
const label = (key: string): string => i18next.t(key);

describe('DocsScreen', () => {
  it('lists every shared topic', () => {
    const view = renderWithApp(<DocsScreen />);
    expect(DOCS_TOPICS.length).toBeGreaterThan(0);
    const missing = DOCS_TOPICS.filter(
      topic => view.queryAllByText(label(topic.title)).length === 0,
    ).map(topic => topic.id);
    expect(missing).toEqual([]);
  });

  it('heads the topic list with the shared groups, in words', () => {
    // The web's master list is grouped; this one was a flat run of topics.
    const view = renderWithApp(<DocsScreen />);
    for (const group of DOCS_GROUPS) {
      const key = docsGroupLabelKey(group);
      expect(i18next.exists(key)).toBe(true);
      expect(view.queryAllByText(label(key)).length).toBeGreaterThan(0);
    }
  });

  it('opens on the first topic rather than an empty pane', () => {
    // A master–detail that starts blank reads as broken.
    const view = renderWithApp(<DocsScreen />);
    const first = DOCS_TOPICS[0];
    expect(view.queryAllByText(label(first.summary)).length).toBeGreaterThan(0);
  });

  it('switches the detail pane when another topic is chosen', () => {
    const view = renderWithApp(<DocsScreen />);
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
    const view = renderWithApp(<DocsScreen />);
    const target = DOCS_TOPICS[2];
    fireEvent.press(view.getAllByText(label(target.title))[0]);
    const rows = view
      .UNSAFE_queryAllByProps({ accessibilityRole: 'button' } as never)
      .filter(node => typeof node.type === 'string');
    expect(rows).toHaveLength(DOCS_TOPICS.length);
    const selected = rows.filter(
      row => row.props.accessibilityState?.selected === true,
    );
    expect(selected).toHaveLength(1);
  });

  it('builds the instrument section from the catalogue, not prose', () => {
    const topic = DOCS_TOPICS.find(t => t.widget === 'instruments')!;
    expect(topic).toBeDefined();
    const view = renderWithApp(<DocsScreen />);
    fireEvent.press(view.getAllByText(label(topic.title))[0]);
    // A real catalogue row, present only if the live widget rendered.
    const first = gmInstrumentRows('')[0]!;
    expect(
      view.queryAllByText(`${first.program}  ${first.name}`).length,
    ).toBeGreaterThan(0);
  });

  it('shows no instrument table on a topic that does not ask for one', () => {
    const plain = DOCS_TOPICS.find(t => !t.widget)!;
    const view = renderWithApp(<DocsScreen />);
    fireEvent.press(view.getAllByText(label(plain.title))[0]);
    const first = gmInstrumentRows('')[0]!;
    expect(view.queryAllByText(`${first.program}  ${first.name}`)).toHaveLength(
      0,
    );
  });

  it('stays on the open topic after a rotation collapses the split, once drilled in', () => {
    // Collapsed (a phone in portrait) it is one column at a time; widening to
    // two columns and back is a rotation. The reader who drilled into a topic
    // should land back on it, not on the list — `detailFocused` wired through.
    const view = renderWithApp(<DocsScreen />);
    const md = view.getByTestId('master-detail');
    const layout = (width: number) =>
      fireEvent(md, 'layout', {
        nativeEvent: { layout: { width, height: 800, x: 0, y: 0 } },
      });
    const other = DOCS_TOPICS[3];
    // One column: the list, with the detail not beside it.
    layout(390);
    expect(view.queryAllByText(label(other.summary))).toHaveLength(0);
    // Drill into a topic: its detail is pushed over the list.
    fireEvent.press(view.getAllByText(label(other.title))[0]);
    expect(view.queryAllByText(label(other.summary)).length).toBeGreaterThan(0);
    // Rotate to landscape (two columns) and back to portrait (one): still on
    // the topic, not dropped back to the list.
    layout(900);
    layout(390);
    expect(view.queryAllByText(label(other.summary)).length).toBeGreaterThan(0);
  });

  it('stays on the list across a rotation when nothing was drilled into', () => {
    // The mirror of the above: without a drill-in, a collapse reopens on the
    // list — the detail is not shown over it.
    const view = renderWithApp(<DocsScreen />);
    const md = view.getByTestId('master-detail');
    const layout = (width: number) =>
      fireEvent(md, 'layout', {
        nativeEvent: { layout: { width, height: 800, x: 0, y: 0 } },
      });
    const first = DOCS_TOPICS[0];
    layout(390);
    layout(900);
    layout(390);
    // The first topic's body is the detail; on the list it is not rendered.
    expect(view.queryAllByText(label(first.summary))).toHaveLength(0);
  });
});
