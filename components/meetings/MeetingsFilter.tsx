import type { MeetingFilters } from '../../src/types/meeting.js';

export interface MeetingsFilterProps {
  initialFilters?: MeetingFilters;
  onFiltersChange: (filters: MeetingFilters) => void;
  loading?: boolean;
}

export function filtersToSearchParams(filters: MeetingFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.status?.length) params.set('status', filters.status.join(','));
  if (filters.dateRange) {
    params.set('dateFrom', filters.dateRange.start);
    params.set('dateTo', filters.dateRange.end);
  }
  if (filters.durationRange) {
    params.set('durationMin', String(filters.durationRange.min));
    params.set('durationMax', String(filters.durationRange.max));
  }
  if (filters.participants?.length) params.set('participants', filters.participants.join(','));
  if (filters.tags?.length) params.set('tags', filters.tags.join(','));
  return params;
}

export function searchParamsToFilters(params: URLSearchParams): MeetingFilters {
  const filters: MeetingFilters = {};
  const search = params.get('search');
  if (search) filters.search = search;
  const status = params.get('status');
  if (status) filters.status = status.split(',') as MeetingFilters['status'];
  const dateFrom = params.get('dateFrom');
  const dateTo = params.get('dateTo');
  if (dateFrom && dateTo) filters.dateRange = { start: dateFrom, end: dateTo };
  const durationMin = params.get('durationMin');
  const durationMax = params.get('durationMax');
  if (durationMin && durationMax) filters.durationRange = { min: Number(durationMin), max: Number(durationMax) };
  const participants = params.get('participants');
  if (participants) filters.participants = participants.split(',');
  const tags = params.get('tags');
  if (tags) filters.tags = tags.split(',');
  return filters;
}

export function MeetingsFilter({ initialFilters, onFiltersChange, loading }: MeetingsFilterProps): JSX.Element {
  return (
    <div className="meetings-filter" data-loading={loading}>
      <input
        type="text"
        className="meetings-filter__search"
        placeholder="Search meetings..."
        defaultValue={initialFilters?.search ?? ''}
        onChange={(e) => onFiltersChange({ ...initialFilters, search: e.target.value })}
        disabled={loading}
      />
    </div>
  );
}

export default MeetingsFilter;
