import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../components/ui/use-toast';

interface UpdateRouteTagsParams {
  id: number;
  tags: string[];
}

interface UpdateRouteCompletionParams {
  id: number;
  is_completed: boolean;
}

export function useUpdateRouteTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, tags }: UpdateRouteTagsParams) => {
      const res = await fetch(`/api/routes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      });

      if (!res.ok) {
        throw new Error(`Failed to update tags: ${res.status}`);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useUpdateRouteCompletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_completed }: UpdateRouteCompletionParams) => {
      const res = await fetch(`/api/routes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_completed }),
      });

      if (!res.ok) {
        throw new Error(`Failed to update completion: ${res.status}`);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    },
  });
}

export function useDeleteRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/routes/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error(`Failed to delete route: ${res.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      toast({
        title: "Success",
        description: "Route deleted",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to delete route: ${error.message}`,
        variant: "destructive",
      });
    },
  });
}

export function useRecomputeRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/routes/${id}/recompute`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error(`Failed to recompute route: ${res.status}`);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      toast({
        title: "Success",
        description: "Route recomputed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to recompute route: ${error.message}`,
        variant: "destructive",
      });
    },
  });
}

export function useRecomputeAllRoutes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/routes/recompute', {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error(`Failed to recompute routes: ${res.status}`);
      }

      return res.json();
    },
    onSuccess: (data: { recomputed: number }) => {
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      toast({
        title: "Success",
        description: `Recomputed ${data.recomputed} routes successfully`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to recompute routes: ${error.message}`,
        variant: "destructive",
      });
    },
  });
}
