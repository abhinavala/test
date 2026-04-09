import { generateSummary } from "../services/summaryGenerationService.js";
import type { MeetingEndConfig } from "../types/meeting-config.js";

export interface SummaryJobResult {
  success: boolean;
  meetingSessionId: string;
  attempt: number;
  error?: string;
}

interface Logger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

const defaultLogger: Logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(message, meta);
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(message, meta);
  },
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Trigger summary generation for a meeting session with retry logic.
 * This function is non-blocking — it runs in the background and logs results.
 * Failures are caught and logged; they never propagate to the caller.
 */
export async function triggerSummaryGeneration(
  meetingSessionId: string,
  config: Pick<MeetingEndConfig, "summaryRetryAttempts" | "summaryRetryDelay">,
  logger: Logger = defaultLogger,
): Promise<SummaryJobResult> {
  const { summaryRetryAttempts, summaryRetryDelay } = config;

  for (let attempt = 1; attempt <= summaryRetryAttempts; attempt++) {
    try {
      logger.info("Summary generation attempt started", {
        meetingSessionId,
        attempt,
        maxAttempts: summaryRetryAttempts,
      });

      await generateSummary(meetingSessionId, {
        backgroundProcessing: false,
      });

      logger.info("Summary generation completed successfully", {
        meetingSessionId,
        attempt,
      });

      return { success: true, meetingSessionId, attempt };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.error("Summary generation attempt failed", {
        meetingSessionId,
        attempt,
        maxAttempts: summaryRetryAttempts,
        error: errorMessage,
      });

      if (attempt < summaryRetryAttempts) {
        await delay(summaryRetryDelay);
      }
    }
  }

  return {
    success: false,
    meetingSessionId,
    attempt: summaryRetryAttempts,
    error: `Summary generation failed after ${summaryRetryAttempts} attempts`,
  };
}
