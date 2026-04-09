import { FC } from "react";
import type { Summary, SentimentAnalysis } from "../../hooks/useMeetingDetail.js";

interface SummarySectionProps {
  summary: Summary | undefined;
  sentiment?: SentimentAnalysis;
  loading?: boolean;
}

export const SummarySection: FC<SummarySectionProps> = ({
  summary,
  sentiment,
  loading,
}) => {
  if (loading) {
    return (
      <section
        className="summary-section summary-section--loading"
        data-testid="summary-section"
      >
        <h2 className="summary-section__title">Summary</h2>
        <div className="loading-placeholder">Generating summary...</div>
      </section>
    );
  }

  if (!summary) {
    return (
      <section className="summary-section" data-testid="summary-section">
        <h2 className="summary-section__title">Summary</h2>
        <p className="summary-section__empty">
          No summary available for this meeting.
        </p>
      </section>
    );
  }

  const { content } = summary;

  return (
    <section className="summary-section" data-testid="summary-section">
      <h2 className="summary-section__title">Summary</h2>

      {content.keyDecisions.length > 0 && (
        <div className="summary-section__group">
          <h3 className="summary-section__group-title">Key Decisions</h3>
          <ul className="summary-section__list">
            {content.keyDecisions.map((decision) => (
              <li key={decision.id} className="summary-section__decision">
                <p className="summary-section__decision-text">
                  {decision.description}
                </p>
                {decision.participants.length > 0 && (
                  <span className="summary-section__decision-participants">
                    Decided by: {decision.participants.join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.openQuestions.length > 0 && (
        <div className="summary-section__group">
          <h3 className="summary-section__group-title">Open Questions</h3>
          <ul className="summary-section__list">
            {content.openQuestions.map((question) => (
              <li key={question.id} className="summary-section__question">
                <p className="summary-section__question-text">
                  {question.question}
                </p>
                {question.raisedBy && (
                  <span className="summary-section__question-raiser">
                    Raised by: {question.raisedBy}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.nextSteps.length > 0 && (
        <div className="summary-section__group">
          <h3 className="summary-section__group-title">Next Steps</h3>
          <ul className="summary-section__list">
            {content.nextSteps.map((step) => (
              <li key={step.id} className="summary-section__step">
                <p className="summary-section__step-text">
                  {step.description}
                </p>
                <div className="summary-section__step-meta">
                  <span
                    className={`summary-section__priority summary-section__priority--${step.priority.toLowerCase()}`}
                  >
                    {step.priority}
                  </span>
                  {step.assigneeName && (
                    <span className="summary-section__step-assignee">
                      {step.assigneeName}
                    </span>
                  )}
                  {step.dueDate && (
                    <span className="summary-section__step-due mono">
                      Due: {step.dueDate}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sentiment && (
        <div className="summary-section__sentiment">
          <h3 className="summary-section__group-title">Sentiment Analysis</h3>
          <div className="summary-section__sentiment-overall">
            <span className="summary-section__sentiment-label">
              Overall Sentiment:
            </span>
            <span className="summary-section__sentiment-score mono">
              {sentiment.overall.toFixed(2)}
            </span>
          </div>
          {sentiment.timeline.length > 0 && (
            <div
              className="summary-section__sentiment-timeline"
              data-testid="sentiment-timeline"
            >
              {sentiment.timeline.map((point, index) => (
                <div
                  key={index}
                  className={`sentiment-point sentiment-point--${point.label}`}
                  style={{
                    left: `${(point.timestamp / sentiment.timeline[sentiment.timeline.length - 1]!.timestamp) * 100}%`,
                  }}
                  title={`${point.label}: ${point.score.toFixed(2)}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default SummarySection;
