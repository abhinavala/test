-- CreateTable: meeting_session_summaries

CREATE TABLE "meeting_session_summaries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetingSessionId" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint for one summary per meeting session
CREATE UNIQUE INDEX "meeting_session_summaries_meetingSessionId_key" ON "meeting_session_summaries"("meetingSessionId");

-- Index for meeting session lookups
CREATE INDEX "meeting_session_summaries_meetingSessionId_idx" ON "meeting_session_summaries"("meetingSessionId");

-- CreateTable: key_decisions

CREATE TABLE "key_decisions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "summaryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "participants" TEXT NOT NULL,
    "madeAt" DATETIME,
    "context" TEXT,
    CONSTRAINT "key_decisions_summaryId_fkey" FOREIGN KEY ("summaryId") REFERENCES "meeting_session_summaries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Index for summary lookups
CREATE INDEX "key_decisions_summaryId_idx" ON "key_decisions"("summaryId");

-- CreateTable: open_questions

CREATE TABLE "open_questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "summaryId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "ownerId" TEXT,
    "raisedBy" TEXT,
    "context" TEXT,
    CONSTRAINT "open_questions_summaryId_fkey" FOREIGN KEY ("summaryId") REFERENCES "meeting_session_summaries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Index for summary lookups
CREATE INDEX "open_questions_summaryId_idx" ON "open_questions"("summaryId");

-- CreateTable: next_steps

CREATE TABLE "next_steps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "summaryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "dueDate" DATETIME,
    CONSTRAINT "next_steps_summaryId_fkey" FOREIGN KEY ("summaryId") REFERENCES "meeting_session_summaries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Index for summary lookups
CREATE INDEX "next_steps_summaryId_idx" ON "next_steps"("summaryId");
