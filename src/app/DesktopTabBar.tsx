/**
 * The desktop window's sidebar: this app's five tabs handed to the family's
 * reusable `TabSidebar` (`@sudobility/components-rn`), which draws the column,
 * the icon-over-label items and the selected highlight in the design theme's
 * colours and font. This file only names the tabs and routes a press.
 *
 * Apart from `MainTabs.desktop.tsx`, which names the screens: a bar that
 * imported the navigator would bring every screen with it, and with them the
 * whole of sign-in, into anything that only wanted to draw five buttons.
 */
import type { ComponentType } from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import {
  BookOpenIcon,
  Cog6ToothIcon,
  LinkIcon,
  RectangleStackIcon,
  UserGroupIcon,
} from 'react-native-heroicons/outline';
import { TabSidebar, type TabSidebarItem } from '@sudobility/components-rn';
import type { MainTab } from './tab-bar';

type Glyph = ComponentType<{ size?: number; color?: string }>;

/**
 * Each tab's glyph and its name. A record over the tabs, so one added without
 * either fails to compile rather than showing a blank item.
 */
const TABS: Record<MainTab, { icon: Glyph; labelKey: string }> = {
  Dashboard: { icon: RectangleStackIcon, labelKey: 'nav.projects' },
  Community: { icon: UserGroupIcon, labelKey: 'nav.community' },
  Docs: { icon: BookOpenIcon, labelKey: 'nav.docs' },
  Resources: { icon: LinkIcon, labelKey: 'nav.resources' },
  Settings: { icon: Cog6ToothIcon, labelKey: 'nav.settings' },
};

export function DesktopTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const activeName = state.routes[state.index]?.name ?? '';
  const tabs: TabSidebarItem[] = state.routes.map(route => {
    const { icon: Icon, labelKey } = TABS[route.name as MainTab];
    return {
      name: route.name,
      label: t(labelKey),
      renderIcon: ({ color, size }) => <Icon color={color} size={size} />,
    };
  });
  const onTabPress = (name: string) => {
    const route = state.routes.find(r => r.name === name);
    if (!route) return;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (route.name !== activeName && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };
  return (
    <TabSidebar tabs={tabs} activeName={activeName} onTabPress={onTabPress} />
  );
}
