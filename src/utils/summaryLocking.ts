/** In-memory lock manager to prevent concurrent summary generation for the same session. */

const locks = new Map<string, { acquiredAt: number }>();

const LOCK_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Attempt to acquire a lock for the given meeting session.
 * Returns true if the lock was acquired, false if already held.
 * Stale locks (older than LOCK_TIMEOUT_MS) are automatically released.
 */
export function acquireLock(meetingSessionId: string): boolean {
  const existing = locks.get(meetingSessionId);

  if (existing) {
    const elapsed = Date.now() - existing.acquiredAt;
    if (elapsed < LOCK_TIMEOUT_MS) {
      return false;
    }
    // Stale lock — release and re-acquire
    locks.delete(meetingSessionId);
  }

  locks.set(meetingSessionId, { acquiredAt: Date.now() });
  return true;
}

/**
 * Release the lock for the given meeting session.
 */
export function releaseLock(meetingSessionId: string): void {
  locks.delete(meetingSessionId);
}

/**
 * Check whether a lock is currently held for the given meeting session.
 */
export function isLocked(meetingSessionId: string): boolean {
  const existing = locks.get(meetingSessionId);
  if (!existing) return false;

  const elapsed = Date.now() - existing.acquiredAt;
  if (elapsed >= LOCK_TIMEOUT_MS) {
    locks.delete(meetingSessionId);
    return false;
  }

  return true;
}

/**
 * Clear all locks. Intended for testing only.
 */
export function clearAllLocks(): void {
  locks.clear();
}
