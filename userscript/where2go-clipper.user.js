// ==UserScript==
// @name         Where2Go Route Clipper
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Clip routes from RideWithGPS, Strava, Garmin and save to Where2Go
// @author       Where2Go
// @match        https://ridewithgps.com/*
// @match        https://www.strava.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    /**
     * Configuration & State
     */
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
     * UI Implementation (Shadow DOM)
     */
    let uiRoot = null;
    let uiShadow = null;
    let uiContainer = null;

    function initUI() {
        // Create Host
        const host = document.createElement('div');
        host.id = 'w2g-clipper-host';
        host.style.position = 'fixed';
        host.style.bottom = '20px';
        host.style.right = '20px';
        host.style.zIndex = '999999';
        document.body.appendChild(host);
        uiRoot = host;

        // Shadow DOM
        uiShadow = host.attachShadow({ mode: 'open' });

        // Styles
        const style = document.createElement('style');
        style.textContent = `
            :host {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-size: 14px;
                color: #e5e7eb;
            }
            .container {
                background-color: #1f2937;
                border: 1px solid #374151;
                border-radius: 8px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                width: 300px;
                overflow: hidden;
                display: none; /* Hidden by default */
            }
            .container.visible {
                display: block;
            }
            .header {
                background-color: #111827;
                padding: 12px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #374151;
            }
            .title {
                font-weight: 600;
                color: #d97706; /* brand-dark / orange-6 */
            }
            .close-btn {
                background: none;
                border: none;
                color: #9ca3af;
                cursor: pointer;
                font-size: 18px;
            }
            .close-btn:hover {
                color: #f3f4f6;
            }
            .body {
                padding: 16px;
            }
            .row {
                margin-bottom: 12px;
            }
            label {
                display: block;
                margin-bottom: 4px;
                font-size: 12px;
                color: #9ca3af;
            }
            input, textarea {
                width: 100%;
                background-color: #374151;
                border: 1px solid #4b5563;
                border-radius: 4px;
                padding: 6px;
                color: #f3f4f6;
                box-sizing: border-box;
            }
            textarea {
                resize: vertical;
                min-height: 60px;
                font-family: monospace;
            }
            .btn-row {
                display: flex;
                gap: 8px;
            }
            button {
                flex: 1;
                padding: 8px;
                border-radius: 4px;
                border: none;
                cursor: pointer;
                font-weight: 500;
                transition: background-color 0.2s;
            }
            .btn-primary {
                background-color: #d97706;
                color: #fff;
            }
            .btn-primary:hover {
                background-color: #b45309;
            }
            .btn-secondary {
                background-color: #4b5563;
                color: #f3f4f6;
            }
            .btn-secondary:hover {
                background-color: #6b7280;
            }
            .btn-danger {
                background-color: #dc2626;
                color: #fff;
            }
            .btn-danger:hover {
                background-color: #b91c1c;
            }
            .status-area {
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px solid #374151;
            }
            .status-text {
                margin-bottom: 8px;
                font-size: 12px;
                color: #d1d5db;
            }
            .progress-bar {
                height: 6px;
                background-color: #374151;
                border-radius: 3px;
                overflow: hidden;
            }
            .progress-fill {
                height: 100%;
                background-color: #10b981;
                width: 0%;
                transition: width 0.3s ease;
            }
            .progress-fill.error {
                background-color: #ef4444;
            }
            .log {
                font-size: 10px;
                color: #9ca3af;
                margin-top: 4px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            /* Floating Button */
            .float-btn {
                width: 48px;
                height: 48px;
                border-radius: 24px;
                background-color: #d97706;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
                border: none;
                font-size: 20px;
            }
            .float-btn:hover {
                background-color: #b45309;
            }
        `;
        uiShadow.appendChild(style);

        // Floating Button
        const floatBtn = document.createElement('button');
        floatBtn.className = 'float-btn';
        floatBtn.innerHTML = '📍'; // Simple icon
        floatBtn.title = 'Where2Go Route Clipper';
        floatBtn.onclick = toggleUI;
        uiShadow.appendChild(floatBtn);

        // Main Container
        uiContainer = document.createElement('div');
        uiContainer.className = 'container';
        uiContainer.innerHTML = `
            <div class="header">
                <span class="title">Where2Go Clipper</span>
                <button class="close-btn" id="close-ui">×</button>
            </div>
            <div class="body">
                <div class="row" id="settings-area">
                    <label for="base-url">Backend URL</label>
                    <input type="text" id="base-url" placeholder="http://localhost:3000" />
                </div>
                <div class="row" id="headers-area" style="display:none;">
                    <label for="headers">Headers (JSON)</label>
                    <textarea id="headers" placeholder='{"Authorization": "Bearer ..."}'></textarea>
                </div>
                <div class="row" style="text-align: right;">
                    <a href="#" id="toggle-headers" style="font-size: 10px; color: #9ca3af;">Show/Hide Headers</a>
                </div>

                <div class="btn-row">
                    <button class="btn-primary" id="btn-scan">Scan & Save</button>
                    <button class="btn-danger" id="btn-cancel" style="display:none;">Cancel</button>
                </div>

                <div class="status-area">
                    <div class="status-text" id="status-text">Ready</div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress-fill"></div>
                    </div>
                    <div class="log" id="log-text"></div>
                </div>
            </div>
        `;
        uiShadow.appendChild(uiContainer);

        // Event Listeners
        uiShadow.getElementById('close-ui').onclick = toggleUI;
        uiShadow.getElementById('toggle-headers').onclick = (e) => {
            e.preventDefault();
            const area = uiShadow.getElementById('headers-area');
            area.style.display = area.style.display === 'none' ? 'block' : 'none';
        };
        uiShadow.getElementById('btn-scan').onclick = startBatch;
        uiShadow.getElementById('btn-cancel').onclick = cancelBatch;

        // Input Persistence
        const baseUrlInput = uiShadow.getElementById('base-url');
        const headersInput = uiShadow.getElementById('headers');

        baseUrlInput.value = getValue('baseUrl', '');
        headersInput.value = getValue('headers', '{}');

        baseUrlInput.onchange = () => setValue('baseUrl', baseUrlInput.value);
        headersInput.onchange = () => setValue('headers', headersInput.value);
    }

    function toggleUI() {
        uiContainer.classList.toggle('visible');
    }

    function updateUI() {
        if (!uiShadow) return;

        const btnScan = uiShadow.getElementById('btn-scan');
        const btnCancel = uiShadow.getElementById('btn-cancel');
        const statusText = uiShadow.getElementById('status-text');
        const progressFill = uiShadow.getElementById('progress-fill');
        const logText = uiShadow.getElementById('log-text');

        if (state.isRunning) {
            btnScan.style.display = 'none';
            btnCancel.style.display = 'block';

            const pct = state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;
            progressFill.style.width = `${pct}%`;
            progressFill.classList.remove('error');

            statusText.textContent = `Processing ${state.current}/${state.total}`;
            logText.textContent = state.statusMessage;
        } else {
            btnScan.style.display = 'block';
            btnCancel.style.display = 'none';

            if (state.total > 0) {
                 progressFill.style.width = '100%';
                 if (state.errors > 0) progressFill.classList.add('error');
                 else progressFill.classList.remove('error');
                 statusText.textContent = state.isCancelled ? "Cancelled" : `Finished: ${state.success} OK, ${state.errors} ERR`;
            } else {
                statusText.textContent = "Ready";
            }
            logText.textContent = state.statusMessage;
        }
    }

    /**
     * Logic
     */

    async function startBatch() {
        if (state.isRunning) return;

        // Reset State
        state = {
            isRunning: true,
            isCancelled: false,
            total: 0,
            current: 0,
            success: 0,
            errors: 0,
            statusMessage: "Starting...",
            currentRouteId: null
        };
        updateUI();

        try {
            // 1. Get Config
            const baseUrl = getValue('baseUrl', '');
            let headers = {};
            try {
                headers = JSON.parse(getValue('headers', '{}'));
            } catch (e) {
                throw new Error("Invalid JSON in headers");
            }

            if (!baseUrl) throw new Error("Base URL is required");

            // 2. Scan Routes
            state.statusMessage = "Scanning page...";
            updateUI();

            const routes = scanRoutes();
            state.total = routes.length;
            state.statusMessage = `Found ${routes.length} routes.`;
            updateUI();

            // 3. Process Queue
            for (let i = 0; i < routes.length; i++) {
                if (state.isCancelled) break;

                const route = routes[i];
                state.current = i + 1;
                state.currentRouteId = route.id;
                state.statusMessage = `Processing ${route.id}...`;
                updateUI();

                try {
                    // Fetch GPX
                    const gpxData = await processGpxUrl(route.gpxUrl, route.pageUrl);

                    // Save to Backend
                    await saveRouteToBackend(baseUrl, headers, gpxData);

                    state.success++;
                } catch (e) {
                    console.error("Route Error:", e);
                    state.errors++;
                    state.statusMessage = `Error: ${e.message}`;
                    updateUI(); // Show error briefly
                }

                // Throttle
                if (i < routes.length - 1) await new Promise(r => setTimeout(r, 1000));
            }

        } catch (e) {
            console.error(e);
            state.statusMessage = `Error: ${e.message}`;
            state.errors++;
        } finally {
            state.isRunning = false;
            updateUI();
        }
    }

    function cancelBatch() {
        state.isCancelled = true;
        state.statusMessage = "Cancelling...";
        updateUI();
    }

    function scanRoutes() {
        const provider = PROVIDERS.find(p => window.location.hostname.includes(p.hostname));
        if (!provider) throw new Error("Current site is not supported.");

        const uniqueRoutes = new Map();

        const candidates = [
            window.location.href,
            ...Array.from(document.querySelectorAll('a[href]'), a => a.getAttribute('href'))
        ];

        candidates.forEach((urlStr) => {
            if (!urlStr) return;
            try {
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
            } catch (e) {
                // Ignore invalid URLs
            }
        });

        const results = Array.from(uniqueRoutes.values());
        if (results.length === 0) throw new Error("No routes found on this page.");

        return results;
    }

    async function processGpxUrl(gpxUrl, sourceUrl) {
        console.log("Fetching GPX from:", gpxUrl);
        const res = await fetchWithBackoff(gpxUrl);
        const gpxContent = await res.text();

        let title = document.title;
        try {
            const xmlDoc = new DOMParser().parseFromString(gpxContent, "text/xml");
            const nameNode = xmlDoc.querySelector("metadata > name") || xmlDoc.querySelector("trk > name");
            if (nameNode && nameNode.textContent.trim()) {
                title = nameNode.textContent.trim();
            }
        } catch (e) {
            console.warn("Failed to parse GPX title", e);
        }

        return {
            source_url: sourceUrl.href,
            title: title,
            gpx_content: gpxContent,
            tags: ["imported", "collection"]
        };
    }

    async function fetchWithBackoff(url, retries = 3) {
        let delay = 30000;
        for (let i = 0; i <= retries; i++) {
            const res = await fetch(url);
            if (res.ok) return res;

            if (res.status === 429) {
                const retryAfter = res.headers.get('Retry-After');
                let waitTime = delay;
                if (retryAfter) {
                    waitTime = /^\d+$/.test(retryAfter)
                        ? parseInt(retryAfter, 10) * 1000
                        : (Date.parse(retryAfter) - Date.now()) || delay;
                }
                waitTime += 1000;
                console.warn(`Rate limit hit (429). Waiting ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                delay *= 2;
                continue;
            }
            throw new Error(`HTTP ${res.status}`);
        }
        throw new Error("Max retries exceeded");
    }

    function saveRouteToBackend(baseUrl, headers, data) {
        return new Promise((resolve, reject) => {
            const endpoint = new URL('/api/routes', baseUrl).href;

            GM_xmlhttpRequest({
                method: "POST",
                url: endpoint,
                headers: {
                    "Content-Type": "application/json",
                    ...headers
                },
                data: JSON.stringify(data),
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response);
                    } else {
                        reject(new Error(`Backend HTTP ${response.status}: ${response.statusText}`));
                    }
                },
                onerror: function(error) {
                    reject(error);
                }
            });
        });
    }

    /**
     * Storage Helpers
     */
    function getValue(key, def) {
        if (typeof GM_getValue !== 'undefined') return GM_getValue(key, def);
        return localStorage.getItem('w2g_' + key) || def;
    }

    function setValue(key, val) {
        if (typeof GM_setValue !== 'undefined') return GM_setValue(key, val);
        return localStorage.setItem('w2g_' + key, val);
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }

})();
