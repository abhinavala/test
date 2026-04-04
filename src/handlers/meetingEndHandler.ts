import type {
  MeetingEndConfig,
  MeetingSession,
} from "../types/meeting-config.js";
import { DEFAULT_MEETING_END_CONFIG } from "../types/meeting-config.js";
import { triggerSummaryGeneration } from "../jobs/summaryGenerationJob.js";

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

/**
 * Handle a meeting end event by optionally triggering summary generation.
 *
 * Summary generation is non-blocking — failures are logged but never
 * prevent the meeting end process from completing successfully.
 */
export async function handleMeetingEnd(
  meetingSession: MeetingSession,
  config?: Partial<MeetingEndConfig>,
  logger: Logger = defaultLogger,
): Promise<void> {
  const resolvedConfig: MeetingEndConfig = {
    ...DEFAULT_MEETING_END_CONFIG,
    ...config,
  };
  const { sessionId } = meetingSession;

  logger.info("Meeting end handler started", { sessionId });

  if (!resolvedConfig.autoGenerateSummary) {
    logger.info("Automatic summary generation is disabled, skipping", {
      sessionId,
    });
    return;
  }

  const duration = meetingSession.endTime - meetingSession.startTime;

  if (duration < resolvedConfig.minMeetingDuration) {
    logger.info(
      "Meeting duration below minimum threshold, skipping summary generation",
      {
        sessionId,
        duration,
        minMeetingDuration: resolvedConfig.minMeetingDuration,
      },
    );
    return;
  }

  logger.info("Triggering summary generation for meeting session", {
    sessionId,
    duration,
  });

  try {
    // Fire-and-forget: trigger summary generation but don't await
    // the full retry cycle to avoid blocking meeting end processing.
    void triggerSummaryGeneration(
      sessionId,
      {
        summaryRetryAttempts: resolvedConfig.summaryRetryAttempts,
        summaryRetryDelay: resolvedConfig.summaryRetryDelay,
      },
      logger,
    );
  } catch (error) {
    // This catch guards against synchronous errors from triggerSummaryGeneration.
    // Async errors are handled inside the job itself.
    logger.error("Failed to initiate summary generation", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const meetingEndHandler = {
  handleMeetingEnd,
};
