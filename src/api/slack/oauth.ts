import { Router, Request, Response, NextFunction } from 'express';
import { slackOAuthService } from '../../services/slackOAuthService';

const router = Router();

/**
 * POST /api/slack/oauth/start
 * Initiates the Slack OAuth flow by generating an authorization URL.
 * Requires authenticated user (userId from req.user).
 */
router.post(
  '/start',
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

      const result = await slackOAuthService.generateOAuthUrl(userId);
      res.json({ authUrl: result.authUrl, state: result.state });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/slack/oauth/callback
 * Handles the OAuth callback from Slack after user authorization.
 * Expects { code, state, error? } in the request body.
 */
router.post(
  '/callback',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code, state, error: oauthError } = req.body;

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

      const connection = await slackOAuthService.handleOAuthCallback(
        code,
        state
      );

      res.json({
        success: true,
        message: `Successfully connected to workspace "${connection.workspaceName}".`,
        connection,
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
 * GET /api/slack/connections
 * Lists all active Slack workspace connections for the authenticated user.
 */
router.get(
  '/connections',
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

      const connections = await slackOAuthService.getConnections(userId);
      res.json({ connections });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/slack/connections/:workspaceId
 * Disconnects a Slack workspace (revokes token and deactivates).
 */
router.delete(
  '/connections/:workspaceId',
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

export default router;
