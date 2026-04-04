import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import type { KeyDecision, OpenQuestion, NextStep } from "../types/meeting-summary.js";
import { NextStepPriority } from "../types/meeting-summary.js";
import { SummaryGenerationError } from "../types/errors.js";
import type {
  ExtractionContext,
  SummaryExtractionResult,
  AIServiceConfig,
  AIExtractionResponse,
} from "../types/ai-summary.js";
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
  formatTranscriptForPrompt,
  formatActionItemsForPrompt,
} from "../config/aiPrompts.js";

const MIN_TRANSCRIPT_SEGMENTS = 3;
const MIN_TOTAL_TEXT_LENGTH = 50;

const DEFAULT_CONFIG: AIServiceConfig = {
  apiKey: process.env.OPENAI_API_KEY ?? "",
  model: process.env.AI_MODEL ?? "gpt-4o",
  maxTokens: 2048,
  temperature: 0.3,
  maxRetries: 3,
  retryBaseDelayMs: 1000,
  timeoutMs: 30_000,
};

function getConfig(overrides?: Partial<AIServiceConfig>): AIServiceConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

function createOpenAIClient(config: AIServiceConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    timeout: config.timeoutMs,
    maxRetries: 0, // we handle retries ourselves
  });
}

function validateExtractionContext(context: ExtractionContext): void {
  const { transcriptSegments, meetingSessionId } = context;

  if (transcriptSegments.length < MIN_TRANSCRIPT_SEGMENTS) {
    throw new SummaryGenerationError(
      "insufficient content for summary extraction",
      "INSUFFICIENT_DATA",
      meetingSessionId,
    );
  }

  const totalTextLength = transcriptSegments.reduce(
    (sum, seg) => sum + seg.text.length,
    0,
  );
  if (totalTextLength < MIN_TOTAL_TEXT_LENGTH) {
    throw new SummaryGenerationError(
      "insufficient content for summary extraction",
      "INSUFFICIENT_DATA",
      meetingSessionId,
    );
  }
}

async function callOpenAI(
  client: OpenAI,
  config: AIServiceConfig,
  userPrompt: string,
): Promise<string> {
  const response = await client.chat.completions.create({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from AI service");
  }
  return content;
}

async function callWithRetry(
  client: OpenAI,
  config: AIServiceConfig,
  userPrompt: string,
  meetingSessionId: string,
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await callOpenAI(client, config, userPrompt);
    } catch (error) {
      lastError = error;

      if (error instanceof SummaryGenerationError) throw error;

      const isRateLimit =
        error instanceof OpenAI.APIError && error.status === 429;
      const isServerError =
        error instanceof OpenAI.APIError && error.status >= 500;
      const isTimeout =
        error instanceof OpenAI.APIConnectionTimeoutError;

      if (!isRateLimit && !isServerError && !isTimeout) {
        break; // non-retryable error
      }

      if (attempt < config.maxRetries) {
        const delay = config.retryBaseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new SummaryGenerationError(
    `AI service failure after ${config.maxRetries + 1} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    "AI_SERVICE_FAILURE",
    meetingSessionId,
  );
}

function parseAIResponse(raw: string, meetingSessionId: string): AIExtractionResponse {
  try {
    const parsed = JSON.parse(raw) as AIExtractionResponse;

    return {
      keyDecisions: Array.isArray(parsed.keyDecisions) ? parsed.keyDecisions : [],
      openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions : [],
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
    };
  } catch {
    throw new SummaryGenerationError(
      "Failed to parse AI response as JSON",
      "AI_SERVICE_FAILURE",
      meetingSessionId,
    );
  }
}

function mapPriority(raw?: string): NextStepPriority {
  const upper = (raw ?? "MEDIUM").toUpperCase();
  if (upper in NextStepPriority) return upper as NextStepPriority;
  return NextStepPriority.MEDIUM;
}

function mapToKeyDecisions(
  items: AIExtractionResponse["keyDecisions"],
): KeyDecision[] {
  return items.map((item) => ({
    id: randomUUID(),
    description: item.decision,
    participants: item.participants ?? [],
    madeAt: item.timestamp,
    context: item.context,
  }));
}

function mapToOpenQuestions(
  items: AIExtractionResponse["openQuestions"],
): OpenQuestion[] {
  return items.map((item) => ({
    id: randomUUID(),
    question: item.question,
    raisedBy: item.raisedBy,
    context: item.context,
  }));
}

function mapToNextSteps(
  items: AIExtractionResponse["nextSteps"],
): NextStep[] {
  return items.map((item) => ({
    id: randomUUID(),
    description: item.description,
    assigneeName: item.assignee,
    priority: mapPriority(item.priority),
    dueDate: item.dueDate,
  }));
}

function calculateConfidence(
  context: ExtractionContext,
  result: AIExtractionResponse,
): number {
  let score = 0.5;

  // More transcript data increases confidence
  const segmentCount = context.transcriptSegments.length;
  if (segmentCount >= 20) score += 0.2;
  else if (segmentCount >= 10) score += 0.15;
  else if (segmentCount >= 5) score += 0.1;

  // Having action items increases confidence
  if (context.actionItems.length > 0) score += 0.1;

  // Having extracted items increases confidence
  const totalItems =
    result.keyDecisions.length +
    result.openQuestions.length +
    result.nextSteps.length;
  if (totalItems >= 5) score += 0.15;
  else if (totalItems >= 2) score += 0.1;
  else if (totalItems >= 1) score += 0.05;

  // Participant names help with attribution
  if (context.participantNames && context.participantNames.length > 0) {
    score += 0.05;
  }

  return Math.min(1, Math.round(score * 100) / 100);
}

/** Analyze transcript segments to identify decision points with participant attribution. */
export function analyzeDecisionPoints(
  segments: ExtractionContext["transcriptSegments"],
): Array<{ decision: string; participants: string[]; timestamp: number }> {
  const decisionKeywords = [
    "decided",
    "agreed",
    "let's go with",
    "we'll do",
    "decision is",
    "we're going with",
    "approved",
    "confirmed",
    "final answer",
    "consensus",
  ];

  const decisions: Array<{
    decision: string;
    participants: string[];
    timestamp: number;
  }> = [];

  for (const segment of segments) {
    const lower = segment.text.toLowerCase();
    const isDecision = decisionKeywords.some((kw) => lower.includes(kw));

    if (isDecision) {
      decisions.push({
        decision: segment.text,
        participants: [segment.speakerId],
        timestamp: segment.startTime,
      });
    }
  }

  return decisions;
}

/** Extract structured summary components from meeting context using AI. */
export async function extractSummaryComponents(
  context: ExtractionContext,
  configOverrides?: Partial<AIServiceConfig>,
): Promise<SummaryExtractionResult> {
  const startTime = Date.now();
  const config = getConfig(configOverrides);

  validateExtractionContext(context);

  const transcriptText = formatTranscriptForPrompt(context.transcriptSegments);
  const actionItemsText = formatActionItemsForPrompt(context.actionItems);
  const userPrompt = buildExtractionUserPrompt(
    transcriptText,
    actionItemsText,
    context.participantNames ?? [],
  );

  const client = createOpenAIClient(config);
  const rawResponse = await callWithRetry(
    client,
    config,
    userPrompt,
    context.meetingSessionId,
  );
  const parsed = parseAIResponse(rawResponse, context.meetingSessionId);

  const keyDecisions = mapToKeyDecisions(parsed.keyDecisions);
  const openQuestions = mapToOpenQuestions(parsed.openQuestions);
  const nextSteps = mapToNextSteps(parsed.nextSteps);
  const confidence = calculateConfidence(context, parsed);

  return {
    keyDecisions,
    openQuestions,
    nextSteps,
    confidence,
    processingTime: Date.now() - startTime,
  };
}

export const aiSummaryService = {
  extractSummaryComponents,
  analyzeDecisionPoints,
};
