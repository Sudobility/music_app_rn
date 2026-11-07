/**
 * The score's title and composer — which are not the document's name.
 *
 * `metadata.title` names every exported file and fills MusicXML's work title;
 * the document's title names the row it is stored in. Before this tab existed,
 * a project renamed after creation kept exporting under whatever its template
 * was called — rename "String Quartet" to "Wedding March", export, still
 * `String Quartet.mid`. Composer had no path at all, which left every exported
 * and published score anonymous.
 */
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithApp, testDocument } from '@/test/render';

const { ScoreTab } = require('@sudobility/music_ui_rn') as typeof import('@sudobility/music_ui_rn');

function setup() {
  const document = testDocument({ title: 'String Quartet' });
  const view = renderWithApp(<ScoreTab document={document} />);
  return { view, document };
}

describe('ScoreTab', () => {
  it('edits the score title, not the document name', () => {
    const { view, document } = setup();
    const field = view.getByLabelText(/title/i);
    fireEvent.changeText(field, 'Wedding March');
    fireEvent(field, 'blur');
    expect(document.store.getState().score!.metadata.title).toBe(
      'Wedding March',
    );
    // The document keeps its own name: they are different things.
    expect(document.store.getState().title).toBe('String Quartet');
  });

  it('gives the composer a path at all', () => {
    // Its absence is why every exported and published score was anonymous.
    const { view, document } = setup();
    const field = view.getByLabelText(/composer/i);
    fireEvent.changeText(field, 'A Composer');
    fireEvent(field, 'blur');
    expect(document.store.getState().score!.metadata.composer).toBe(
      'A Composer',
    );
  });

  it('commits on blur rather than per keystroke', () => {
    const { view, document } = setup();
    fireEvent.changeText(view.getByLabelText(/title/i), 'Half typed');
    expect(document.store.getState().score!.metadata.title).toBe(
      'String Quartet',
    );
  });

  it('puts a refused blank title back to the one the score has', () => {
    // `setScoreMetadata` refuses a blank title; the field must not keep
    // showing an empty box the score does not have.
    const { view, document } = setup();
    const field = view.getByLabelText(/title/i);
    fireEvent.changeText(field, '   ');
    fireEvent(field, 'blur');
    expect(document.store.getState().score!.metadata.title).toBe(
      'String Quartet',
    );
    expect(view.getByLabelText(/title/i).props.value).toBe('String Quartet');
  });

  it('locks while the transport plays', () => {
    const { view, document } = setup();
    act(() => {
      document.store.setState({ state: 'playing' });
    });
    expect(view.getByLabelText(/title/i).props.editable).toBe(false);
  });
});
