document.addEventListener('DOMContentLoaded', () => {
    const scrapeBtn = document.getElementById('scrape-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const statusArea = document.getElementById('status-area');
    const statusText = document.getElementById('status-text');
    const counter = document.getElementById('counter');
    const progressFill = document.getElementById('progress-fill');
    const logText = document.getElementById('log-text');
    const errorMsg = document.getElementById('error-msg');

    if (!scrapeBtn || !settingsBtn || !cancelBtn || !statusArea || !statusText || !counter || !progressFill || !logText || !errorMsg) {
        return;
    }

    // 0. Check configuration
    chrome.storage.sync.get({ baseUrl: '' }, (items) => {
        if (!items.baseUrl) {
            chrome.runtime.openOptionsPage();
        }
    });

    settingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // 1. Initialize: Check if background is already running
    chrome.runtime.sendMessage({ action: "get_status" }, (response) => {
        if (response && response.state) {
            renderState(response.state);
        }
    });

    // 2. Listen for live updates
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "state_update") {
            renderState(msg.state);
        }
    });

    scrapeBtn.addEventListener('click', async () => {
        errorMsg.textContent = "";

        try {
            // Check Permissions
            const hasPermission = await checkAndRequestPermission();
            if (!hasPermission) throw new Error("Permission denied.");

            // Get Active Tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) throw new Error("No active tab.");

            // Send Start Signal to Background
            await chrome.runtime.sendMessage({
                action: "start_batch",
                tabId: tab.id
            });

        } catch (err) {
            console.error(err);
            const error = /** @type {Error} */ (err);
            errorMsg.textContent = error.message;
        }
    });

    cancelBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "cancel_batch" });
    });

    /**
     * @typedef {Object} ScraperState
     * @property {boolean} isRunning
     * @property {number} total
     * @property {number} current
     * @property {number} success
     * @property {number} errors
     * @property {string} statusMessage
     * @property {boolean} isCancelled
     */

    /**
     * @param {ScraperState} state
     */
    function renderState(state) {
        document.body.dataset.state = state.isRunning ? "running" : (state.total > 0 ? "completed" : "idle");
        if (state.isRunning) {

            // Progress Bar
            const pct = state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;
            progressFill.style.setProperty('--progress', `${pct}%`);
            counter.textContent = `${state.success} Ok, ${state.errors} Err, ${state.total} Total`;

            statusText.textContent = "Importing:";
            logText.textContent = state.statusMessage;

            // Log waiting/error states
            logText.dataset.state = state.statusMessage.includes("Error") ? "error" : "normal";

        } else {

            if (state.total > 0) {
                // Show results of last run
                progressFill.style.setProperty('--progress', '100%');
                statusText.textContent = state.isCancelled ? "Cancelled" : "Finished";
                counter.textContent = `${state.success} Ok, ${state.errors} Err, ${state.total} Total`;
                logText.textContent = "Ready";

                progressFill.dataset.state = state.errors > 0 ? "error" : "success";
            }
        }
    }

    async function checkAndRequestPermission() {
        /** @type {{baseUrl: string}} */
        const items = /** @type {{baseUrl: string}} */ (await chrome.storage.sync.get({ baseUrl: '' }));
        if (!items.baseUrl) throw new Error("Base URL not configured.");

        let url;
        try { url = new URL(items.baseUrl); } catch (e) { throw new Error("Invalid Base URL."); }
        const origin = `${url.protocol}//${url.host}/*`;

        return new Promise((resolve) => {
            chrome.permissions.contains({ origins: [origin] }, (hasAccess) => {
                if (hasAccess) resolve(true);
                else chrome.permissions.request({ origins: [origin] }, resolve);
            });
        });
    }
});
