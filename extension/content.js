(function() {
    console.log("Where2Go Content Script Ready");

    /**
     * Provider Configuration
     * Encapsulates site-specific logic for identifying and fetching routes.
     */
    const PROVIDERS = [
        {
            key: 'ridewithgps',
            hostname: 'ridewithgps.com',
            // Matches /routes/12345
            regex: /\/routes\/(\d+)/,
            getGpxUrl: (id, pageUrl) => {
                const u = new URL(`/routes/${id}.gpx`, 'https://ridewithgps.com');
                u.searchParams.set('sub_format', 'track');

                // Check for privacy_code in the source URL (e.g. ?privacy_code=...)
                try {
                    const sourceUrlObj = new URL(pageUrl);
                    const privacyCode = sourceUrlObj.searchParams.get('privacy_code');
                    if (privacyCode) {
                        u.searchParams.set('privacy_code', privacyCode);
                    }
                } catch (e) {
                    // Fallback if pageUrl is somehow invalid
                }

                return u;
            }
        },
        {
            key: 'strava',
            hostname: 'strava.com',
            // Matches /routes/12345
            regex: /\/routes\/(\d+)/,
            getGpxUrl: (id) => new URL(`/routes/${id}/export_gpx`, 'https://www.strava.com')
        }
    ];

    /**
     * Message Event Listener
     * Handles coordination between the popup/background script and this content script.
     */
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const handlers = {
            scan_routes: () => {
                try {
                    const routes = scanRoutes();
                    sendResponse({ success: true, routes });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            },
            fetch_route_gpx: () => {
                processGpxUrl(request.gpxUrl, request.pageUrl)
                    .then(data => sendResponse({ success: true, data }))
                    .catch(e => sendResponse({ success: false, error: e.message }));
                return true; // Keep channel open for async response
            }
        };

        if (handlers[request.action]) {
            return handlers[request.action]();
        }
    });

    /**
     * Scans the current page context (URL and Anchors) for route patterns.
     * Uses a Map to deduplicate routes by ID.
     */
    function scanRoutes() {
        // Determine the current provider based on hostname
        const provider = PROVIDERS.find(p => window.location.hostname.includes(p.hostname));
        if (!provider) throw new Error("Current site is not supported.");

        const uniqueRoutes = new Map();

        // 1. Check current page URL (Handles "Single Page" scenario)
        // 2. Check all anchor tags (Handles "List/Search" scenario)
        // Note: Checking window.location.href FIRST ensures that if we are on a private route page,
        // we capture the privacy_code from the main URL before any generic links on the page.
        const candidates = [
            window.location.href,
            ...Array.from(document.querySelectorAll('a[href]'), a => a.getAttribute('href'))
        ];

        candidates.forEach((urlStr) => {
            if (!urlStr) return;

            // Normalize URL to handle relative paths
            const fullUrl = new URL(urlStr, window.location.href);
            const match = fullUrl.href.match(provider.regex);

            if (match) {
                const id = match[1];
                if (!uniqueRoutes.has(id)) {
                    uniqueRoutes.set(id, {
                        id: id,
                        gpxUrl: provider.getGpxUrl(id, fullUrl),
                        pageUrl: fullUrl
                    });
                }
            }
        });

        const results = Array.from(uniqueRoutes.values());
        if (results.length === 0) throw new Error("No routes found on this page.");

        return results;
    }

    /**
     * Fetches URL with 429 Rate Limit handling and Exponential Backoff.
     */
    async function fetchWithBackoff(url, retries = 3) {
        let delay = 30000;

        for (let i = 0; i <= retries; i++) {
            const res = await fetch(url);
            if (res.ok) return res;

            if (res.status === 429) {
                const retryAfter = res.headers.get('Retry-After');
                let waitTime = delay;

                if (retryAfter) {
                    // Header can be seconds or a specific date string
                    waitTime = /^\d+$/.test(retryAfter)
                        ? parseInt(retryAfter, 10) * 1000
                        : (Date.parse(retryAfter) - Date.now()) || delay;
                }

                waitTime += 1000; // Safety buffer
                console.warn(`Rate limit hit (429). Waiting ${waitTime}ms...`);

                await new Promise(resolve => setTimeout(resolve, waitTime));
                delay *= 2; // Increase default delay for next attempt
                continue;
            }

            throw new Error(`HTTP ${res.status}`);
        }
        throw new Error("Max retries exceeded for rate limit.");
    }

    /**
     * Fetches the GPX file and extracts metadata (title).
     */
    async function processGpxUrl(gpxUrl, sourceUrl) {
        console.log("Fetching GPX from:", gpxUrl);

        const res = await fetchWithBackoff(gpxUrl);
        const gpxContent = await res.text();

        let title = document.title;
        try {
            const xmlDoc = new DOMParser().parseFromString(gpxContent, "text/xml");
            // Try metadata name first, fall back to track name
            const nameNode = xmlDoc.querySelector("metadata > name") || xmlDoc.querySelector("trk > name");
            if (nameNode && nameNode.textContent.trim()) {
                title = nameNode.textContent.trim();
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
