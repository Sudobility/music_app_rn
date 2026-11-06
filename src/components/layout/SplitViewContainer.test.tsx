/**
 * The app-side helpers around the library's split view: the device-based panel
 * width, and the titled bar a non-split screen wears to match the panels.
 *
 * The split view itself (`SplitViewContainer`, `SplitMenuList`, the detail
 * width cap) is the shared library's now, and is tested there — see
 * `@sudobility/components-rn`'s `master-detail-layout` tests.
 */
import { Platform, Text } from 'react-native';
import { renderWithApp } from '@/test/render';
import {
  PHONE_PRIMARY_PANEL_WIDTH,
  PRIMARY_PANEL_WIDTH,
  TitledScreen,
} from './SplitViewContainer';

describe('panel width', () => {
  it('gives a phone a narrower list than a tablet or a desktop', () => {
    expect(PHONE_PRIMARY_PANEL_WIDTH).toBe(240);
    expect(PRIMARY_PANEL_WIDTH).toBe(320);
  });
});

describe('TitledScreen', () => {
  it('draws its content under the system’s native bar on a touch platform', () => {
    // The title sits in the platform's own navigation bar — a native prop, not
    // a text node this renderer expands — so the body is what is asserted
    // here; the bar itself and its centred title are verified on the device.
    const view = renderWithApp(
      <TitledScreen title="Community">
        <Text>body</Text>
      </TitledScreen>,
    );
    expect(view.getByText('body')).toBeTruthy();
  });

  it('draws no bar in a desktop window, and is just its content', () => {
    const os = Platform.OS;
    Platform.OS = 'macos';
    try {
      const view = renderWithApp(
        <TitledScreen title="Community">
          <Text>body</Text>
        </TitledScreen>,
      );
      expect(view.queryByRole('header')).toBeNull();
      expect(view.getByText('body')).toBeTruthy();
    } finally {
      Platform.OS = os;
    }
  });
});
