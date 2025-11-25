chrome.action.onClicked.addListener((tab) => {
    chrome.storage.sync.get({ baseUrl: '', headers: {} }, (items) => {
        if (!items.baseUrl) {
            chrome.runtime.openOptionsPage();
            return;
        }



        const endpoint = new URL('/api/routes', items.baseUrl).href;
        console.log('Constructed endpoint:', endpoint);

        // Request permission for the configured base URL origin
        const url = new URL(items.baseUrl);
        const origin = `${url.protocol}//${url.host}/*`;

        chrome.permissions.request({
            origins: [origin]
        }, (granted) => {
            if (!granted) {
                console.error('Permission denied for', origin);
                chrome.action.setBadgeText({ text: "PERM", tabId: tab.id });
                chrome.action.setBadgeBackgroundColor({ color: "#F00", tabId: tab.id });
                return;
            }

            // Send message to content script to start scraping
            chrome.tabs.sendMessage(tab.id, { action: "scrape" }, async (response) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    return;
                }

                if (response && response.data) {
                    await saveRoute(endpoint, items.headers, response.data);
                } else if (response && response.error) {
                    console.error("Scraping error:", response.error);
                    chrome.action.setBadgeText({ text: "ERR", tabId: tab.id });
                    chrome.action.setBadgeBackgroundColor({ color: "#F00", tabId: tab.id });
                }
            });
        });
    });
});

async function saveRoute(endpoint, headers, data) {
    try {
        chrome.action.setBadgeText({ text: "..." });

        const finalHeaders = {
            "Content-Type": "application/json",
            ...headers
        };


        console.log('Saving route to:', endpoint);
        console.log('Headers:', finalHeaders);
        console.log('Data:', data);

        const res = await fetch(endpoint, {
            method: "POST",
            headers: finalHeaders,
            body: JSON.stringify(data)
        });

        if (res.ok) {
            chrome.action.setBadgeText({ text: "OK" });
            chrome.action.setBadgeBackgroundColor({ color: "#0F0" });
            setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
        } else {
            throw new Error("Server returned " + res.status);
        }
    } catch (e) {
        console.error("Save failed", e);
        chrome.action.setBadgeText({ text: "ERR" });
        chrome.action.setBadgeBackgroundColor({ color: "#F00" });
    }
}
