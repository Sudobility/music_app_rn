/**
 * The strip under a score while the server is writing it.
 *
 * A generation is a job whose notes stream into the score as they are
 * written, so the score stays visible and this row says what is happening,
 * how far it has got, and offers a way out: cancelling writes `ready`, and
 * the running job discards its result when it next looks.
 */
import { jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { renderWithApp } from '@/test/render';
import { GenerationOverlay } from './GenerationOverlay';

describe('GenerationOverlay', () => {
  it('draws nothing when nothing is generating', () => {
    // A stray one is a row of nothing between the score and the transport.
    const view = renderWithApp(
      <GenerationOverlay visible={false} error={null} onCancel={jest.fn()} />,
    );
    // The `PortalHost` the harness mounts is always in the tree, so "drew
    // nothing" is a statement about what is inside it.
    expect(
      (view.toJSON() as { children?: unknown } | null)?.children,
    ).toBeNull();
  });

  it('says what is happening and that editing waits for it', () => {
    const view = renderWithApp(
      <GenerationOverlay visible error={null} onCancel={jest.fn()} />,
    );
    expect(view.getByText('Writing your music')).toBeTruthy();
    expect(view.getByText(/resume when it finishes/i)).toBeTruthy();
  });

  it('says a recording is being transcribed, when that is the job', () => {
    // "Writing your music" over a recording somebody uploaded describes
    // something that is not happening.
    const view = renderWithApp(
      <GenerationOverlay
        visible
        status="transcribing"
        error={null}
        onCancel={jest.fn()}
      />,
    );
    expect(view.getByText('Transcribing the recording…')).toBeTruthy();
    expect(view.queryByText('Writing your music')).toBeNull();
  });

  it('names the part a transcription is working on, and the separation before any', () => {
    const separating = renderWithApp(
      <GenerationOverlay
        visible
        status="transcribing"
        error={null}
        progress={{ stage: 'plan', label: 'Separation', done: 0, total: 8 }}
        onCancel={jest.fn()}
      />,
    );
    expect(separating.getByText(/^Separating 0 of 8/)).toBeTruthy();
    separating.unmount();

    const part = renderWithApp(
      <GenerationOverlay
        visible
        status="transcribing"
        error={null}
        progress={{ stage: 'part', label: 'Vocals', done: 2, total: 8 }}
        onCancel={jest.fn()}
      />,
    );
    expect(part.getByText('Part 2 of 8: Vocals')).toBeTruthy();
  });

  it("reports the stream's progress as a count the reader can follow", () => {
    const view = renderWithApp(
      <GenerationOverlay
        visible
        error={null}
        progress={{ stage: 'part', label: 'Bass', done: 2, total: 4 }}
        onCancel={jest.fn()}
      />,
    );
    expect(view.getByText('Part 2 of 4: Bass')).toBeTruthy();
  });

  it('mentions a troubled stream and nothing about a healthy one', () => {
    const healthy = renderWithApp(
      <GenerationOverlay
        visible
        error={null}
        live="live"
        onCancel={jest.fn()}
      />,
    );
    expect(healthy.queryByText(/Reconnecting/)).toBeNull();
    const troubled = renderWithApp(
      <GenerationOverlay
        visible
        error={null}
        live="reconnecting"
        onCancel={jest.fn()}
      />,
    );
    expect(troubled.getByText('Reconnecting…')).toBeTruthy();
  });

  it('offers cancel, because a job can be abandoned', () => {
    const onCancel = jest.fn();
    const view = renderWithApp(
      <GenerationOverlay visible error={null} onCancel={onCancel} />,
    );
    fireEvent.press(view.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows a failed job's reason without hiding the way out", () => {
    // The overlay is what unmounts on failure elsewhere; while it is up, the
    // reason belongs on it rather than nowhere.
    const view = renderWithApp(
      <GenerationOverlay
        visible
        error="ran out of credits"
        onCancel={jest.fn()}
      />,
    );
    expect(view.getByText('ran out of credits')).toBeTruthy();
    expect(view.getByText('Cancel')).toBeTruthy();
  });
});
