/**
 * The two questions cut and paste have to ask.
 *
 * `useClipboardPrompts` in music_editing decides *whether* to ask — the rule is
 * "ask only when the answers differ" — and this only draws them. What is worth
 * pinning here is that each answer reaches the right resolver: crossing cut's
 * and paste's over would silently close the gap on a paste.
 */
import { jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import type { ClipboardPrompts } from '@sudobility/music_editing';
import { renderWithApp } from '@/test/render';
import { ClipboardPromptSheets } from '@sudobility/music_ui_rn';

function prompts(overrides: Partial<ClipboardPrompts> = {}): ClipboardPrompts {
  return {
    requestCut: jest.fn(),
    requestPaste: jest.fn(),
    pendingCut: false,
    pendingPaste: false,
    resolveCut: jest.fn(),
    resolvePaste: jest.fn(),
    cancel: jest.fn(),
    ...overrides,
  } as ClipboardPrompts;
}

describe('ClipboardPromptSheets', () => {
  it('asks nothing when nothing is pending', () => {
    // A sheet that appears every time is one people dismiss without reading.
    const view = renderWithApp(<ClipboardPromptSheets clipboard={prompts()} />);
    expect(view.queryByText('Leave silence')).toBeNull();
    expect(view.queryByText('Insert')).toBeNull();
  });

  it("sends cut's answer to resolveCut", () => {
    const clipboard = prompts({ pendingCut: true });
    const view = renderWithApp(<ClipboardPromptSheets clipboard={clipboard} />);
    fireEvent.press(view.getByRole('button', { name: 'Close the gap' }));
    expect(clipboard.resolveCut).toHaveBeenCalledWith('close');
    expect(clipboard.resolvePaste).not.toHaveBeenCalled();
  });

  it("sends paste's answer to resolvePaste", () => {
    const clipboard = prompts({ pendingPaste: true });
    const view = renderWithApp(<ClipboardPromptSheets clipboard={clipboard} />);
    fireEvent.press(view.getByRole('button', { name: 'Insert' }));
    expect(clipboard.resolvePaste).toHaveBeenCalledWith('insert');
    expect(clipboard.resolveCut).not.toHaveBeenCalled();
  });

  it('cancels without answering either', () => {
    const clipboard = prompts({ pendingCut: true });
    const view = renderWithApp(<ClipboardPromptSheets clipboard={clipboard} />);
    fireEvent.press(view.getByRole('button', { name: 'Cancel' }));
    expect(clipboard.cancel).toHaveBeenCalled();
    expect(clipboard.resolveCut).not.toHaveBeenCalled();
  });
});
