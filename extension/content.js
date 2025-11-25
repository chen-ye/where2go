(async () => {
  const DEFAULT_API_URL = "http://localhost:8000/api/routes";

  console.log("Where2Go Content Script Loaded");

  // Simple UI to trigger the save
  const btn = document.createElement("button");
  btn.innerText = "Save to Where2Go";
  btn.style.position = "fixed";
  btn.style.top = "100px";
  btn.style.right = "20px";
  btn.style.zIndex = "9999";
  btn.style.padding = "10px 20px";
  btn.style.backgroundColor = "#007bff";
  btn.style.color = "white";
  btn.style.border = "none";
  btn.style.borderRadius = "5px";
  btn.style.cursor = "pointer";
  btn.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
  
  document.body.appendChild(btn);

  btn.onclick = async () => {
    btn.innerText = "Saving...";
    btn.disabled = true;
    try {
        await handleSave();
        btn.innerText = "Saved!";
        btn.style.backgroundColor = "#28a745";
    } catch (e) {
        console.error(e);
        btn.innerText = "Error!";
        btn.style.backgroundColor = "#dc3545";
        alert("Failed to save: " + e.message);
    }
    setTimeout(() => {
        btn.disabled = false;
        btn.innerText = "Save to Where2Go";
        btn.style.backgroundColor = "#007bff";
    }, 3000);
  };

  async function handleSave() {
    const url = window.location.href;
    let gpxUrl = "";
    let title = document.title;

    if (url.includes("ridewithgps.com")) {
        // ID is usually the last part or after /routes/
        const match = url.match(/routes\/(\d+)/);
        if (match) {
            gpxUrl = `https://ridewithgps.com/routes/${match[1]}.gpx?sub_format=track`;
        }
    } else if (url.includes("strava.com")) {
        const match = url.match(/routes\/(\d+)/);
        if (match) {
            gpxUrl = `https://www.strava.com/routes/${match[1]}/export_gpx`;
        }
    } else if (url.includes("connect.garmin.com")) {
         const match = url.match(/course\/(\d+)/);
         if (match) {
             gpxUrl = `https://connect.garmin.com/gc-api/course-service/course/gpx/${match[1]}`;
         }
    }

    if (!gpxUrl) {
        throw new Error("Could not determine GPX URL for this site.");
    }

    console.log("Fetching GPX from:", gpxUrl);

    // Fetch the GPX file content
    // Note: This relies on the session cookies being sent automatically by the browser
    // or the endpoint being public. 
    // For some sites (like Garmin), this fetch might fail if CORS is strict on their API 
    // even from content script. However, usually content scripts are less restricted 
    // or we might need to use background script to fetch if CORS issues arise.
    // For MVP we assume we can fetch.
    
    const gpxRes = await fetch(gpxUrl);
    if (!gpxRes.ok) throw new Error("Failed to fetch GPX file");
    const gpxContent = await gpxRes.text();

    console.log("GPX fetched, length:", gpxContent.length);

    // Upload to our backend
    const payload = {
        source_url: url,
        title: title,
        gpx_content: gpxContent,
        tags: ["imported"]
    };

    const saveRes = await fetch(DEFAULT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!saveRes.ok) {
        throw new Error("Backend rejected the save: " + saveRes.statusText);
    }
  }

})();
