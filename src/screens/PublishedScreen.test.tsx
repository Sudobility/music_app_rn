/**
 * The published page borrows the one playhead, and gives it back.
 *
 * The position is shared app-wide, and the page is pushed over an editor whose
 * caret *is* that position. The page's own Play has to start at its piece's
 * beginning — not wherever the editor's caret happened to be — and leaving has
 * to put the editor's caret back, or following a published link costs the
 * reader their place in their own score. The web page does both.
 */
import { jest } from '@jest/globals';
import { act } from '@testing-library/react-native';
import {
  createEmptyScore,
  getMusicPosition,
  getMusicPositionSource,
} from '@sudobility/music_types';
import type { PublishedSnapshot } from '@sudobility/music_types';
import { renderWithApp } from '@/test/render';
import { PublishedScore } from './PublishedScreen';

// The page's own behaviour is under test, not the canvas.
jest.mock('@/features/score/ScrollingScore', () => ({
  ScrollingScore: () => null,
}));
// The stack's bar, which the page fills with the score's name and Share.
const mockSetOptions = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...(jest.requireActual('@react-navigation/native') as object),
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));
// Auth is the family's shared context; a component test mocks it rather than
// standing up a provider (and the Firebase SDK the sign-in form imports).
jest.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: null }),
  readIdToken: async () => null,
}));
jest.mock('@/features/account/SignInModal', () => ({
  SignInModal: () => null,
}));

const snapshot: PublishedSnapshot = {
  publicId: 'pub-1',
  name: 'Tune',
  publicName: 'Tune',
  publisherName: 'Someone',
  score: createEmptyScore({ title: 'Tune', measures: 4 }),
  createdAt: '2026-09-15T00:00:00Z',
};

afterEach(() => {
  act(() => getMusicPositionSource().moveTo(0));
});

describe('PublishedScore', () => {
  it("starts its piece at the top and hands the editor's caret back on leaving", () => {
    act(() => getMusicPositionSource().moveTo(960));
    const view = renderWithApp(<PublishedScore snapshot={snapshot} />);
    expect(getMusicPosition().tick).toBe(0);

    // The page's own playback moved the playhead.
    act(() => getMusicPositionSource().report(240));

    view.unmount();
    expect(getMusicPosition().tick).toBe(960);
  });
});
