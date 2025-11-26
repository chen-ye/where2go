(function() {
    console.log("Where2Go Content Script Ready");

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "scrape") {
            handleScrape().then(data => {
                sendResponse({ data: data });
            }).catch(err => {
                sendResponse({ error: err.message });
            });
            return true; // Will respond asynchronously
        }
    });
    async function handleScrape() {
        const url = window.location.href;
        let gpxUrl = "";
        // Default to document title initially
        let title = document.title;

        if (url.includes("ridewithgps.com")) {
            const match = url.match(/routes\/(\d+)/);
            if (match) {
                const gpxUrlObj = new URL(`/routes/${match[1]}.gpx`, 'https://ridewithgps.com');
                gpxUrlObj.searchParams.set('sub_format', 'track');
                gpxUrl = gpxUrlObj.href;
            }
        } else if (url.includes("strava.com")) {
            const match = url.match(/routes\/(\d+)/);
            if (match) {
                gpxUrl = new URL(`/routes/${match[1]}/export_gpx`, 'https://www.strava.com').href;
            }
        } else if (url.includes("connect.garmin.com")) {
            const match = url.match(/course\/(\d+)/);
            if (match) {
                gpxUrl = new URL(`/gc-api/course-service/course/gpx/${match[1]}`, 'https://connect.garmin.com').href;
            }
        }

        if (!gpxUrl) {
            throw new Error("Could not determine GPX URL for this site.");
        }

        console.log("Fetching GPX from:", gpxUrl);

        const gpxRes = await fetch(gpxUrl);
        if (!gpxRes.ok) throw new Error("Failed to fetch GPX file");
        const gpxContent = await gpxRes.text();

        // Parse XML to find the internal GPX name
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(gpxContent, "text/xml");

            // Try metadata name first, then track name
            const metadataName = xmlDoc.querySelector("metadata > name");
            const trkName = xmlDoc.querySelector("trk > name");

            if (metadataName && metadataName.textContent.trim()) {
                title = metadataName.textContent.trim();
            } else if (trkName && trkName.textContent.trim()) {
                title = trkName.textContent.trim();
            }
        } catch (e) {
            console.warn("Failed to parse GPX title, falling back to document title", e);
        }

        return {
            source_url: url,
            title: title,
            gpx_content: gpxContent,
            tags: ["imported"]
        };
    }
})();
