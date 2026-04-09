import { FC } from 'react';
import { Avatar } from '../ui/Avatar.js';
import { Button } from '../ui/Button.js';
import type { User } from '../../types/auth.js';

interface HeaderProps {
  user: User | null;
  onSidebarToggle: () => void;
  onLogout: () => Promise<void>;
}

export const Header: FC<HeaderProps> = ({ user, onSidebarToggle, onLogout }) => {
  return (
    <header className="header" data-testid="header">
      <div className="header__left">
        <button
          className="header__menu-btn"
          onClick={onSidebarToggle}
          aria-label="Toggle navigation"
        >
          &#9776;
        </button>
      </div>
      <div className="header__right">
        {user && (
          <div className="header__user">
            <Avatar src={user.avatarUrl} alt={user.name} size="sm" />
            <span className="header__username">{user.name}</span>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={() => void onLogout()}>
          Logout
        </Button>
      </div>
    </header>
  );
};

export default Header;
