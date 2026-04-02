import { describe, it, expect } from 'vitest';
import type {
  ExportContent,
  ExportFormat,
  MeetingMetadata,
  ActionItem,
  ActionItemStatus,
  ActionItemPriority,
  TranscriptSegment,
} from '../../types/exportContent.js';

describe('ExportContent types', () => {
  describe('ExportContent interface accepts valid meeting data with all required fields', () => {
    it('should accept a complete export content object', () => {
      const content: ExportContent = {
        sessionId: 'session-001',
        metadata: {
          meetingId: 'meeting-123',
          title: 'Sprint Planning',
          date: '2026-04-01T10:00:00Z',
          duration: 60,
          participants: ['Alice', 'Bob', 'Charlie'],
          organizer: 'Alice',
        },
        summary: 'Discussed sprint goals and assigned tasks for Q2.',
        actionItems: [
          {
            id: 'action-1',
            description: 'Update the API documentation',
            assigneeName: 'Bob',
            assigneeId: 'user-bob',
            dueDate: '2026-04-10T00:00:00Z',
            status: 'open',
            priority: 'high',
          },
        ],
        transcript: [
          {
            speakerName: 'Alice',
            speakerId: 'user-alice',
            timestamp: '2026-04-01T10:00:00Z',
            text: 'Let us start the sprint planning meeting.',
            confidence: 0.95,
          },
          {
            speakerName: 'Bob',
            timestamp: '2026-04-01T10:01:30Z',
            text: 'I will handle the API docs update.',
            confidence: 0.88,
          },
        ],
        format: 'markdown',
        generatedAt: '2026-04-01T11:05:00Z',
      };

      expect(content.sessionId).toBe('session-001');
      expect(content.metadata.title).toBe('Sprint Planning');
      expect(content.metadata.date).toBe('2026-04-01T10:00:00Z');
      expect(content.summary).toBeDefined();
      expect(content.actionItems).toHaveLength(1);
      expect(content.transcript).toHaveLength(2);
      expect(content.format).toBe('markdown');
      expect(content.generatedAt).toBe('2026-04-01T11:05:00Z');
    });

    it('should accept plaintext format', () => {
      const format: ExportFormat = 'plaintext';
      expect(format).toBe('plaintext');
    });

    it('should accept markdown format', () => {
      const format: ExportFormat = 'markdown';
      expect(format).toBe('markdown');
    });

    it('should accept content with empty action items and transcript', () => {
      const content: ExportContent = {
        sessionId: 'session-002',
        metadata: {
          meetingId: 'meeting-456',
          title: 'Quick Sync',
          date: '2026-04-02T09:00:00Z',
        },
        actionItems: [],
        transcript: [],
        format: 'plaintext',
        generatedAt: '2026-04-02T09:30:00Z',
      };

      expect(content.actionItems).toHaveLength(0);
      expect(content.transcript).toHaveLength(0);
      expect(content.summary).toBeUndefined();
    });
  });

  describe('ActionItem interface handles missing optional fields like dueDate and assigneeId', () => {
    it('should accept an action item with only required fields', () => {
      const item: ActionItem = {
        id: 'action-1',
        description: 'Review the PR',
        status: 'open',
      };

      expect(item.id).toBe('action-1');
      expect(item.description).toBe('Review the PR');
      expect(item.status).toBe('open');
      expect(item.assigneeName).toBeUndefined();
      expect(item.assigneeId).toBeUndefined();
      expect(item.dueDate).toBeUndefined();
      expect(item.priority).toBeUndefined();
    });

    it('should accept an action item with all optional fields', () => {
      const item: ActionItem = {
        id: 'action-2',
        description: 'Deploy to staging',
        assigneeName: 'Charlie',
        assigneeId: 'user-charlie',
        dueDate: '2026-04-15T00:00:00Z',
        status: 'in-progress',
        priority: 'medium',
      };

      expect(item.assigneeName).toBe('Charlie');
      expect(item.assigneeId).toBe('user-charlie');
      expect(item.dueDate).toBe('2026-04-15T00:00:00Z');
      expect(item.priority).toBe('medium');
    });

    it('should support all action item statuses', () => {
      const statuses: ActionItemStatus[] = ['open', 'in-progress', 'completed'];
      expect(statuses).toHaveLength(3);
    });

    it('should support all action item priorities', () => {
      const priorities: ActionItemPriority[] = ['low', 'medium', 'high'];
      expect(priorities).toHaveLength(3);
    });
  });

  describe('TranscriptSegment interface validates speaker information and timestamp data', () => {
    it('should accept a segment with all required fields', () => {
      const segment: TranscriptSegment = {
        speakerName: 'Alice',
        timestamp: '2026-04-01T10:05:00Z',
        text: 'Here is my update for this sprint.',
      };

      expect(segment.speakerName).toBe('Alice');
      expect(typeof segment.speakerName).toBe('string');
      expect(segment.timestamp).toBe('2026-04-01T10:05:00Z');
      expect(typeof segment.timestamp).toBe('string');
      expect(segment.confidence).toBeUndefined();
    });

    it('should accept a segment with optional confidence between 0 and 1', () => {
      const segment: TranscriptSegment = {
        speakerName: 'Bob',
        timestamp: '2026-04-01T10:06:00Z',
        text: 'Sounds good, I will follow up.',
        confidence: 0.92,
      };

      expect(segment.confidence).toBe(0.92);
      expect(segment.confidence).toBeGreaterThanOrEqual(0);
      expect(segment.confidence).toBeLessThanOrEqual(1);
    });

    it('should accept a segment with optional speakerId', () => {
      const segment: TranscriptSegment = {
        speakerName: 'Charlie',
        speakerId: 'user-charlie',
        timestamp: '2026-04-01T10:07:00Z',
        text: 'I agree with that approach.',
      };

      expect(segment.speakerId).toBe('user-charlie');
    });

    it('should accept confidence at boundary values 0 and 1', () => {
      const low: TranscriptSegment = {
        speakerName: 'Speaker',
        timestamp: '2026-04-01T10:00:00Z',
        text: 'Inaudible.',
        confidence: 0,
      };

      const high: TranscriptSegment = {
        speakerName: 'Speaker',
        timestamp: '2026-04-01T10:00:01Z',
        text: 'Crystal clear.',
        confidence: 1,
      };

      expect(low.confidence).toBe(0);
      expect(high.confidence).toBe(1);
    });
  });

  describe('MeetingMetadata', () => {
    it('should accept metadata with only required fields', () => {
      const metadata: MeetingMetadata = {
        meetingId: 'meeting-789',
        title: 'Standup',
        date: '2026-04-02T09:00:00Z',
      };

      expect(metadata.meetingId).toBe('meeting-789');
      expect(metadata.duration).toBeUndefined();
      expect(metadata.participants).toBeUndefined();
      expect(metadata.organizer).toBeUndefined();
    });

    it('should accept metadata with all optional fields', () => {
      const metadata: MeetingMetadata = {
        meetingId: 'meeting-789',
        title: 'All Hands',
        date: '2026-04-02T14:00:00Z',
        duration: 90,
        participants: ['Alice', 'Bob', 'Charlie', 'Diana'],
        organizer: 'Alice',
      };

      expect(metadata.duration).toBe(90);
      expect(metadata.participants).toHaveLength(4);
      expect(metadata.organizer).toBe('Alice');
    });
  });

  describe('serialization', () => {
    it('should be fully JSON-serializable for database caching', () => {
      const content: ExportContent = {
        sessionId: 'session-ser',
        metadata: {
          meetingId: 'meeting-ser',
          title: 'Serialization Test',
          date: '2026-04-01T10:00:00Z',
          duration: 30,
          participants: ['Alice'],
          organizer: 'Alice',
        },
        summary: 'Test summary',
        actionItems: [
          {
            id: 'a-1',
            description: 'Test action',
            status: 'open',
            priority: 'low',
          },
        ],
        transcript: [
          {
            speakerName: 'Alice',
            timestamp: '2026-04-01T10:00:00Z',
            text: 'Hello',
            confidence: 0.99,
          },
        ],
        format: 'markdown',
        generatedAt: '2026-04-01T10:30:00Z',
      };

      const json = JSON.stringify(content);
      const parsed: ExportContent = JSON.parse(json);

      expect(parsed).toEqual(content);
      expect(parsed.metadata.title).toBe('Serialization Test');
      expect(parsed.actionItems[0]!.status).toBe('open');
      expect(parsed.transcript[0]!.confidence).toBe(0.99);
    });
  });
});
