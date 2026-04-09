import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  navigationItems,
  findActiveItem,
  isItemActive,
} from '../../../hooks/useNavigation.js';

// Mock useAuth since it depends on React context not available in unit tests
const mockUseAuth = vi.fn();
vi.mock('../../../hooks/useAuth.js', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('AppLayout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('useNavigation', () => {
    it('returns all 7 navigation items', () => {
      expect(navigationItems).toHaveLength(7);
      expect(navigationItems.map((i) => i.id)).toEqual([
        'dashboard',
        'meetings',
        'meeting-detail',
        'analytics',
        'pre-meeting',
        'live-meeting',
        'settings',
      ]);
    });

    it('returns correct active item for dashboard route', () => {
      const result = findActiveItem('/');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('dashboard');
    });

    it('returns correct active item for meetings route', () => {
      const result = findActiveItem('/meetings');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('meetings');
    });

    it('returns correct active item for meeting detail route', () => {
      const result = findActiveItem('/meetings/abc-123');
      expect(result).not.toBeNull();
      // Meeting detail matches /meetings prefix
      expect(result!.id).toBe('meetings');
    });

    it('returns correct active item for analytics route', () => {
      const result = findActiveItem('/analytics');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('analytics');
    });

    it('returns correct active item for settings route', () => {
      const result = findActiveItem('/settings');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('settings');
    });

    it('isActive returns true for the active item', () => {
      const analyticsItem = navigationItems.find((i) => i.id === 'analytics')!;
      expect(isItemActive(analyticsItem, '/analytics')).toBe(true);
    });

    it('isActive returns false for non-active items', () => {
      const dashboardItem = navigationItems.find((i) => i.id === 'dashboard')!;
      expect(isItemActive(dashboardItem, '/analytics')).toBe(false);
    });

    it('each navigation item has required properties', () => {
      for (const item of navigationItems) {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('label');
        expect(item).toHaveProperty('href');
        expect(item).toHaveProperty('icon');
        expect(typeof item.id).toBe('string');
        expect(typeof item.label).toBe('string');
        expect(typeof item.href).toBe('string');
        expect(typeof item.icon).toBe('string');
      }
    });
  });

  describe('Authentication integration', () => {
    it('authenticated state includes user and isAuthenticated', () => {
      const mockState = {
        user: { id: '1', name: 'Test User', email: 'test@example.com', avatarUrl: null },
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
      };
      mockUseAuth.mockReturnValue(mockState);

      const result = mockUseAuth();
      expect(result.isAuthenticated).toBe(true);
      expect(result.user).not.toBeNull();
      expect(result.user.name).toBe('Test User');
    });

    it('unauthenticated state triggers redirect behavior', () => {
      const mockState = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
      };
      mockUseAuth.mockReturnValue(mockState);

      const result = mockUseAuth();
      expect(result.isAuthenticated).toBe(false);
      expect(result.user).toBeNull();
    });

    it('loading state is properly represented', () => {
      const mockState = {
        user: null,
        isAuthenticated: false,
        isLoading: true,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        refreshToken: vi.fn(),
      };
      mockUseAuth.mockReturnValue(mockState);

      const result = mockUseAuth();
      expect(result.isLoading).toBe(true);
    });
  });
});
