/**
 * What printing resolves to.
 *
 * Cancelling at the print dialog is an ordinary outcome, not an error. Making
 * it a rejection would put a `try` around every call site for somebody
 * changing their mind — and the two are told apart nowhere else, so if this
 * is wrong the caller reports a failure that did not happen.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createEmptyScore } from '@sudobility/music_types';

const printPages =
  vi.fn<(name: string, pages: unknown[]) => Promise<boolean>>();
const renderPrintPages = vi.fn(
  async (
    _plan: { trackIds: readonly string[] },
    isCancelled?: () => boolean,
  ) =>
    isCancelled?.() ? null : [{ base64: 'AAA', width: 1000, height: 1400 }],
);

vi.mock('@moosiac/print', () => ({
  isSupported: () => true,
  printPages: (name: string, pages: unknown[]) => printPages(name, pages),
}));
vi.mock('./print-pages.js', () => ({
  renderPrintPages: (
    plan: { trackIds: readonly string[] },
    isCancelled?: () => boolean,
  ) => renderPrintPages(plan, isCancelled),
}));

const { printScore } = await import('./print-service.js');

beforeEach(() => {
  printPages.mockReset();
  renderPrintPages.mockClear();
});

describe('printScore', () => {
  it('asks for the dialog only after the pages are drawn and the sheet is gone', async () => {
    const order: string[] = [];
    renderPrintPages.mockImplementationOnce(async () => {
      order.push('render');
      return [{ base64: 'AAA', width: 1000, height: 1400 }];
    });
    printPages.mockImplementation(async () => {
      order.push('dialog');
      return true;
    });
    await printScore(
      createEmptyScore({ title: 'A' }),
      {},
      {
        beforeDialog: async () => {
          order.push('sheet closed');
        },
      },
    );
    expect(order).toEqual(['render', 'sheet closed', 'dialog']);
  });

  it('abandons a print cancelled while drawing, without a dialog', async () => {
    const beforeDialog = vi.fn();
    await expect(
      printScore(
        createEmptyScore({ title: 'A' }),
        {},
        {
          isCancelled: () => true,
          beforeDialog,
        },
      ),
    ).resolves.toBe('cancelled');
    expect(beforeDialog).not.toHaveBeenCalled();
    expect(printPages).not.toHaveBeenCalled();
  });

  it('reports a cancelled dialog as cancelled, not as a failure', async () => {
    printPages.mockResolvedValue(false);
    await expect(printScore(createEmptyScore({ title: 'A' }))).resolves.toBe(
      'cancelled',
    );
  });

  it('reports a submitted job as printed', async () => {
    printPages.mockResolvedValue(true);
    await expect(printScore(createEmptyScore({ title: 'A' }))).resolves.toBe(
      'printed',
    );
  });

  it('names the job after the score, which is what appears in the queue', async () => {
    printPages.mockResolvedValue(true);
    await printScore(createEmptyScore({ title: 'String Quartet' }));
    expect(printPages).toHaveBeenCalledWith(
      'String Quartet',
      expect.any(Array),
    );
  });

  it('falls back to a name rather than sending an empty one', async () => {
    // An untitled score would otherwise appear in the print queue as "".
    printPages.mockResolvedValue(true);
    await printScore(createEmptyScore({ title: '' }));
    expect(printPages).toHaveBeenCalledWith('Score', expect.any(Array));
  });

  it('refuses when there is nothing to print', async () => {
    renderPrintPages.mockResolvedValueOnce([]);
    printPages.mockResolvedValue(true);
    await expect(printScore(createEmptyScore({ title: 'A' }))).rejects.toThrow(
      /nothing to print/i,
    );
    expect(printPages).not.toHaveBeenCalled();
  });
});

describe('what reaches the pages', () => {
  /*
    The plan is music_drawing's, shared with the web print view. What this app
    owns is passing the reader's choices through to it — a part prints that
    track alone, and a scope naming no track prints nothing rather than the
    whole score.
  */
  it('prints a part as that track alone', async () => {
    printPages.mockResolvedValue(true);
    const score = createEmptyScore({ title: 'A' });
    const trackId = score.tracks[0]!.id;
    await printScore(score, { scope: trackId });
    expect(renderPrintPages.mock.calls.at(-1)?.[0].trackIds).toEqual([trackId]);
  });

  it('refuses a part the score does not have', async () => {
    printPages.mockResolvedValue(true);
    await expect(
      printScore(createEmptyScore({ title: 'A' }), { scope: 'nope' }),
    ).rejects.toThrow(/nothing to print/i);
  });
});
