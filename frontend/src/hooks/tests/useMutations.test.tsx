import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdateRouteTags } from '../useMutations';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useUpdateRouteTags', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should update tags successfully', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, tags: ['new'] }),
    });

    const { result } = renderHook(() => useUpdateRouteTags(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ id: 1, tags: ['new'] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(global.fetch).toHaveBeenCalledWith('/api/routes/1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ tags: ['new'] }),
    }));
  });

  it('should handle errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useUpdateRouteTags(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ id: 1, tags: ['new'] });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
