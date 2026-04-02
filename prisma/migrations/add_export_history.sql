-- CreateEnum: export_format (SQLite uses CHECK constraints)
-- CreateTable: export_history

CREATE TABLE "export_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "format" TEXT NOT NULL CHECK ("format" IN ('PDF', 'MARKDOWN', 'HTML', 'JSON')),
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint for cache-first lookups (sessionId + format deduplication)
CREATE UNIQUE INDEX "export_history_sessionId_format_key" ON "export_history"("sessionId", "format");

-- Index for session lookups
CREATE INDEX "export_history_sessionId_idx" ON "export_history"("sessionId");

-- Index for time-based queries
CREATE INDEX "export_history_createdAt_idx" ON "export_history"("createdAt");
