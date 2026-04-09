import { FC, useState, useMemo } from "react";
import type { ActionItem } from "../../types/exportContent.js";

type FilterStatus = "all" | "open" | "in-progress" | "completed";

interface ActionItemsListProps {
  actionItems: ActionItem[];
  loading?: boolean;
}

export const ActionItemsList: FC<ActionItemsListProps> = ({
  actionItems,
  loading,
}) => {
  const [filter, setFilter] = useState<FilterStatus>("all");

  const filteredItems = useMemo(() => {
    if (filter === "all") return actionItems;
    return actionItems.filter((item) => item.status === filter);
  }, [actionItems, filter]);

  const counts = useMemo(() => {
    const result = { all: actionItems.length, open: 0, "in-progress": 0, completed: 0 };
    for (const item of actionItems) {
      result[item.status]++;
    }
    return result;
  }, [actionItems]);

  if (loading) {
    return (
      <section
        className="action-items action-items--loading"
        data-testid="action-items"
      >
        <h2 className="action-items__title">Action Items</h2>
        <div className="loading-placeholder">Loading action items...</div>
      </section>
    );
  }

  return (
    <section className="action-items" data-testid="action-items">
      <div className="action-items__header">
        <h2 className="action-items__title">Action Items</h2>
        <span className="action-items__count mono">{actionItems.length}</span>
      </div>

      <div className="action-items__filters" data-testid="action-items-filters">
        {(["all", "open", "in-progress", "completed"] as const).map((status) => (
          <button
            key={status}
            className={`action-items__filter ${filter === status ? "action-items__filter--active" : ""}`}
            onClick={() => setFilter(status)}
            data-testid={`filter-${status}`}
          >
            {status === "all" ? "All" : status === "in-progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1)}
            <span className="action-items__filter-count mono">
              {counts[status]}
            </span>
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <p className="action-items__empty">No action items found.</p>
      ) : (
        <ul className="action-items__list">
          {filteredItems.map((item) => (
            <li
              key={item.id}
              className={`action-item action-item--${item.status}`}
              data-testid="action-item"
            >
              <div className="action-item__header">
                <span
                  className={`action-item__status action-item__status--${item.status}`}
                >
                  {item.status === "completed" ? "\u2713" : item.status === "in-progress" ? "\u25CB" : "\u2022"}
                </span>
                <span className="action-item__description">
                  {item.description}
                </span>
              </div>
              <div className="action-item__meta">
                {item.assigneeName && (
                  <span className="action-item__assignee">
                    {item.assigneeName}
                  </span>
                )}
                {item.priority && (
                  <span
                    className={`action-item__priority action-item__priority--${item.priority}`}
                  >
                    {item.priority}
                  </span>
                )}
                {item.dueDate && (
                  <span className="action-item__due mono">{item.dueDate}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ActionItemsList;
