import { FC, useState } from "react";
import type { ExportOptions, MeetingExportData } from "../../lib/export.js";
import { exportMeeting } from "../../lib/export.js";

interface ExportControlsProps {
  meetingId: string;
  exportData: MeetingExportData;
}

type ExportFormat = ExportOptions["format"];

const FORMAT_LABELS: Record<ExportFormat, string> = {
  markdown: "Markdown",
  plaintext: "Plain Text",
  csv: "CSV",
  notion: "Notion",
  jira: "Jira",
};

export const ExportControls: FC<ExportControlsProps> = ({
  meetingId,
  exportData,
}) => {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);
    setError(null);

    try {
      const content = exportMeeting({ format, meetingId }, exportData);

      const mimeTypes: Record<ExportFormat, string> = {
        markdown: "text/markdown",
        plaintext: "text/plain",
        csv: "text/csv",
        notion: "application/json",
        jira: "text/plain",
      };

      const extensions: Record<ExportFormat, string> = {
        markdown: "md",
        plaintext: "txt",
        csv: "csv",
        notion: "json",
        jira: "txt",
      };

      const blob = new Blob([content], { type: mimeTypes[format] });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `meeting-${meetingId}.${extensions[format]}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  return (
    <section className="export-controls" data-testid="export-controls">
      <h2 className="export-controls__title">Export</h2>

      <div className="export-controls__buttons">
        {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map((format) => (
          <button
            key={format}
            className={`export-controls__button export-controls__button--${format}`}
            onClick={() => void handleExport(format)}
            disabled={exporting !== null}
            data-testid={`export-${format}`}
          >
            {exporting === format ? "Exporting..." : FORMAT_LABELS[format]}
          </button>
        ))}
      </div>

      {error && (
        <div className="export-controls__error" data-testid="export-error">
          {error}
        </div>
      )}
    </section>
  );
};

export default ExportControls;
