import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FilterPanel } from '../FilterPanel';

describe('FilterPanel', () => {
  const mockProps = {
    availableTags: ['collection', 'gravel', 'road'],
    selectedTags: [],
    onToggleTag: vi.fn(),
    onClearTags: vi.fn(),
    availableDomains: ['ridewithgps.com', 'strava.com'],
    selectedDomains: [],
    onToggleDomain: vi.fn(),
    onClearDomains: vi.fn(),
    minDistance: 0,
    maxDistance: 500000,
    distanceRange: null,
    onDistanceChange: vi.fn(),
    onClearDistance: vi.fn(),
  };

  it('should render filter button', () => {
    const { getByRole } = render(<FilterPanel {...mockProps} />);

    const filterButton = getByRole('button', { name: /filter/i });
    expect(filterButton).toBeInTheDocument();
  });

  it('should show count when filters are active', () => {
    const { getByText } = render(<FilterPanel {...mockProps} selectedTags={['collection']} />);

    expect(getByText('1')).toBeInTheDocument();
  });

  it('should show count for multiple filter types', () => {
    const { getByText } = render(
      <FilterPanel
        {...mockProps}
        selectedTags={['collection']}
        selectedDomains={['ridewithgps.com']}
      />
    );

    expect(getByText('2')).toBeInTheDocument();
  });

  it('should include distance filter in count', () => {
    const { getByText } = render(
      <FilterPanel
        {...mockProps}
        selectedTags={['collection']}
        distanceRange={[0, 50000]}
      />
    );

    expect(getByText('2')).toBeInTheDocument();
  });

  it('should render with active class when filters are selected', () => {
    const { getByRole } = render(
      <FilterPanel {...mockProps} selectedTags={['collection']} />
    );

    const filterButton = getByRole('button', { name: /filter/i });
    expect(filterButton).toHaveClass('active');
  });

  it('should not have active class when no filters selected', () => {
    const { getByRole } = render(<FilterPanel {...mockProps} />);

    const filterButton = getByRole('button', { name: /filter/i });
    expect(filterButton).not.toHaveClass('active');
  });
});
