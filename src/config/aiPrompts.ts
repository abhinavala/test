/** System prompt for meeting summary extraction. */
export const EXTRACTION_SYSTEM_PROMPT = `You are a meeting analysis assistant. Your task is to analyze meeting transcript segments and action items to extract structured summary components.

You must identify:
1. Key decisions made during the meeting, including who was involved
2. Open questions that remain unresolved
3. Next steps with owner assignments and priority levels

Respond ONLY with valid JSON matching the specified schema. Do not include any text outside the JSON object.`;

/** Builds the user prompt for summary extraction. */
export function buildExtractionUserPrompt(
  transcriptText: string,
  actionItemsText: string,
  participantNames: string[],
): string {
  const participantsSection =
    participantNames.length > 0
      ? `\nParticipants: ${participantNames.join(", ")}\n`
      : "";

  return `Analyze the following meeting transcript and action items to extract key decisions, open questions, and next steps.
${participantsSection}
## Transcript
${transcriptText}

## Action Items
${actionItemsText}

## Required JSON Output Schema
{
  "keyDecisions": [
    {
      "decision": "description of the decision",
      "participants": ["participant names involved"],
      "timestamp": "ISO-8601 timestamp if identifiable",
      "context": "additional context or rationale"
    }
  ],
  "openQuestions": [
    {
      "question": "the unresolved question",
      "raisedBy": "name of person who raised it",
      "context": "additional context"
    }
  ],
  "nextSteps": [
    {
      "description": "what needs to be done",
      "assignee": "person responsible",
      "priority": "LOW | MEDIUM | HIGH | URGENT",
      "dueDate": "ISO-8601 date if mentioned"
    }
  ]
}

Extract all relevant items. If no items exist for a category, return an empty array.`;
}

/** Formats transcript segments into readable text for the AI prompt. */
export function formatTranscriptForPrompt(
  segments: Array<{ speakerId: string; startTime: number; text: string }>,
): string {
  if (segments.length === 0) return "(No transcript available)";

  return segments
    .map((s) => `[${s.speakerId} at ${s.startTime}ms]: ${s.text}`)
    .join("\n");
}

/** Formats action items into readable text for the AI prompt. */
export function formatActionItemsForPrompt(
  items: Array<{ description: string; assigneeName?: string; status: string }>,
): string {
  if (items.length === 0) return "(No action items)";

  return items
    .map((item) => {
      const assignee = item.assigneeName ? ` (assigned: ${item.assigneeName})` : "";
      return `- [${item.status}] ${item.description}${assignee}`;
    })
    .join("\n");
}
