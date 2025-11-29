import { Filter, Globe, Plus, Minus, Tag as TagIcon } from "lucide-react";
import "./FilterPanel.css";
import { GenericPopover } from "./ui/GenericPopover";
import { Tag } from "./ui/Tag";

interface FilterPanelProps {
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  availableDomains: string[];
  selectedDomains: string[];
  onToggleDomain: (domain: string) => void;
  onClearDomains: () => void;
}

export function FilterPanel({
  availableTags,
  selectedTags,
  onToggleTag,
  onClearTags,
  availableDomains,
  selectedDomains,
  onToggleDomain,
  onClearDomains,
}: FilterPanelProps) {
  const domainCount = selectedDomains.length;
  const tagCount = selectedTags.length;
  const totalCount = domainCount + tagCount;
  const hasSelection = totalCount > 0;

  return (
    <GenericPopover
      trigger={
        <button
          className={`filter-panel-trigger ${hasSelection ? "active" : ""}`}
          aria-label="Filter"
        >
          <Filter size={18} />
          {hasSelection && <span className="filter-count">{totalCount}</span>}
        </button>
      }
      content={
        <div className="filter-panel-content-inner">
          {/* Domains Section */}
          <div className="filter-section">
            <div className="filter-section-header">
              <div className="filter-section-title">
                <span>Sources</span>
              </div>
              {domainCount > 0 && (
                <button className="filter-section-clear" onClick={onClearDomains}>
                  Clear
                </button>
              )}
            </div>
            <div className="filter-list">
              {availableDomains.length === 0 ? (
                <div className="no-items">No domains available</div>
              ) : (
                availableDomains.map((domain) => {
                  const isSelected = selectedDomains.includes(domain);
                  return (
                    <Tag
                      as="button"
                      key={domain}
                      className={`filter-toggle ${isSelected ? "selected" : ""}`}
                      onClick={() => onToggleDomain(domain)}
                    >
                      {domain}
                      {isSelected ? (
                        <Minus size={12} className="filter-check" />
                      ) : (
                        <Plus size={12} className="filter-check" />
                      )}
                    </Tag>
                  );
                })
              )}
            </div>
          </div>

          <div className="filter-divider" />

          {/* Tags Section */}
          <div className="filter-section">
            <div className="filter-section-header">
              <div className="filter-section-title">
                <span>Tags</span>
              </div>
              {tagCount > 0 && (
                <button className="filter-section-clear" onClick={onClearTags}>
                  Clear
                </button>
              )}
            </div>
            <div className="filter-list">
              {availableTags.length === 0 ? (
                <div className="no-items">No tags available</div>
              ) : (
                availableTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <Tag
                      as="button"
                      key={tag}
                      className={`filter-toggle ${isSelected ? "selected" : ""}`}
                      onClick={() => onToggleTag(tag)}
                    >
                      {tag}
                      {isSelected ? (
                        <Minus size={12} className="filter-check" />
                      ) : (
                        <Plus size={12} className="filter-check" />
                      )}
                    </Tag>
                  );
                })
              )}
            </div>
          </div>
        </div>
      }
      align="end"
      sideOffset={5}
      className="filter-panel-popover"
    />
  );
}
