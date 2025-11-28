# Shared Types

This directory contains TypeScript types shared between the frontend and
backend.

## Structure

- `valhalla.ts` - Types related to Valhalla routing API
- `route.ts` - Route and route data types

## Usage

### Backend (Deno)

```typescript
import type { ValhallaSegment } from "../shared/types/valhalla.ts";
```

### Frontend (Vite)

```typescript
import type { ValhallaSegment } from "@shared/types/valhalla.ts";
// or use the re-export
import type { ValhallaSegment } from "../types.ts";
```

## Benefits

- **Single source of truth**: Types defined once, used everywhere
- **Type safety**: Changes to types are reflected immediately in both frontend
  and backend
- **No duplication**: Eliminates the need to manually sync type definitions
