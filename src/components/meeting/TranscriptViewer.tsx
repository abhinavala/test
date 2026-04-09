import { FC, useState, useMemo } from "react";
import type { Transcript } from "../../hooks/useMeetingDetail.js";

interface TranscriptViewerProps {
  transcript: Transcript | undefined;
  loading?: boolean;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export const TranscriptViewer: FC<TranscriptViewerProps> = ({
  transcript,
  loading,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSegments = useMemo(() => {
    if (!transcript) return [];
    if (!searchQuery.trim()) return transcript.segments;

    const query = searchQuery.toLowerCase();
    return transcript.segments.filter(
      (segment) =>
        segment.text.toLowerCase().includes(query) ||
        segment.speakerId.toLowerCase().includes(query),
    );
  }, [transcript, searchQuery]);

  if (loading) {
    return (
      <section
        className="transcript-viewer transcript-viewer--loading"
        data-testid="transcript-viewer"
      >
        <h2 className="transcript-viewer__title">Transcript</h2>
        <div className="loading-placeholder">Loading transcript...</div>
      </section>
    );
  }

  if (!transcript || transcript.segments.length === 0) {
    return (
      <section className="transcript-viewer" data-testid="transcript-viewer">
        <h2 className="transcript-viewer__title">Transcript</h2>
        <p className="transcript-viewer__empty">
          No transcript available for this meeting.
        </p>
      </section>
    );
  }

  return (
    <section className="transcript-viewer" data-testid="transcript-viewer">
      <div className="transcript-viewer__header">
        <h2 className="transcript-viewer__title">Transcript</h2>
        <span className="transcript-viewer__duration mono">
          Duration: {formatTime(transcript.totalDuration)}
        </span>
      </div>

      <div className="transcript-viewer__search">
        <input
          type="text"
          className="transcript-viewer__search-input"
          placeholder="Search transcript..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-testid="transcript-search"
        />
        {searchQuery && (
          <span className="transcript-viewer__search-count mono">
            {filteredSegments.length} result
            {filteredSegments.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="transcript-viewer__segments">
        {filteredSegments.map((segment) => (
          <div
            key={segment.id}
            className="transcript-segment"
            data-testid="transcript-segment"
          >
            <div className="transcript-segment__header">
              <span className="transcript-segment__speaker">
                {segment.speakerId}
              </span>
              <span className="transcript-segment__time mono">
                {formatTime(segment.startTime)}
              </span>
            </div>
            <p className="transcript-segment__text">{segment.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default TranscriptViewer;
