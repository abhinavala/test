import { FC, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar.js';
import { Header } from './Header.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useNavigation } from '../../hooks/useNavigation.js';
import type { LayoutProps } from '../../types/layout.js';

export const AppLayout: FC<LayoutProps> = ({ children }) => {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pathname, setPathname] = useState('/');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPathname(window.location.pathname);
    }
  }, []);

  const { items, isActive } = useNavigation(pathname);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="layout__loading" data-testid="layout-loading">
        <span>Loading...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className={`layout ${sidebarCollapsed ? 'layout--sidebar-collapsed' : ''}`}>
      <Sidebar
        items={items}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        isActive={isActive}
      />
      <div className="layout__content">
        <Header
          user={user}
          onSidebarToggle={() => setSidebarCollapsed((prev) => !prev)}
          onLogout={logout}
        />
        <main className="layout__main">{children}</main>
      </div>
    </div>
  );
};

export default AppLayout;
