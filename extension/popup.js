document.addEventListener('DOMContentLoaded', () => {
    const scrapeBtn = document.getElementById('scrape-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const statusArea = document.getElementById('status-area');
    const statusText = document.getElementById('status-text');
    const counter = document.getElementById('counter');
    const progressFill = document.getElementById('progress-fill');
    const logText = document.getElementById('log-text');
    const errorMsg = document.getElementById('error-msg');

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
            if (!tab) throw new Error("No active tab.");

            // Send Start Signal to Background
            await chrome.runtime.sendMessage({
                action: "start_batch",
                tabId: tab.id
            });

        } catch (err) {
            console.error(err);
            errorMsg.textContent = err.message;
        }
    });

    cancelBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "cancel_batch" });
    });

    function renderState(state) {
        if (state.isRunning) {
            statusArea.style.display = "block";
            scrapeBtn.style.display = "none";
            cancelBtn.style.display = "inline-block";

            // Progress Bar
            const pct = state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;
            progressFill.style.width = `${pct}%`;
            counter.textContent = `${state.current}/${state.total}`;

            statusText.textContent = "Processing...";
            logText.textContent = state.statusMessage;

            // Log waiting/error states
            if (state.statusMessage.includes("Error")) logText.style.color = "red";
            else logText.style.color = "#666";

        } else {
            // Idle or Finished
            scrapeBtn.style.display = "inline-block";
            cancelBtn.style.display = "none";

            if (state.total > 0) {
                // Show results of last run
                statusArea.style.display = "block";
                progressFill.style.width = "100%";
                statusText.textContent = state.isCancelled ? "Cancelled" : "Finished";
                counter.textContent = `${state.success} OK, ${state.errors} ERR`;
                logText.textContent = "Ready";

                if (state.errors > 0) progressFill.style.backgroundColor = "#e74c3c";
                else progressFill.style.backgroundColor = "#27ae60";
            } else {
                statusArea.style.display = "none";
            }
        }
    }

    async function checkAndRequestPermission() {
        const items = await chrome.storage.sync.get({ baseUrl: '' });
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
