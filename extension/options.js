// Saves options to chrome.storage
const saveOptions = () => {
  const baseUrl = document.getElementById('baseUrl').value;
  const headersStr = document.getElementById('headers').value;

  let headers = {};
  try {
    if (headersStr.trim()) {
        headers = JSON.parse(headersStr);
    }
  } catch (e) {
    const status = document.getElementById('status');
    status.textContent = 'Error: Invalid JSON in headers.';
    status.style.color = 'red';
    return;
  }

  chrome.storage.sync.set(
    { baseUrl: baseUrl, headers: headers },
    () => {
      // Update status to let user know options were saved.
      const status = document.getElementById('status');
      status.textContent = 'Options saved.';
      status.style.color = 'green';
      setTimeout(() => {
        status.textContent = '';
      }, 2000);
    }
  );
};

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
const restoreOptions = () => {
  chrome.storage.sync.get(
    { baseUrl: '', headers: {} },
    (items) => {
      document.getElementById('baseUrl').value = items.baseUrl;
      document.getElementById('headers').value = JSON.stringify(items.headers, null, 2);
    }
  );
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
