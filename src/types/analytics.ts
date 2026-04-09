export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface EngagementDataPoint {
  date: string;
  score: number;
  participantCount: number;
}

export interface SpeakingTimeEntry {
  participant: string;
  duration: number;
  percentage: number;
}

export interface SentimentDataPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
}

export interface TopicEntry {
  topic: string;
  frequency: number;
  sentiment: number;
}

export interface EngagementMetrics {
  averageScore: number;
  trend: EngagementDataPoint[];
  speakingTime: SpeakingTimeEntry[];
  sentimentTrend: SentimentDataPoint[];
  topicFrequency: TopicEntry[];
}

export interface AnalyticsData {
  engagementMetrics: EngagementMetrics;
  dateRange: DateRange;
}
