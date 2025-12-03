import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { RouteDetailsView } from './RouteDetailsView';

import '@testing-library/jest-dom';

// Mock the chart components since they have complex dependencies
vi.mock('./charts/ElevationProfile', () => ({
  ElevationProfile: () => <div data-testid="elevation-profile">Elevation Profile</div>,
}));

vi.mock('./charts/SurfaceChart', () => ({
  SurfaceChart: () => <div data-testid="surface-chart">Surface Chart</div>,
}));

describe('RouteDetailsView', () => {
  const mockRoute = {
    id: 1,
    title: 'Test Route',
    source_url: 'https://example.com/route/1',
    tags: ['test', 'gravel'],
    is_completed: false,
    total_ascent: 500,
    total_descent: 450,
    distance: 50000, // 50km in meters
    created_at: '2024-01-01T00:00:00Z',
    bbox: undefined,
  };

  const mockRouteData = [
    { lat: 47.6, lon: -122.3, elevation: 100, grade: 0, distance: 0 },
    { lat: 47.61, lon: -122.31, elevation: 150, grade: 5, distance: 1000 },
    { lat: 47.62, lon: -122.32, elevation: 200, grade: 10, distance: 2000 },
  ];

  const mockProps = {
    route: mockRoute,
    routeData: mockRouteData,
    recomputing: false,
    onClose: vi.fn(),
    onRecompute: vi.fn(),
    onUpdateTags: vi.fn(),
    onUpdateCompleted: vi.fn(),
    onDelete: vi.fn(),
    updatingRouteId: null,
    hoveredLocation: null,
    onHover: vi.fn(),
    onClickLocation: vi.fn(),
    displayGradeOnMap: false,
    onToggleDisplayGradeOnMap: vi.fn(),
  };

  it('should render route title', () => {
    const { getByRole } = render(<RouteDetailsView {...mockProps} />);

    expect(getByRole('heading', { name: /Test Route/i })).toBeInTheDocument();
  });

  it('should display route stats', () => {
    const { getByText } = render(<RouteDetailsView {...mockProps} />);

    // Distance (50km -> ~31.1 mi)
    expect(getByText(/31.1/)).toBeInTheDocument();

    // Elevation gain/loss (500m -> ~1640 ft, 450m -> ~1476 ft)
    expect(getByText(/1640/)).toBeInTheDocument();
    expect(getByText(/1476/)).toBeInTheDocument();
  });

  it('should render elevation profile chart', () => {
    const { getByTestId } = render(<RouteDetailsView {...mockProps} />);

    expect(getByTestId('elevation-profile')).toBeInTheDocument();
  });

  it('should render surface chart when valhalla data exists', () => {
    const propsWithSurface = {
      ...mockProps,
      route: {
        ...mockRoute,
        valhalla_segments: [
          { surface: 'paved', length: 1000, start: 0, end: 1000, duration: 60 },
          { surface: 'gravel', length: 500, start: 1000, end: 1500, duration: 40 },
        ],
      },
    };

    const { getByTestId, getByRole } = render(<RouteDetailsView {...propsWithSurface} />);

    // Open the surfaces accordion item
    const surfacesTrigger = getByRole('button', { name: /Surfaces/i });
    fireEvent.click(surfacesTrigger);

    expect(getByTestId('surface-chart')).toBeInTheDocument();
  });

  it('should display route tags', () => {
    const { getByText } = render(<RouteDetailsView {...mockProps} />);

    expect(getByText('test')).toBeInTheDocument();
    expect(getByText('gravel')).toBeInTheDocument();
  });

  it('should show completion status', () => {
    const { getByRole } = render(<RouteDetailsView {...mockProps} />);

    // Should have a completion toggle button/checkbox
    // The Toggle component likely uses aria-pressed or similar
    const completionControl = getByRole('button', { name: /Mark Complete/i });
    expect(completionControl).toBeInTheDocument();
  });

  it('should handle completed route', () => {
    const completedProps = {
      ...mockProps,
      route: { ...mockRoute, is_completed: true },
    };

    const { getByRole } = render(<RouteDetailsView {...completedProps} />);

    // Verify completion status is reflected in UI
    const completionControl = getByRole('button', { name: /Mark Complete/i });
    expect(completionControl).toHaveAttribute('aria-pressed', 'true');
  });

  it('should show source URL link', () => {
    const { getByRole } = render(<RouteDetailsView {...mockProps} />);

    // The link has title="Open Source"
    const sourceLink = getByRole('link', { name: /Open Source/i });
    expect(sourceLink).toHaveAttribute('href', 'https://example.com/route/1');
  });

  it('should render delete button', () => {
    const { getByRole } = render(<RouteDetailsView {...mockProps} />);

    const deleteButton = getByRole('button', { name: /delete/i });
    expect(deleteButton).toBeInTheDocument();
  });

  it('should render recompute button', () => {
    const { getByRole } = render(<RouteDetailsView {...mockProps} />);

    const recomputeButton = getByRole('button', { name: /recompute/i });
    expect(recomputeButton).toBeInTheDocument();
  });
});
