import { FC } from 'react';
import type { NavigationItem } from '../../types/navigation.js';

interface SidebarProps {
  items: NavigationItem[];
  collapsed: boolean;
  onToggle: () => void;
  isActive: (item: NavigationItem) => boolean;
}

export const Sidebar: FC<SidebarProps> = ({ items, collapsed, onToggle, isActive }) => {
  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`} data-testid="sidebar">
      <div className="sidebar__header">
        <span className="sidebar__logo">{collapsed ? 'A' : 'Aria AI'}</span>
        <button
          className="sidebar__toggle"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '\u25B6' : '\u25C0'}
        </button>
      </div>
      <nav className="sidebar__nav" role="navigation" aria-label="Main navigation">
        <ul className="sidebar__list">
          {items
            .filter((item) => item.id !== 'meeting-detail')
            .map((item) => (
              <li key={item.id} className="sidebar__item">
                <a
                  href={item.href}
                  className={`sidebar__link ${isActive(item) ? 'sidebar__link--active' : ''}`}
                  aria-current={isActive(item) ? 'page' : undefined}
                >
                  <span className="sidebar__icon" data-icon={item.icon} />
                  {!collapsed && <span className="sidebar__label">{item.label}</span>}
                  {!collapsed && item.badge != null && item.badge > 0 && (
                    <span className="sidebar__badge">{item.badge}</span>
                  )}
                </a>
              </li>
            ))}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
