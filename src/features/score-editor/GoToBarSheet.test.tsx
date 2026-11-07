/**
 * Jumping the caret to a bar by number.
 *
 * The sheet hands over the text as typed; what a number means — bars counted
 * from 1 as the gutter draws them, a pickup having no number at all — is
 * music_editing's `goToBarFromInput`, tested there and wired in the toolbar
 * test. What is pinned here is the sheet's half: a bar that does not exist
 * keeps it open with a message saying what the range is, rather than closing
 * over a caret that did not move.
 */
import { jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { renderWithApp } from '@/test/render';
import { GoToBarSheet } from '@sudobility/music_ui_rn';

function setup(onGo: (text: string) => boolean = () => true) {
  const onClose = jest.fn();
  const view = renderWithApp(
    <GoToBarSheet open barCount={12} onClose={onClose} onGo={onGo} />,
  );
  return { view, onClose };
}

describe('GoToBarSheet', () => {
  it('passes the text as typed', () => {
    // Not parsed here: parsing in the sheet and again in the library is two
    // rules for what "7 " means, and only the library knows about pickups.
    const onGo = jest.fn((_text: string) => true);
    const { view } = setup(onGo);
    fireEvent.changeText(view.getByLabelText('Bar number'), '7');
    fireEvent.press(view.getByRole('button', { name: 'Go' }));
    expect(onGo).toHaveBeenCalledWith('7');
  });

  it('closes once the caret has moved', () => {
    const { view, onClose } = setup(() => true);
    fireEvent.changeText(view.getByLabelText('Bar number'), '3');
    fireEvent.press(view.getByRole('button', { name: 'Go' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open and says the range when the bar does not exist', () => {
    // Closing over a caret that did not move is the failure that looks like
    // success — the reader believes they are at bar 99.
    const { view, onClose } = setup(() => false);
    fireEvent.changeText(view.getByLabelText('Bar number'), '99');
    fireEvent.press(view.getByRole('button', { name: 'Go' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(view.getByText(/1 to 12/)).toBeTruthy();
  });

  it('stays open when the text is refused', () => {
    const { view, onClose } = setup(() => false);
    fireEvent.changeText(view.getByLabelText('Bar number'), 'chorus');
    fireEvent.press(view.getByRole('button', { name: 'Go' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(view.getByText(/1 to 12/)).toBeTruthy();
  });

  it('clears the error once the reader starts typing again', () => {
    // A stale complaint about the previous attempt reads as a complaint about
    // what is being typed now.
    const { view } = setup(() => false);
    const field = view.getByLabelText('Bar number');
    fireEvent.changeText(field, '99');
    fireEvent.press(view.getByRole('button', { name: 'Go' }));
    expect(view.queryByText(/1 to 12/)).not.toBeNull();
    fireEvent.changeText(field, '9');
    expect(view.queryByText(/1 to 12/)).toBeNull();
  });
});
