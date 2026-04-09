import { FC, useState, useCallback } from 'react';
import type { DateRange } from '../../types/analytics.js';

interface DateRangeFilterProps {
  dateRange: DateRange;
  onChange: (range: DateRange) => void;
}

export const DateRangeFilter: FC<DateRangeFilterProps> = ({
  dateRange,
  onChange,
}) => {
  const [startDate, setStartDate] = useState(dateRange.startDate);
  const [endDate, setEndDate] = useState(dateRange.endDate);

  const handleApply = useCallback(() => {
    onChange({ startDate, endDate });
  }, [startDate, endDate, onChange]);

  return (
    <div
      className="date-range-filter"
      role="group"
      aria-label="Date range filter"
    >
      <label className="date-range-filter__label" htmlFor="start-date">
        From
      </label>
      <input
        id="start-date"
        type="date"
        className="date-range-filter__input"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        aria-label="Start date"
      />
      <label className="date-range-filter__label" htmlFor="end-date">
        To
      </label>
      <input
        id="end-date"
        type="date"
        className="date-range-filter__input"
        value={endDate}
        onChange={(e) => setEndDate(e.target.value)}
        aria-label="End date"
      />
      <button
        className="date-range-filter__button"
        onClick={handleApply}
        aria-label="Apply date range filter"
      >
        Apply
      </button>
    </div>
  );
};

export default DateRangeFilter;
