/**
 * A single transcript segment representing one speaker's utterance.
 */
export interface TranscriptSegment {
  id: string;
  sessionId: string;
  speakerId: string;
  startTime: number;
  endTime: number;
  text: string;
}
