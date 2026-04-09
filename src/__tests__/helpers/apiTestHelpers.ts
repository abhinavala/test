import type { Request, Response, NextFunction } from "express";

/**
 * Create a mock Express Request object for testing controllers and middleware.
 */
export function createMockRequest(
  overrides: {
    params?: Record<string, string>;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
    query?: Record<string, string>;
  } = {},
): Request {
  return {
    params: overrides.params ?? {},
    body: overrides.body ?? {},
    headers: overrides.headers ?? {},
    query: overrides.query ?? {},
  } as unknown as Request;
}

/**
 * Create a mock Express Response object that tracks status and JSON output.
 */
export function createMockResponse(): Response & {
  _status: number;
  _json: unknown;
} {
  const res = {
    _status: 0,
    _json: undefined as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
    headers: {},
  } as unknown as Response & { _status: number; _json: unknown };
  return res;
}

/**
 * Create a mock Next function for middleware testing.
 */
export function createMockNext(): NextFunction & { called: boolean; error?: unknown } {
  const next = function (err?: unknown) {
    next.called = true;
    if (err !== undefined) {
      next.error = err;
    }
  } as NextFunction & { called: boolean; error?: unknown };
  next.called = false;
  return next;
}

/**
 * Create a mock request with valid Bearer token authentication.
 */
export function createAuthenticatedRequest(
  overrides: {
    params?: Record<string, string>;
    body?: Record<string, unknown>;
    query?: Record<string, string>;
  } = {},
): Request {
  return createMockRequest({
    ...overrides,
    headers: { authorization: "Bearer test-token-valid" },
  });
}

/**
 * Run an Express middleware chain and return the final response.
 * Executes each middleware in order, calling next() to proceed.
 */
export async function runMiddlewareChain(
  middlewares: Array<(req: Request, res: Response, next: NextFunction) => void | Promise<void>>,
  req: Request,
  res: Response & { _status: number; _json: unknown },
): Promise<{ status: number; json: unknown; completed: boolean }> {
  let completed = false;

  const runNext = async (index: number): Promise<void> => {
    if (index >= middlewares.length) {
      completed = true;
      return;
    }

    const middleware = middlewares[index]!;
    let nextCalled = false;

    const next: NextFunction = ((err?: unknown) => {
      if (err) {
        res.status(500).json({ success: false, error: String(err) });
        return;
      }
      nextCalled = true;
    }) as NextFunction;

    await middleware(req, res, next);

    if (nextCalled) {
      await runNext(index + 1);
    }
  };

  await runNext(0);

  return {
    status: res._status,
    json: res._json,
    completed,
  };
}

/**
 * Assert that a response matches common API success envelope.
 */
export function assertSuccessResponse(
  res: { _status: number; _json: unknown },
  expectedStatus: number,
): void {
  if (res._status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${res._status}. Body: ${JSON.stringify(res._json)}`,
    );
  }
  const body = res._json as { success?: boolean };
  if (body.success !== true) {
    throw new Error(
      `Expected success: true, got ${JSON.stringify(body)}`,
    );
  }
}

/**
 * Assert that a response matches common API error envelope.
 */
export function assertErrorResponse(
  res: { _status: number; _json: unknown },
  expectedStatus: number,
  errorSubstring?: string,
): void {
  if (res._status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${res._status}. Body: ${JSON.stringify(res._json)}`,
    );
  }
  const body = res._json as { success?: boolean; error?: string };
  if (body.success !== false) {
    throw new Error(
      `Expected success: false, got ${JSON.stringify(body)}`,
    );
  }
  if (errorSubstring && (!body.error || !body.error.includes(errorSubstring))) {
    throw new Error(
      `Expected error containing "${errorSubstring}", got "${body.error}"`,
    );
  }
}
