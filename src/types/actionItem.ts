export interface ActionItem {
  id: string;
  meetingId: string;
  content: string;
  assignee?: string;
  dueDate?: Date;
  confidenceScore: number;
  confirmationStatus: 'pending' | 'confirmed' | 'rejected';
  extractedAt: Date;
  confirmedAt?: Date;
  createdBy: string;
  updatedAt: Date;
}

export interface CreateActionItemRequest {
  meetingId: string;
  content: string;
  assignee?: string;
  dueDate?: string;
  confidenceScore: number;
}
