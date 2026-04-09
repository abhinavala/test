'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MeetingsList } from '../../components/meetings/MeetingsList.js';
import { MeetingsFilter, filtersToSearchParams, searchParamsToFilters } from '../../components/meetings/MeetingsFilter.js';
import type { Meeting, MeetingFilters } from '../../src/types/meeting.js';
import '../../styles/pages/meetings.css';

interface MeetingsApiResponse {
  success: boolean;
  meetings: Meeting[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  error?: string;
}

type SortField = 'date' | 'title' | 'duration' | 'status';
type SortOrder = 'asc' | 'desc';

export const metadata = {
  title: 'Meetings',
  description: 'Browse, search, and filter your meetings.',
};

async function fetchMeetings(
  filters: MeetingFilters,
  page: number,
  pageSize: number,
  sortField: SortField,
  sortOrder: SortOrder,
): Promise<MeetingsApiResponse> {
  const params = filtersToSearchParams(filters);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  params.set('sortField', sortField);
  params.set('sortOrder', sortOrder);

  const response = await fetch(`/api/meetings?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch meetings: ${response.statusText}`);
  }
  return response.json() as Promise<MeetingsApiResponse>;
}

export default function MeetingsPage(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() => Number(searchParams.get('page') ?? '1'));
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortField, setSortField] = useState<SortField>(
    () => (searchParams.get('sortField') as SortField) ?? 'date',
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    () => (searchParams.get('sortOrder') as SortOrder) ?? 'desc',
  );
  const [filters, setFilters] = useState<MeetingFilters>(() =>
    searchParamsToFilters(new URLSearchParams(searchParams.toString())),
  );

  const updateUrl = useCallback(
    (newFilters: MeetingFilters, newPage: number, newSortField: SortField, newSortOrder: SortOrder) => {
      const params = filtersToSearchParams(newFilters);
      if (newPage > 1) params.set('page', String(newPage));
      if (newSortField !== 'date') params.set('sortField', newSortField);
      if (newSortOrder !== 'desc') params.set('sortOrder', newSortOrder);
      const query = params.toString();
      router.push(query ? `/meetings?${query}` : '/meetings', { scroll: false });
    },
    [router],
  );

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMeetings(filters, page, pageSize, sortField, sortOrder);
      if (!data.success) {
        setError(data.error ?? 'An unexpected error occurred.');
        return;
      }
      setMeetings(data.meetings);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meetings.');
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize, sortField, sortOrder]);

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  const handleFiltersChange = useCallback(
    (newFilters: MeetingFilters) => {
      setFilters(newFilters);
      setPage(1);
      updateUrl(newFilters, 1, sortField, sortOrder);
    },
    [sortField, sortOrder, updateUrl],
  );

  const handleMeetingClick = useCallback(
    (meetingId: string) => {
      const params = filtersToSearchParams(filters);
      if (page > 1) params.set('page', String(page));
      const returnQuery = params.toString();
      const returnUrl = returnQuery ? `/meetings?${returnQuery}` : '/meetings';
      router.push(`/meetings/${meetingId}?returnUrl=${encodeURIComponent(returnUrl)}`);
    },
    [filters, page, router],
  );

  const handleSortChange = useCallback(
    (field: SortField) => {
      const newOrder: SortOrder = field === sortField && sortOrder === 'desc' ? 'asc' : 'desc';
      setSortField(field);
      setSortOrder(newOrder);
      setPage(1);
      updateUrl(filters, 1, field, newOrder);
    },
    [sortField, sortOrder, filters, updateUrl],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage);
      updateUrl(filters, newPage, sortField, sortOrder);
    },
    [filters, sortField, sortOrder, updateUrl],
  );

  const handleRetry = useCallback(() => {
    void loadMeetings();
  }, [loadMeetings]);

  return (
    <div className="meetings-page">
      <header className="meetings-page__header">
        <h1 className="meetings-page__title">Meetings</h1>
        <p className="meetings-page__subtitle">
          {loading ? 'Loading...' : `${total} meeting${total !== 1 ? 's' : ''} found`}
        </p>
      </header>

      <section className="meetings-page__filters">
        <MeetingsFilter
          initialFilters={filters}
          onFiltersChange={handleFiltersChange}
          loading={loading}
        />
      </section>

      <section className="meetings-page__sort">
        <label className="meetings-page__sort-label">Sort by:</label>
        {(['date', 'title', 'duration', 'status'] as SortField[]).map((field) => (
          <button
            key={field}
            className={`meetings-page__sort-btn ${sortField === field ? 'meetings-page__sort-btn--active' : ''}`}
            onClick={() => handleSortChange(field)}
            aria-pressed={sortField === field}
          >
            {field.charAt(0).toUpperCase() + field.slice(1)}
            {sortField === field && (
              <span className="meetings-page__sort-indicator" aria-hidden="true">
                {sortOrder === 'asc' ? ' \u2191' : ' \u2193'}
              </span>
            )}
          </button>
        ))}
      </section>

      <main className="meetings-page__content">
        {error && !loading ? (
          <div className="meetings-page__error" role="alert">
            <p className="meetings-page__error-message">{error}</p>
            <button className="meetings-page__retry-btn" onClick={handleRetry}>
              Retry
            </button>
          </div>
        ) : (
          <MeetingsList
            meetings={meetings}
            loading={loading}
            onMeetingClick={handleMeetingClick}
          />
        )}
      </main>

      {totalPages > 1 && !loading && !error && (
        <nav className="meetings-page__pagination" aria-label="Meetings pagination">
          <button
            className="meetings-page__pagination-btn"
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            Previous
          </button>
          <span className="meetings-page__pagination-info">
            Page <span className="meetings-page__pagination-current">{page}</span> of{' '}
            <span className="meetings-page__pagination-total">{totalPages}</span>
          </span>
          <button
            className="meetings-page__pagination-btn"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
