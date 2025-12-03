#!/usr/bin/env tsx

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const API_BASE_URL = process.env.API_URL || 'http://localhost:8070';
const TESTDATA_DIR = './testdata';

interface Route {
  id: number;
  source_url: string;
  title: string;
  tags: string[];
  is_completed: boolean;
  created_at: string;
  total_ascent: number;
  total_descent: number;
  bbox: any;
  distance: number;
  geojson?: any;
  grades?: number[];
  valhalla_segments?: any;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  return response.json();
}

async function saveJSON(filename: string, data: any) {
  await writeFile(filename, JSON.stringify(data, null, 4));
  console.log(`✓ Saved ${filename}`);
}

async function updateTestData() {
  console.log('Fetching data from API...\n');

  // Ensure testdata directories exist
  await mkdir(join(TESTDATA_DIR, 'routes'), { recursive: true });

  // 1. Fetch and save routes list
  console.log('Fetching routes list...');
  const routesList = await fetchJSON<Route[]>(`${API_BASE_URL}/api/routes`);
  await saveJSON(join(TESTDATA_DIR, 'routes-list.json'), routesList);
  console.log(`Found ${routesList.length} routes\n`);

  // 2. Fetch and save individual routes with full details
  console.log('Fetching individual route details...');
  for (const route of routesList) {
    try {
      const detailedRoute = await fetchJSON<Route>(`${API_BASE_URL}/api/routes/${route.id}`);
      await saveJSON(join(TESTDATA_DIR, 'routes', `${route.id}.json`), detailedRoute);
    } catch (error) {
      console.error(`✗ Failed to save route ${route.id}:`, error);
    }
  }
  console.log('');

  // 3. Fetch and save sources
  console.log('Fetching sources...');
  try {
    const sources = await fetchJSON<string[]>(`${API_BASE_URL}/api/sources`);
    await saveJSON(join(TESTDATA_DIR, 'sources.json'), sources);
  } catch (error) {
    console.error('✗ Failed to save sources:', error);
  }
  console.log('');

  // 4. Fetch and save tags
  console.log('Fetching tags...');
  try {
    const tags = await fetchJSON<string[]>(`${API_BASE_URL}/api/tags`);
    await saveJSON(join(TESTDATA_DIR, 'tags.json'), tags);
  } catch (error) {
    console.error('✗ Failed to save tags:', error);
  }

  console.log('\n✅ Test data update complete!');
  console.log('\nGenerated files:');
  console.log('  - testdata/routes-list.json');
  console.log('  - testdata/routes/{id}.json');
  console.log('  - testdata/sources.json');
  console.log('  - testdata/tags.json');
}

// Run the script
updateTestData().catch((error) => {
  console.error('Error updating test data:', error);
  process.exit(1);
});
