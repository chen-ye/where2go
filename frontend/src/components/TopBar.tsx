import { Search } from 'lucide-react';

export function TopBar() {
  return (
    <div className="top-bar">
      <div className="logo-container">
        where2go
      </div>
      <div className="search-container">
        <Search className="search-icon" size={18} />
        <input type="text" className="search-input" placeholder="search" />
      </div>
    </div>
  );
}
