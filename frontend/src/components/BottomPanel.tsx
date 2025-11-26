import { useState } from 'react';
import { Trash2, ExternalLink, Download, X, Plus } from 'lucide-react';
import type { Route } from '../types.ts';
import { ElevationProfile } from './ElevationProfile.tsx';

interface BottomPanelProps {
  route: Route;
  onClose: () => void;
  onDelete: (id: number) => void;
  onUpdateTags: (id: number, tags: string[]) => void;
  hoveredLocation: { lat: number; lon: number } | null;
  onHover: (location: { lat: number; lon: number } | null) => void;
}

interface RouteStatProps {
  value: number | null | undefined;
  units: string;
  decimals?: number;
  className?: string;
}

function RouteStat({ value, units, decimals = 0, className = '' }: RouteStatProps) {
  const formattedValue = value !== null && value !== undefined
    ? decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString()
    : `–– ${units}`;

  return (
    <div className={`stat-item ${className}`}>
      {value !== null && value !== undefined ? `${formattedValue} ${units}` : formattedValue}
    </div>
  );
}

import { PromptDialog } from './ui/PromptDialog';

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/Accordion';

export function BottomPanel({ route, onClose, onDelete, onUpdateTags, hoveredLocation, onHover }: BottomPanelProps) {
  const [tagPromptOpen, setTagPromptOpen] = useState(false);

  return (
    <div className="bottom-panel">
      <div className="bottom-panel-header">
        <h2 className="route-title">{route.title}</h2>
        <div className="header-actions">
           <a href={route.source_url} target="_blank" rel="noreferrer" className="icon-button" title="Open in Strava/Source">
              <ExternalLink size={18} />
           </a>
           <a href={`/api/routes/${route.id}/download`} download className="icon-button" title="Download GPX">
              <Download size={18} />
           </a>
           <button type="button" onClick={() => onDelete(route.id)} className="icon-button danger" title="Delete">
              <Trash2 size={18} />
           </button>
           <button type="button" onClick={onClose} className="icon-button" title="Close">
              <X size={18} />
           </button>
        </div>
      </div>

      <div className="route-stats">
        <RouteStat value={route.distance} units="mi" decimals={1} className="distance" />
        •
        <RouteStat value={route.total_ascent} units="ft ↑" className="total-ascent" />
        <RouteStat value={route.total_descent} units="ft ↓" className="total-descent" />
        •
        <div className="stat-item estimated-duration">4:10 - 5:28</div>
      </div>

      <div className="tags-row">
         {route.tags?.map(tag => (
             <div key={tag} className="tag-pill">
                {tag}
                <span className="tag-remove" onClick={() => {
                    const newTags = route.tags.filter(t => t !== tag);
                    onUpdateTags(route.id, newTags);
                }}><X size={12}/></span>
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
                <button type="button" className="add-tag-btn">
                    <Plus size={12} style={{marginRight: 4}}/> New
                </button>
            }
         />
      </div>

      <Accordion type="multiple" defaultValue={['profile']} className="accordion-root">
        <AccordionItem value="profile">
            <AccordionTrigger>Vertical Profile</AccordionTrigger>
            <AccordionContent>
                <ElevationProfile
                    coordinates={
                        route.geojson?.type === 'LineString' ? route.geojson.coordinates :
                        route.geojson?.type === 'MultiLineString' ? route.geojson.coordinates[0] :
                        []
                    }
                    hoveredLocation={hoveredLocation}
                    onHover={onHover}
                />
            </AccordionContent>
        </AccordionItem>

        <AccordionItem value="surfaces">
            <AccordionTrigger>Surfaces</AccordionTrigger>
            <AccordionContent>
                <div style={{height: '50px', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555'}}>
                    Surface Data Placeholder
                </div>
            </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
