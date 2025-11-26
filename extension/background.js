// Background Scraper Manager
let state = {
    isRunning: false,
    isCancelled: false,
    total: 0,
    current: 0,
    success: 0,
    errors: 0,
    statusMessage: "Idle",
    currentRouteId: null
};

// Listen for messages from Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case "start_batch":
            startBatch(request.tabId)
                .then(() => sendResponse({ success: true }))
                .catch(e => sendResponse({ success: false, error: e.message }));
            return true;
        case "cancel_batch":
            state.isCancelled = true;
            state.statusMessage = "Cancelling...";
            sendResponse({ success: true });
            return false;
        case "get_status":
            sendResponse({ state: state });
            return false;
    }
});

async function startBatch(tabId) {
    if (state.isRunning) throw new Error("Batch already running");

    resetState();
    state.isRunning = true;
    state.statusMessage = "Scanning page for routes...";
    broadcastUpdate();

    try {
        // 1. Get Configuration
        const config = await chrome.storage.sync.get({ baseUrl: '', headers: {} });
        if (!config.baseUrl) throw new Error("Base URL not configured");

        // 2. Scan for Routes
        const response = await sendMessageToTab(tabId, { action: "scan_routes" });
        if (!response.success) throw new Error(response.error);

        const routes = response.routes;
        state.total = routes.length;
        state.statusMessage = `Found ${routes.length} routes. Starting...`;
        broadcastUpdate();
        updateBadge(`${state.current}/${state.total}`, "#00F");

        // 3. Process Queue
        for (let i = 0; i < routes.length; i++) {
            if (state.isCancelled) break;

            const route = routes[i];
            state.current = i + 1;
            state.currentRouteId = route.id;
            state.statusMessage = `Processing ${route.id}...`;
            broadcastUpdate();
            updateBadge(`${state.current}/${state.total}`, "#00F");

            try {
                // A. Fetch GPX (via Content Script)
                const gpxData = await sendMessageToTab(tabId, {
                    action: "fetch_route_gpx",
                    gpxUrl: route.gpxUrl,
                    pageUrl: route.pageUrl
                });

                if (!gpxData.success) throw new Error(gpxData.error);

                // B. Save to Backend
                await saveRouteToBackend(config, gpxData.data);
                state.success++;
            } catch (e) {
                console.error("Route error:", e);
                state.errors++;
            }

            // Throttle
            if (i < routes.length - 1) await new Promise(r => setTimeout(r, 1000));
        }

    } catch (e) {
        console.error("Batch failed", e);
        state.statusMessage = `Error: ${e.message}`;
        state.errors++; // Count global failure
    } finally {
        finishBatch();
    }
}

function finishBatch() {
    state.isRunning = false;
    state.statusMessage = state.isCancelled ? "Cancelled" : "Finished";
    broadcastUpdate();

    if (state.errors > 0) {
        updateBadge("ERR", "#F00");
    } else {
        updateBadge("OK", "#0F0");
    }

    // Clear badge after 5 seconds
    setTimeout(() => {
        if (!state.isRunning) chrome.action.setBadgeText({ text: "" });
    }, 5000);
}

function resetState() {
    state = {
        isRunning: false,
        isCancelled: false,
        total: 0,
        current: 0,
        success: 0,
        errors: 0,
        statusMessage: "Starting...",
        currentRouteId: null
    };
    broadcastUpdate();
}

async function saveRouteToBackend(config, data) {
    const endpoint = new URL('/api/routes', config.baseUrl).href;
    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...config.headers
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
}

// Helpers
function sendMessageToTab(tabId, msg) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, msg, (response) => {
            if (chrome.runtime.lastError) {
                resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
                resolve(response || { success: false, error: "No response" });
            }
        });
    });
}

function broadcastUpdate() {
    chrome.runtime.sendMessage({ action: "state_update", state: state }).catch(() => {
        // Ignore errors if popup is closed
    });
}

function updateBadge(text, color) {
    chrome.action.setBadgeText({ text: String(text) });
    chrome.action.setBadgeBackgroundColor({ color: color });
}
