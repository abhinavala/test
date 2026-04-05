-- CreateTable: participant_engagement_scores

CREATE TABLE "participant_engagement_scores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "talkTimeRatio" REAL NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "responseRate" REAL NOT NULL,
    "sentimentScore" REAL NOT NULL,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint for one score per participant per session
CREATE UNIQUE INDEX "participant_engagement_scores_sessionId_participantId_key" ON "participant_engagement_scores"("sessionId", "participantId");

-- Index for session lookups
CREATE INDEX "participant_engagement_scores_sessionId_idx" ON "participant_engagement_scores"("sessionId");

-- Index for participant lookups
CREATE INDEX "participant_engagement_scores_participantId_idx" ON "participant_engagement_scores"("participantId");
