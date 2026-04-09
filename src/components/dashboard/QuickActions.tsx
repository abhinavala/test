import { FC } from 'react';

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  href: string;
}

interface QuickActionsProps {
  onActionClick?: (href: string) => void;
}

const DEFAULT_ACTIONS: QuickAction[] = [
  { id: 'new-meeting', label: 'Start New Meeting', icon: '▶', href: '/meetings/new' },
  { id: 'view-meetings', label: 'View All Meetings', icon: '☰', href: '/meetings' },
  { id: 'action-items', label: 'Action Items', icon: '✓', href: '/action-items' },
  { id: 'analytics', label: 'Analytics', icon: '◈', href: '/analytics' },
];

export const QuickActions: FC<QuickActionsProps> = ({ onActionClick }) => {
  return (
    <div className="quick-actions" role="region" aria-label="Quick actions">
      <h2 className="quick-actions__title">Quick Actions</h2>
      <div className="quick-actions__grid">
        {DEFAULT_ACTIONS.map((action) => (
          <button
            key={action.id}
            className="quick-actions__button"
            onClick={() => onActionClick?.(action.href)}
            type="button"
            data-testid={`quick-action-${action.id}`}
          >
            <span className="quick-actions__icon" aria-hidden="true">{action.icon}</span>
            <span className="quick-actions__label">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;
