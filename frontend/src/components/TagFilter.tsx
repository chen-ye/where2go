import { Filter, Plus, Minus } from "lucide-react";
import "./TagFilter.css";
import { GenericPopover } from "./ui/GenericPopover";
import { Tag } from "./ui/Tag";

interface TagFilterProps {
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
}

export function TagFilter({
  availableTags,
  selectedTags,
  onToggleTag,
  onClearTags,
}: TagFilterProps) {
  const hasSelection = selectedTags.length > 0;

  return (
    <GenericPopover
      trigger={
        <button
          className={`tag-filter-trigger ${hasSelection ? "active" : ""}`}
          aria-label="Filter by tags"
        >
          <Filter size={18} />
          {hasSelection && <span className="tag-count">{selectedTags.length}</span>}
        </button>
      }
      content={
        <div className="tag-filter-content-inner">
          <div className="tag-filter-header">
            <span className="tag-filter-title">Filter by Tags</span>
            {hasSelection && (
              <button className="tag-filter-clear" onClick={onClearTags}>
                Clear all
              </button>
            )}
          </div>
          <div className="tag-list">
            {availableTags.length === 0 ? (
              <div className="no-tags">No tags available</div>
            ) : (
              availableTags.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <Tag
                    as="button"
                    key={tag}
                    className={`tag-toggle ${isSelected ? "selected" : ""}`}
                    onClick={() => onToggleTag(tag)}
                  >
                    {tag}
                    {isSelected ? (
                      <Minus size={12} className="tag-check" />
                    ) : (
                      <Plus size={12} className="tag-check" />
                    )}
                  </Tag>
                );
              })
            )}
          </div>
        </div>
      }
      align="end"
      sideOffset={5}
      className="tag-filter-popover"
    />
  );
}
