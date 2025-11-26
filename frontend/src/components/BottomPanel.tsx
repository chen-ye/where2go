import { useState } from 'react';
import { Trash2, ExternalLink, Download, X, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import type { Route } from '../types.ts';

interface BottomPanelProps {
  route: Route;
  onClose: () => void;
  onDelete: (id: number) => void;
  onUpdateTags: (id: number, tags: string[]) => void;
}

export function BottomPanel({ route, onClose, onDelete, onUpdateTags }: BottomPanelProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [surfacesOpen, setSurfacesOpen] = useState(false);

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
        {/* Mock stats for now as they aren't in the interface yet */}
        <div className="stat-item">80 mi</div>
        <div className="stat-item">•</div>
        <div className="stat-item">1700 ft ↑</div>
        <div className="stat-item">3225 ft ↓</div>
        <div className="stat-item">•</div>
        <div className="stat-item">4:10 - 5:28</div>
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
         <button
            type="button"
            className="add-tag-btn"
            onClick={() => {
                const newTag = prompt("Add tag:");
                if (newTag) onUpdateTags(route.id, [...(route.tags || []), newTag]);
            }}
         >
             <Plus size={12} style={{marginRight: 4}}/> New
         </button>
      </div>

      {/* Accordions */}
      <div className="accordion-item">
        <div className="accordion-header" onClick={() => setProfileOpen(!profileOpen)}>
           <span>Vertical Profile</span>
           {profileOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
        {profileOpen && (
            <div className="accordion-content">
                <div style={{height: '100px', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555'}}>
                    Chart Placeholder
                </div>
            </div>
        )}
      </div>

      <div className="accordion-item">
        <div className="accordion-header" onClick={() => setSurfacesOpen(!surfacesOpen)}>
           <span>Surfaces</span>
           {surfacesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
        {surfacesOpen && (
            <div className="accordion-content">
                <div style={{height: '50px', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555'}}>
                    Surface Data Placeholder
                </div>
            </div>
        )}
      </div>

    </div>
  );
}
