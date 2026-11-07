/**
 * Where a project came from. Mirrors the web panel's tests, so the two cannot
 * drift apart.
 */
import type { GenerationJobDetail } from '@sudobility/music_types';
import { renderWithApp } from '@/test/render';
import {
  GeneratedOriginDetails,
  ProjectOriginPanel,
} from '@sudobility/music_ui_rn';

describe('ProjectOriginPanel', () => {
  it('names an import by its format and file', () => {
    const view = renderWithApp(
      <ProjectOriginPanel
        origin={{ kind: 'imported', format: 'midi', fileName: 'tune.mid' }}
        projectId="p1"
        context={null}
      />,
    );
    expect(view.getByText('Imported from a file')).toBeTruthy();
    expect(view.getByText('MIDI')).toBeTruthy();
    expect(view.getByText('tune.mid')).toBeTruthy();
  });

  it('says a blank project started from nothing, and an unrecorded one that it is unknown', () => {
    const view = renderWithApp(
      <ProjectOriginPanel
        origin={{ kind: 'blank' }}
        projectId="p1"
        context={null}
      />,
    );
    expect(view.getByText('Started from a blank score')).toBeTruthy();
    view.rerender(
      <ProjectOriginPanel origin={null} projectId="p1" context={null} />,
    );
    expect(view.getByText('Not recorded')).toBeTruthy();
  });

  it('names the recording a transcription came from', () => {
    const view = renderWithApp(
      <ProjectOriginPanel
        origin={{ kind: 'transcribed', fileName: 'take 3.wav' }}
        projectId="p1"
        context={null}
      />,
    );
    expect(view.getByText('Transcribed from a recording')).toBeTruthy();
    expect(view.getByText('take 3.wav')).toBeTruthy();
  });
});

describe('GeneratedOriginDetails', () => {
  const job: GenerationJobDetail = {
    id: 'j1',
    projectId: 'p1',
    kind: 'generate-score',
    status: 'done',
    createdAt: '2026-08-07T10:00:00.000Z',
    finishedAt: '2026-08-07T10:02:00.000Z',
    error: null,
    usage: { promptTokens: 1200, completionTokens: 300, model: 'gpt-5.4' },
    request: {
      prompt: 'a late-night electro swing number',
      style: 'electroSwing',
      mood: 'playful',
      durationMeasures: 16,
      tempo: 112,
      timeSignature: { numerator: 4, denominator: 4 },
      keySignature: { fifths: -1, mode: 'minor' },
      complexity: 'moderate',
      lyrics: true,
      lyricsTheme: 'a night bus home',
      tracks: [
        {
          name: 'Clarinet',
          instrumentName: 'Clarinet',
          midiProgram: 71,
          clef: 'treble',
        },
        {
          name: 'Bass',
          instrumentName: 'Acoustic Bass',
          midiProgram: 32,
          clef: 'bass',
        },
      ],
    },
  };

  it('shows the request as readable rows, then the job', () => {
    const view = renderWithApp(<GeneratedOriginDetails job={job} />);
    expect(view.getByText('a late-night electro swing number')).toBeTruthy();
    // A style reads by its translated name, never its id.
    expect(view.getByText('Electro Swing')).toBeTruthy();
    expect(view.queryByText('electroSwing')).toBeNull();
    expect(view.getByText('112 BPM')).toBeTruthy();
    expect(view.getByText('D minor')).toBeTruthy();
    expect(view.getByText('4/4')).toBeTruthy();
    expect(view.getByText('16 bars')).toBeTruthy();
    // The lineup as "name — instrument", one part a line; a part named after
    // its instrument is not repeated.
    expect(view.getByText('Clarinet\nBass — Acoustic Bass')).toBeTruthy();
    expect(view.getByText('a night bus home')).toBeTruthy();
    expect(view.getByText('Moderate')).toBeTruthy();
    expect(view.getByText('Open AI')).toBeTruthy();
    expect(view.getByText('gpt-5.4')).toBeTruthy();
    expect(view.getByText('1200 in, 300 out')).toBeTruthy();
    expect(
      view.getByText(new Date(job.finishedAt!).toLocaleString()),
    ).toBeTruthy();
  });

  it('leaves out what the request did not say, and the usage a job never recorded', () => {
    const bare: GenerationJobDetail = { ...job };
    delete bare.usage;
    const view = renderWithApp(
      <GeneratedOriginDetails
        job={{
          ...bare,
          request: { prompt: 'p', durationMeasures: 8, tracks: [] },
        }}
      />,
    );
    expect(view.getByText('8 bars')).toBeTruthy();
    expect(view.queryByText('Style:')).toBeNull();
    expect(view.queryByText('Tokens:')).toBeNull();
  });
});
