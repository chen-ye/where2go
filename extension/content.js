(function() {
    console.log("Where2Go Content Script Ready");

    /**
     * @typedef {Object} Provider
     * @property {string} key
     * @property {string} hostname
     * @property {RegExp} regex
     * @property {function(string, URL=): URL} getGpxUrl
     */

    /**
     * Provider Configuration
     * Encapsulates site-specific logic for identifying and fetching routes.
     * @type {Provider[]}
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
                    if (pageUrl) {
                        const sourceUrlObj = new URL(pageUrl);
                        const privacyCode = sourceUrlObj.searchParams.get('privacy_code');
                        if (privacyCode) {
                            u.searchParams.set('privacy_code', privacyCode);
                        }
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
                scanRoutes()
                    .then(routes => sendResponse({ success: true, routes }))
                    .catch(e => sendResponse({ success: false, error: e.message }));
                return true; // Keep channel open for async response
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
     * @typedef {Object} RouteInfo
     * @property {string} id
     * @property {URL} gpxUrl
     * @property {URL} pageUrl
     */

    /**
     * Scans the current page context (URL and Anchors) for route patterns.
     * Uses a Map to deduplicate routes by ID.
     * Supports auto-pagination if enabled.
     * @returns {Promise<RouteInfo[]>}
     */
    async function scanRoutes() {
        // Determine the current provider based on hostname
        const provider = PROVIDERS.find(p => window.location.hostname.includes(p.hostname));
        if (!provider) throw new Error("Current site is not supported.");

        // Check if auto-pagination is enabled
        const settings = await chrome.storage.sync.get({ autoPagination: false });
        const autoPagination = settings.autoPagination;

        const uniqueRoutes = new Map();

        // Helper to add routes from a document/context
        const addRoutesFromContext = (doc, baseUrl) => {
            const candidates = [
                baseUrl,
                ...Array.from(doc.querySelectorAll('a[href]'), a => a.getAttribute('href'))
            ];

            candidates.forEach((urlStr) => {
                if (!urlStr) return;

                // Normalize URL to handle relative paths
                try {
                    const fullUrl = new URL(urlStr, baseUrl);
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
                } catch (e) {
                    // Ignore invalid URLs
                }
            });
        };

        // Initial scan
        addRoutesFromContext(document, window.location.href);

        // TODO: fix auto pagination
        if (autoPagination) {
            console.log("Auto-pagination enabled. Starting...");

            if (provider.key === 'ridewithgps') {
                // Scroll to bottom logic
                const maxScrolls = 5;
                let lastHeight = document.body.scrollHeight;

                for (let i = 0; i < maxScrolls; i++) {
                    window.scrollTo(0, document.body.scrollHeight);
                    await new Promise(r => setTimeout(r, 1500)); // Wait for load

                    const newHeight = document.body.scrollHeight;
                    addRoutesFromContext(document, window.location.href); // Rescan

                    if (newHeight === lastHeight) break; // No new content
                    lastHeight = newHeight;
                }
            } else if (provider.key === 'strava') {
                // Pagination fetching logic
                const maxPages = 5;
                let currentPageDoc = document;
                let currentPageUrl = window.location.href;

                for (let i = 0; i < maxPages; i++) {
                    // Find next link
                    // Strava usually uses .pagination .next_page a or similar
                    // Adjust selector as needed based on Strava's current DOM
                    const nextLink = currentPageDoc.querySelector('[rel="next"]');

                    if (!nextLink) break;

                    const nextUrl = new URL(nextLink.getAttribute('href'), currentPageUrl).href;
                    console.log("Fetching next page:", nextUrl);

                    try {
                        const res = await fetch(nextUrl);
                        const html = await res.text();
                        const parser = new DOMParser();
                        currentPageDoc = parser.parseFromString(html, "text/html");
                        currentPageUrl = nextUrl;

                        addRoutesFromContext(currentPageDoc, currentPageUrl);
                    } catch (e) {
                        console.warn("Failed to fetch next page:", e);
                        break;
                    }
                }
            }
        }

        const results = Array.from(uniqueRoutes.values());
        if (results.length === 0) throw new Error("No routes found on this page.");

        return results;
    }

    /**
     * Fetches URL with 429 Rate Limit handling and Exponential Backoff.
     * @param {URL|string} url
     * @param {number} [retries=3]
     * @returns {Promise<Response>}
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
     * @typedef {Object} ProcessedGpx
     * @property {URL|string} source_url
     * @property {string} title
     * @property {string} gpx_content
     * @property {string[]} tags
     */

    /**
     * Fetches the GPX file and extracts metadata (title).
     * @param {URL|string} gpxUrl
     * @param {URL|string} sourceUrl
     * @returns {Promise<ProcessedGpx>}
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
