/**
 * Reaching a tab from beside the tabs.
 *
 * Under a tab bar the tabs are already in the stack, beneath whatever is
 * asking, so they are returned to — `navigate` would push a second copy of
 * them, a second tab bar over the first. Without one the five are ordinary
 * stack screens and are pushed like any other.
 */
import { jest } from '@jest/globals';
import { Platform } from 'react-native';
import { StackActions } from '@react-navigation/native';
import { goToTab, hasTabBar, hasTopTabBar } from './tab-bar';

const os = Platform.OS;
// Only the iOS half of `Platform` declares it, and the test stands on others.
const pad = (Platform as { isPad?: boolean }).isPad ?? false;
const version = Platform.Version;
function device(isPad: boolean, osVersion: string) {
  Object.defineProperty(Platform, 'isPad', {
    value: isPad,
    configurable: true,
  });
  Object.defineProperty(Platform, 'Version', {
    value: osVersion,
    configurable: true,
  });
}
afterEach(() => {
  Platform.OS = os;
  device(pad, String(version));
});

describe('hasTopTabBar', () => {
  // The shared @sudobility/building_blocks_rn pod pins the native tab bar to
  // the compact bottom bar on iPad too (RNSForceCompactTabBar), so the bar is
  // never along the top — on any device or version — and the layout follows
  // the bottom-bar path everywhere.
  it('is never true: the bar is pinned to the bottom on every device', () => {
    Platform.OS = 'ios';
    device(true, '18.0');
    expect(hasTopTabBar()).toBe(false);
    device(true, '27.0');
    expect(hasTopTabBar()).toBe(false);
    device(true, '17.5');
    expect(hasTopTabBar()).toBe(false);
    device(false, '27.0');
    expect(hasTopTabBar()).toBe(false);
    Platform.OS = 'android';
    device(true, '35');
    expect(hasTopTabBar()).toBe(false);
  });
});

function navigator() {
  return { navigate: jest.fn(), dispatch: jest.fn() };
}

describe('hasTabBar', () => {
  it('is every platform the app is built for', () => {
    const answers = (['ios', 'android', 'macos', 'windows'] as const).map(
      platform => {
        Platform.OS = platform;
        return hasTabBar();
      },
    );
    expect(answers).toEqual([true, true, true, true]);
  });
});

describe('goToTab', () => {
  it('returns to the tabs under a tab bar, with the tab chosen', () => {
    Platform.OS = 'ios';
    const navigation = navigator();
    goToTab(navigation, 'Dashboard', { pane: 'import', at: 7 });
    expect(navigation.dispatch).toHaveBeenCalledWith(
      StackActions.popTo('Main', {
        screen: 'Dashboard',
        params: { pane: 'import', at: 7 },
      }),
    );
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('returns to the tabs from a desktop window too', () => {
    Platform.OS = 'macos';
    const navigation = navigator();
    goToTab(navigation, 'Settings');
    expect(navigation.dispatch).toHaveBeenCalledWith(
      StackActions.popTo('Main', { screen: 'Settings', params: undefined }),
    );
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('pushes the screen where there is no tab bar', () => {
    // No platform the app is built for; the arrangement is kept for one.
    Platform.OS = 'web';
    const navigation = navigator();
    goToTab(navigation, 'Settings');
    expect(navigation.navigate).toHaveBeenCalledWith('Settings', undefined);
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });
});
