import { FC } from "react";
import type { SpeakerStats } from "../../types/speaker-stats.js";
import type { ParticipantEngagementScore } from "../../types/engagement.js";

interface ParticipantAnalyticsProps {
  speakerStats?: SpeakerStats[];
  engagementScores?: ParticipantEngagementScore[];
  loading?: boolean;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function getEngagementLevel(score: number): string {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export const ParticipantAnalytics: FC<ParticipantAnalyticsProps> = ({
  speakerStats,
  engagementScores,
  loading,
}) => {
  if (loading) {
    return (
      <section
        className="participant-analytics participant-analytics--loading"
        data-testid="participant-analytics"
      >
        <h2 className="participant-analytics__title">Participant Analytics</h2>
        <div className="loading-placeholder">Loading analytics...</div>
      </section>
    );
  }

  const hasData =
    (speakerStats && speakerStats.length > 0) ||
    (engagementScores && engagementScores.length > 0);

  if (!hasData) {
    return (
      <section
        className="participant-analytics"
        data-testid="participant-analytics"
      >
        <h2 className="participant-analytics__title">Participant Analytics</h2>
        <p className="participant-analytics__empty">
          No analytics available for this meeting.
        </p>
      </section>
    );
  }

  const engagementMap = new Map<string, ParticipantEngagementScore>();
  if (engagementScores) {
    for (const score of engagementScores) {
      engagementMap.set(score.participantId, score);
    }
  }

  return (
    <section
      className="participant-analytics"
      data-testid="participant-analytics"
    >
      <h2 className="participant-analytics__title">Participant Analytics</h2>

      {speakerStats && speakerStats.length > 0 && (
        <div className="participant-analytics__speaking">
          <h3 className="participant-analytics__subtitle">Speaking Time</h3>
          <div className="participant-analytics__table">
            <div className="participant-analytics__table-header">
              <span>Speaker</span>
              <span>Talk Time</span>
              <span>% of Meeting</span>
              <span>Turns</span>
              <span>Avg Turn</span>
              <span>Interruptions</span>
            </div>
            {speakerStats.map((stat) => {
              const engagement = engagementMap.get(stat.speakerId);
              return (
                <div
                  key={stat.speakerId}
                  className="participant-analytics__row"
                  data-testid="participant-row"
                >
                  <span className="participant-analytics__speaker">
                    {stat.speakerId}
                  </span>
                  <span className="participant-analytics__value mono">
                    {formatDuration(stat.talkTime)}
                  </span>
                  <span className="participant-analytics__value mono">
                    {stat.percentageOfMeeting.toFixed(1)}%
                  </span>
                  <span className="participant-analytics__value mono">
                    {stat.turnCount}
                  </span>
                  <span className="participant-analytics__value mono">
                    {formatDuration(stat.averageTurnDuration)}
                  </span>
                  <span className="participant-analytics__value mono">
                    {stat.interruptionCount}
                  </span>
                  {engagement && (
                    <div className="participant-analytics__engagement">
                      <div
                        className="participant-analytics__engagement-bar"
                        style={{ width: `${engagement.score}%` }}
                        data-level={getEngagementLevel(engagement.score)}
                      />
                      <span className="participant-analytics__engagement-score mono">
                        {engagement.score.toFixed(0)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {engagementScores && engagementScores.length > 0 && (
        <div className="participant-analytics__engagement-summary">
          <h3 className="participant-analytics__subtitle">
            Engagement Scores
          </h3>
          <div className="participant-analytics__engagement-grid">
            {engagementScores.map((score) => (
              <div
                key={score.participantId}
                className="engagement-card"
                data-testid="engagement-card"
              >
                <span className="engagement-card__name">
                  {score.participantId}
                </span>
                <span
                  className={`engagement-card__score engagement-card__score--${getEngagementLevel(score.score)} mono`}
                >
                  {score.score.toFixed(0)}
                </span>
                <div className="engagement-card__details">
                  <span className="mono">
                    Questions: {score.questionCount}
                  </span>
                  <span className="mono">
                    Response Rate: {(score.responseRate * 100).toFixed(0)}%
                  </span>
                  <span className="mono">
                    Sentiment: {score.sentimentScore.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default ParticipantAnalytics;
