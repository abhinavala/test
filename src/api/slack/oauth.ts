import { Router, Request, Response, NextFunction } from 'express';
import { slackOAuthService } from '../../services/slackOAuthService';

const router = Router();

/**
 * GET /api/slack/oauth/authorize
 * Initiates the Slack OAuth flow by redirecting to Slack's authorization page.
 * Requires authenticated user (userId from req.user).
 */
router.get(
  '/authorize',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'You must be logged in to connect a Slack workspace.',
        });
        return;
      }

      const { url } = slackOAuthService.generateAuthorizationUrl(userId);
      res.json({ url });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/slack/oauth/callback
 * Handles the OAuth callback from Slack after user authorization.
 */
router.get(
  '/callback',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code, state, error: oauthError } = req.query;

      // Handle user denying the OAuth request
      if (oauthError === 'access_denied') {
        res.status(400).json({
          error: 'ACCESS_DENIED',
          message: 'You denied the Slack connection request.',
        });
        return;
      }

      if (oauthError) {
        res.status(400).json({
          error: 'OAUTH_ERROR',
          message: `Slack returned an error: ${oauthError}`,
        });
        return;
      }

      if (!code || typeof code !== 'string') {
        res.status(400).json({
          error: 'MISSING_CODE',
          message: 'Missing authorization code from Slack.',
        });
        return;
      }

      if (!state || typeof state !== 'string') {
        res.status(400).json({
          error: 'MISSING_STATE',
          message: 'Missing state parameter. Please try connecting again.',
        });
        return;
      }

      const result = await slackOAuthService.handleCallback(code, state);

      res.json({
        success: true,
        message: `Successfully connected to workspace "${result.teamName}".`,
        teamId: result.teamId,
        teamName: result.teamName,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('expired') ||
          error.message.includes('Invalid OAuth state'))
      ) {
        res.status(400).json({
          error: 'INVALID_STATE',
          message: error.message,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * GET /api/slack/oauth/workspaces
 * Lists all active Slack workspace connections for the authenticated user.
 */
router.get(
  '/workspaces',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'You must be logged in to view workspace connections.',
        });
        return;
      }

      const workspaces = await slackOAuthService.getWorkspaces(userId);
      res.json({ workspaces });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/slack/oauth/workspaces/:workspaceId/status
 * Gets the connection status of a specific workspace.
 */
router.get(
  '/workspaces/:workspaceId/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'You must be logged in to view workspace status.',
        });
        return;
      }

      const status = await slackOAuthService.getWorkspaceStatus(
        userId,
        req.params.workspaceId
      );

      if (!status) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Workspace not found.',
        });
        return;
      }

      res.json({ workspace: status });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/slack/oauth/workspaces/:workspaceId/disconnect
 * Disconnects a Slack workspace (revokes token and deactivates).
 */
router.post(
  '/workspaces/:workspaceId/disconnect',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'You must be logged in to disconnect a workspace.',
        });
        return;
      }

      const result = await slackOAuthService.disconnectWorkspace(
        userId,
        req.params.workspaceId
      );

      if (!result.success) {
        const statusCode =
          result.error === 'Workspace not found' ? 404 : 400;
        res.status(statusCode).json({
          error:
            result.error === 'Workspace not found'
              ? 'NOT_FOUND'
              : 'DISCONNECT_FAILED',
          message: result.error,
        });
        return;
      }

      res.json({
        success: true,
        message: 'Workspace disconnected successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/slack/oauth/workspaces/:workspaceId/refresh
 * Manually triggers a token refresh for a workspace.
 */
router.post(
  '/workspaces/:workspaceId/refresh',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'You must be logged in to refresh a workspace token.',
        });
        return;
      }

      // Verify the workspace belongs to this user
      const status = await slackOAuthService.getWorkspaceStatus(
        userId,
        req.params.workspaceId
      );

      if (!status) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Workspace not found.',
        });
        return;
      }

      const result = await slackOAuthService.refreshToken(
        req.params.workspaceId
      );

      if (!result.success) {
        res.status(400).json({
          error: 'REFRESH_FAILED',
          message: result.error,
        });
        return;
      }

      res.json({
        success: true,
        message: 'Token refreshed successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
