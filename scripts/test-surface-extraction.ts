import { getRouteAttributes } from '../backend/valhalla.ts';

// Mock Valhalla API for testing without network calls if needed,
// but for this verification we will use the default endpoint (public demo)
// assuming internet access is allowed.

async function testSurfaceExtraction() {
  console.log("Starting test...");

  // Extract coordinates from TEST_GPX manually for the test
  // Points in Munich
  const coordinates = [
    [11.57549, 48.13743],
    [11.57555, 48.13750],
    [11.57560, 48.13760],
    [11.57570, 48.13780],
    [11.57580, 48.13800]
  ];

  console.log("Calling getRouteAttributes...");
  const segments = await getRouteAttributes(coordinates);

  console.log("Result:", JSON.stringify(segments, null, 2));

  if (segments && segments.length > 0) {
    console.log("✅ Successfully retrieved segments.");
    const first = segments[0];

    // Check Core Fields
    if (typeof first.start === 'number' && typeof first.end === 'number') {
         console.log("✅ Start/End indices present.");
    }

    if (first.surface && typeof first.surface === 'string') {
        console.log(`✅ Surface found: ${first.surface}`);
    } else {
        console.error("❌ Surface field missing or invalid.");
    }

    if (typeof first.duration === 'number') {
        console.log(`✅ Duration found: ${first.duration}s`);
    } else {
         console.error("❌ Duration field missing or invalid.");
    }

    // Check New Fields (some might be undefined depending on the road data, but the keys should exist in the type)
    if (first.road_class !== undefined) console.log(`✅ Road Class: ${first.road_class}`);
    if (first.speed !== undefined) console.log(`✅ Speed: ${first.speed} km/h`);
    if (first.use !== undefined) console.log(`✅ Use: ${first.use}`);

  } else {
    console.error("❌ Failed to retrieve segments (or API returned empty).");
  }
}

testSurfaceExtraction();
