import { useMemo } from 'react';
import type { NavigationItem } from '../types/navigation.js';

export const navigationItems: NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/', icon: 'dashboard' },
  { id: 'meetings', label: 'Meetings', href: '/meetings', icon: 'meetings' },
  { id: 'meeting-detail', label: 'Meeting Detail', href: '/meetings/[id]', icon: 'detail' },
  { id: 'analytics', label: 'Analytics', href: '/analytics', icon: 'analytics' },
  { id: 'pre-meeting', label: 'Pre-Meeting Briefing', href: '/pre-meeting', icon: 'briefing' },
  { id: 'live-meeting', label: 'Live Meeting', href: '/live', icon: 'live' },
  { id: 'settings', label: 'Settings', href: '/settings', icon: 'settings' },
];

export interface UseNavigationReturn {
  items: NavigationItem[];
  activeItem: NavigationItem | null;
  isActive: (item: NavigationItem) => boolean;
}

export function findActiveItem(pathname: string): NavigationItem | null {
  const exact = navigationItems.find((item) => item.href === pathname);
  if (exact) return exact;

  const match = navigationItems
    .filter((item) => item.href !== '/')
    .find((item) => {
      const base = item.href.replace('/[id]', '');
      return pathname.startsWith(base) && pathname !== '/';
    });

  return match ?? null;
}

export function isItemActive(item: NavigationItem, pathname: string): boolean {
  if (item.href === pathname) return true;
  if (item.href === '/') return pathname === '/';
  const base = item.href.replace('/[id]', '');
  return pathname.startsWith(base);
}

export function useNavigation(pathname: string): UseNavigationReturn {
  const activeItem = useMemo(() => findActiveItem(pathname), [pathname]);

  const isActive = (item: NavigationItem): boolean => isItemActive(item, pathname);

  return { items: navigationItems, activeItem, isActive };
}
