(function() {
    console.log("Where2Go Content Script Ready");

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "scan_routes") {
            try {
                const routes = scanRoutes();
                sendResponse({ success: true, routes: routes });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        } else if (request.action === "fetch_route_gpx") {
            processGpxUrl(request.gpxUrl, request.pageUrl)
                .then(data => sendResponse({ success: true, data: data }))
                .catch(e => sendResponse({ success: false, error: e.message }));
            return true; // Async
        }
    });

    function scanRoutes() {
        const url = window.location.href;

        // Strategy: specific extractors for different sites, or generic fallback
        const uniqueRoutes = new Map(); // id -> {id, gpxUrl, pageUrl}

        const anchors = document.querySelectorAll('a[href]');
        const isRwgps = window.location.hostname.includes("ridewithgps.com");
        const isStrava = window.location.hostname.includes("strava.com");

        anchors.forEach(a => {
            const href = a.getAttribute('href');
            if (!href) return;

            if (isRwgps) {
                const match = href.match(/\/routes\/(\d+)/);
                if (match) {
                    const id = match[1];
                    if (!uniqueRoutes.has(id)) {
                        const u = new URL(`/routes/${id}.gpx`, 'https://ridewithgps.com');
                        u.searchParams.set('sub_format', 'track');
                        uniqueRoutes.set(id, {
                            id: id,
                            gpxUrl: u.href,
                            pageUrl: new URL(href, window.location.href).href
                        });
                    }
                }
            } else if (isStrava) {
                const match = href.match(/\/routes\/(\d+)/);
                if (match) {
                    const id = match[1];
                    if (!uniqueRoutes.has(id)) {
                        uniqueRoutes.set(id, {
                            id: id,
                            gpxUrl: new URL(`/routes/${id}/export_gpx`, 'https://www.strava.com').href,
                            pageUrl: new URL(href, window.location.href).href
                        });
                    }
                }
            }
        });

        const results = Array.from(uniqueRoutes.values());
        if (results.length === 0) {
            // Fallback: If no list found, maybe we are ON a single route page?
            // This allows the "Single Page" functionality to work with the same flow
            const singleResult = detectSinglePage(url);
            if (singleResult) return [singleResult];

            throw new Error("No routes found on this page.");
        }

        return results;
    }

    function detectSinglePage(url) {
        let id, gpxUrl;
        if (url.includes("ridewithgps.com") && (id = url.match(/routes\/(\d+)/)?.[1])) {
             const u = new URL(`/routes/${id}.gpx`, 'https://ridewithgps.com');
             u.searchParams.set('sub_format', 'track');
             gpxUrl = u.href;
        } else if (url.includes("strava.com") && (id = url.match(/routes\/(\d+)/)?.[1])) {
             gpxUrl = new URL(`/routes/${id}/export_gpx`, 'https://www.strava.com').href;
        }

        if (id && gpxUrl) {
            return { id, gpxUrl, pageUrl: url };
        }
        return null;
    }

    // --- Fetch Logic with Backoff ---

    async function fetchWithBackoff(url, retries = 3) {
        let delay = 30000;

        for (let i = 0; i <= retries; i++) {
            const res = await fetch(url);

            if (res.status === 429) {
                const retryAfter = res.headers.get('Retry-After');
                let waitTime = delay;

                if (retryAfter) {
                    if (/^\d+$/.test(retryAfter)) {
                        waitTime = parseInt(retryAfter, 10) * 1000;
                    } else {
                        const d = Date.parse(retryAfter);
                        if (!isNaN(d)) waitTime = d - Date.now();
                    }
                }

                waitTime += 1000; // Buffer

                // Inform background we are waiting?
                // Currently just waiting silently in content script, causing "Processing" to hang in background
                console.warn(`Hit 429. Waiting ${waitTime}ms`);
                await new Promise(r => setTimeout(r, waitTime));
                delay *= 2;
                continue;
            }

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        }
        throw new Error("Max retries exceeded for rate limit.");
    }

    async function processGpxUrl(gpxUrl, sourceUrl) {
        console.log("Fetching GPX from:", gpxUrl);

        const gpxRes = await fetchWithBackoff(gpxUrl);
        const gpxContent = await gpxRes.text();

        let title = document.title;

        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(gpxContent, "text/xml");
            const metadataName = xmlDoc.querySelector("metadata > name");
            const trkName = xmlDoc.querySelector("trk > name");

            if (metadataName && metadataName.textContent.trim()) {
                title = metadataName.textContent.trim();
            } else if (trkName && trkName.textContent.trim()) {
                title = trkName.textContent.trim();
            }
        } catch (e) {
            console.warn("Failed to parse GPX title", e);
        }

        return {
            source_url: sourceUrl,
            title: title,
            gpx_content: gpxContent,
            tags: ["imported", "collection"]
        };
    }
})();
