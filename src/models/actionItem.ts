import { ActionItem, CreateActionItemRequest } from '../types/actionItem.js';

export async function createActionItem(data: CreateActionItemRequest): Promise<ActionItem> {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    meetingId: data.meetingId,
    content: data.content,
    assignee: data.assignee,
    dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    confidenceScore: data.confidenceScore,
    confirmationStatus: 'pending',
    extractedAt: now,
    createdBy: 'system',
    updatedAt: now,
  };
}

export async function getActionItemsByMeeting(meetingId: string): Promise<ActionItem[]> {
  return [];
}
