# Update Test Data Script

A utility script to fetch data from the live API and save it to the `testdata/`
directory, organized by endpoint.

## Usage

```bash
yarn update-testdata
```

## Generated Structure

The script creates the following test data files:

```
testdata/
├── routes-list.json          # GET /api/routes (list of routes)
├── routes/
│   ├── {id}.json            # GET /api/routes/{id} (individual route details)
│   └── ...
├── sources.json             # GET /api/sources
└── tags.json                # GET /api/tags
```

## What It Does

1. **Routes List** (`/api/routes`)
   - Fetches all routes (without full GeoJSON)
   - Saves to `testdata/routes-list.json`

2. **Individual Routes** (`/api/routes/{id}`)
   - Fetches full details for each route (including GeoJSON, grades,
     valhalla_segments)
   - Saves each to `testdata/routes/{id}.json`

3. **Sources** (`/api/sources`)
   - Fetches list of unique route sources
   - Saves to `testdata/sources.json`

4. **Tags** (`/api/tags`)
   - Fetches list of unique tags
   - Saves to `testdata/tags.json`

## Environment Variables

- `API_URL` - Base URL of the API (default: `http://localhost:8070`)

## Example

```bash
# Use default localhost API
yarn update-testdata

# Use custom API URL
API_URL=http://production-server:8070 yarn update-testdata
```

## Using in Tests

```typescript
// Import full route details
import testRoute from "../testdata/routes/772.json";

// Import routes list
import routesList from "../testdata/routes-list.json";

// Import sources
import sources from "../testdata/sources.json";

// Import tags
import tags from "../testdata/tags.json";
```
