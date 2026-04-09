import { useState, useEffect, useCallback } from 'react';
import type { AnalyticsData, DateRange } from '../types/analytics.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

interface UseAnalyticsDataResult {
  data: AnalyticsData | null;
  loading: boolean;
  error: Error | null;
  setDateRange: (range: DateRange) => void;
}

function validateDateRange(range: DateRange): void {
  const start = new Date(range.startDate);
  const end = new Date(range.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ValidationError('Invalid date range');
  }
  if (start > end) {
    throw new ValidationError('Invalid date range');
  }
}

export function useAnalyticsData(initialDateRange: DateRange): UseAnalyticsDataResult {
  validateDateRange(initialDateRange);

  const [dateRange, setDateRangeState] = useState<DateRange>(initialDateRange);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const setDateRange = useCallback((range: DateRange) => {
    validateDateRange(range);
    setDateRangeState(range);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetchData() {
      try {
        const response = await fetch(
          `/api/analytics?startDate=${encodeURIComponent(dateRange.startDate)}&endDate=${encodeURIComponent(dateRange.endDate)}`
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch analytics: ${response.status}`);
        }
        const result: AnalyticsData = await response.json();
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [dateRange]);

  return { data, loading, error, setDateRange };
}

export { validateDateRange };
export default useAnalyticsData;
