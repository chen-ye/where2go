import { useState } from "react";
import { Trash2, ExternalLink, Download, X, Plus, Check } from "lucide-react";
import type { Route, RouteDataPoint } from "../types.ts";
import { ElevationProfile } from "./ElevationProfile.tsx";
import { METERS_TO_MILES, METERS_TO_FEET } from "../utils/geo";
import { PromptDialog } from "./ui/PromptDialog";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  AccordionHeader,
} from "./ui/Accordion";
import { Switch } from "./ui/Switch";
import { Toggle } from "./ui/Toggle";
import { RouteStat } from "./RouteStat";
import "./RouteDetailsView.css";

interface RouteDetailsViewProps {
  route: Route;
  onClose: () => void;
  onDelete: (id: number) => void;
  onUpdateTags: (id: number, tags: string[]) => void;
  onUpdateCompleted: (id: number, isCompleted: boolean) => void;
  updatingRouteId: number | null;
  hoveredLocation: { lat: number; lon: number } | null;
  onHover: (location: { lat: number; lon: number } | null) => void;
  displayGradeOnMap: boolean;
  onToggleDisplayGradeOnMap: (enabled: boolean) => void;
  routeData: RouteDataPoint[];
}

export function RouteDetailsView({
  route,
  onClose,
  onDelete,
  onUpdateTags,
  onUpdateCompleted,
  updatingRouteId,
  hoveredLocation,
  onHover,
  displayGradeOnMap,
  onToggleDisplayGradeOnMap,
  routeData,
}: RouteDetailsViewProps) {
  const [tagPromptOpen, setTagPromptOpen] = useState(false);
  const isUpdating = updatingRouteId === route.id;

  return (
    <div className="route-details-view">
      <div className="bottom-panel-header">
        <h2 className="route-title">{route.title}</h2>
        <div className="header-actions">
          <Toggle
            pressed={route.is_completed}
            onPressedChange={(pressed) => onUpdateCompleted(route.id, pressed)}
            title="Mark Complete"
            disabled={isUpdating}
          >
            <Check size={18} />
          </Toggle>
          <a
            href={route.source_url}
            target="_blank"
            rel="noreferrer"
            className="icon-button"
            title="Open Source"
          >
            <ExternalLink size={18} />
          </a>
          <a
            href={`/api/routes/${route.id}/download`}
            download
            className="icon-button"
            title="Download GPX"
          >
            <Download size={18} />
          </a>
          <button
            type="button"
            onClick={() => onDelete(route.id)}
            className="icon-button danger"
            title="Delete"
          >
            <Trash2 size={18} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="icon-button"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="route-stats">
        <RouteStat
          value={
            route.distance ? route.distance * METERS_TO_MILES : route.distance
          }
          units="mi"
          decimals={1}
          className="distance"
        />
        •
        <RouteStat
          value={
            route.total_ascent
              ? route.total_ascent * METERS_TO_FEET
              : route.total_ascent
          }
          units="ft ↑"
          className="total-ascent"
        />
        <RouteStat
          value={
            route.total_descent
              ? route.total_descent * METERS_TO_FEET
              : route.total_descent
          }
          units="ft ↓"
          className="total-descent"
        />
        •<div className="stat-item estimated-duration">--:-- <span className="stat-units">-</span> --:--</div>
      </div>

      <div className="tags-row">
        {route.tags?.map((tag) => (
          <div key={tag} className="tag-pill">
            {tag}
            <button
              type="button"
              className="tag-remove"
              disabled={isUpdating}
              onClick={() => {
                const newTags = route.tags.filter((t) => t !== tag);
                onUpdateTags(route.id, newTags);
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <PromptDialog
          open={tagPromptOpen}
          onOpenChange={setTagPromptOpen}
          title="Add Tag"
          description="Enter a new tag for this route."
          onSubmit={(newTag) => {
            if (newTag) onUpdateTags(route.id, [...(route.tags || []), newTag]);
          }}
          trigger={
            <button type="button" className="add-tag-btn" disabled={isUpdating}>
              <Plus size={12} /> New
            </button>
          }
        />
      </div>

      <Accordion
        type="multiple"
        defaultValue={["profile"]}
        className="accordion-root"
      >
        <AccordionItem value="profile">
          <AccordionHeader>
            <AccordionTrigger>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  paddingRight: 10,
                }}
              >
                <span>Vertical Profile</span>
              </div>
            </AccordionTrigger>
            <div
              style={{ display: "flex", alignItems: "center", gap: 8 }}
              onClick={(e) => e.stopPropagation()}
            >
              <label
                style={{ fontSize: 12, color: "#888" }}
                htmlFor="display-grade-on-map"
              >
                Display on Map
              </label>
              <Switch
                id="display-grade-on-map"
                checked={displayGradeOnMap}
                onCheckedChange={onToggleDisplayGradeOnMap}
              />
            </div>
          </AccordionHeader>
          <AccordionContent>
            <ElevationProfile
              data={routeData}
              hoveredLocation={hoveredLocation}
              onHover={onHover}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="surfaces">
          <AccordionHeader>
            <AccordionTrigger>Surfaces</AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>
            <div
              style={{
                height: "50px",
                background: "#222",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#555",
              }}
            >
              Surface Data Placeholder
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
