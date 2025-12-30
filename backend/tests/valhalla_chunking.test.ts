import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRouteAttributes } from '../valhalla.ts';

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('Valhalla Chunking', () => {
    beforeEach(() => {
        fetchMock.mockClear();
    });

    it('should not chunk small routes', async () => {
        // Mock success response
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                edges: [{ begin_shape_index: 0, end_shape_index: 2, length: 10, speed: 20 }]
            })
        });

        const coords = [[0, 0], [0.1, 0.1], [0.2, 0.2]]; // Small route
        const result = await getRouteAttributes(coords);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result).toHaveLength(1);
        expect(result![0].start).toBe(0);
        expect(result![0].end).toBe(2);
    });

    it('should chunk routes exceeding max points', async () => {
        // Mock max points = 15000. Create 16000 points.
        const coords = [];
        for (let i = 0; i < 16000; i++) {
            coords.push([0, i * 0.00001]); // Tiny distance, just many points
        }

        // Expect 2 calls
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    edges: [{ begin_shape_index: 0, end_shape_index: 14999, length: 1, speed: 10 }]
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    edges: [{ begin_shape_index: 0, end_shape_index: 1000, length: 1, speed: 10 }]
                })
            });

        const result = await getRouteAttributes(coords);

        expect(fetchMock).toHaveBeenCalledTimes(2);

        // Check stitching
        // Chunk 1: indices 0-14999. Result indices 0-14999.
        // Chunk 2: indices 14999-15999. Orig response 0-1000. Adjusted 14999-15999.

        expect(result).toHaveLength(2);
        expect(result![0].start).toBe(0);
        expect(result![0].end).toBe(14999);

        expect(result![1].start).toBe(14999);
        expect(result![1].end).toBe(15999); // 14999 + 1000
    });

    it('should chunk routes exceeding max distance', async () => {
        // Max dist 150km. Create 3 points: 0km, 140km, 280km.
        // Chunk 1: 0->140km. (Size 2). Dist 140.
        // Next: 140km->280km. Dist 140. Total 280 > 150.
        // So split at point 1.

        // 1 deg lat is approx 111km.
        // Create 3 points: A, B, C. A->B = 100km. B->C = 100km.
        // Total 200km. Should split at B because max distance is 150km.
        // 1 deg lat is approx 111km.
        const coords = [
            [0, 0],
            [0, 0.9], // ~100km
            [0, 1.8]  // ~100km from B
        ];

        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    edges: [{ begin_shape_index: 0, end_shape_index: 1, length: 100, speed: 10 }]
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    edges: [{ begin_shape_index: 0, end_shape_index: 1, length: 100, speed: 10 }]
                })
            });

        const result = await getRouteAttributes(coords);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(result).toHaveLength(2);

        // Chunk 1: [A, B]. indices 0-1.
        expect(result![0].start).toBe(0);
        expect(result![0].end).toBe(1);

        // Chunk 2: [B, C]. indices 0-1 (relative). Adjusted 1-2.
        // Offset = (chunk1.len - 1) = (2-1) = 1.
        expect(result![1].start).toBe(1);
        expect(result![1].end).toBe(2);
    });
});
