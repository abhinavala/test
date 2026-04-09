import type { ReactNode } from 'react';

export interface LayoutProps {
  children: ReactNode;
}

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export interface HeaderProps {
  onSidebarToggle: () => void;
}
