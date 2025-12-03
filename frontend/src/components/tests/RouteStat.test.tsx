import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RouteStat } from '../RouteStat';

describe('RouteStat', () => {
  it('renders value and units', () => {
    const { getByText } = render(<RouteStat value={10.5} units="mi" decimals={1} />);
    expect(getByText('10.5')).toBeInTheDocument();
    expect(getByText('mi')).toBeInTheDocument();
  });

  it('handles null/undefined values', () => {
    const { container } = render(<RouteStat value={null} units="mi" />);
    expect(container.textContent).toContain('––');
  });
});
