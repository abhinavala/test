-- CreateTable: speaker_stats

CREATE TABLE "speaker_stats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "stats" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint for one stats record per session
CREATE UNIQUE INDEX "speaker_stats_sessionId_key" ON "speaker_stats"("sessionId");

-- Index for session lookups
CREATE INDEX "speaker_stats_sessionId_idx" ON "speaker_stats"("sessionId");
