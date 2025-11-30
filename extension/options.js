// Saves options to chrome.storage
const saveOptions = () => {
  const baseUrlInput = /** @type {HTMLInputElement} */ (document.getElementById('baseUrl'));
  const headersInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('headers'));
  const autoPaginationInput = /** @type {HTMLInputElement} */ (document.getElementById('autoPagination'));

  const baseUrl = baseUrlInput.value;
  const headersStr = headersInput.value;
  const autoPagination = autoPaginationInput.checked;

  let headers = {};
  try {
    if (headersStr.trim()) {
        headers = JSON.parse(headersStr);
    }
  } catch (e) {
    const status = document.getElementById('status');
    if (status) {
        status.textContent = 'Error: Invalid JSON in headers.';
        status.style.color = 'red';
    }
    return;
  }

  chrome.storage.sync.set(
    { baseUrl: baseUrl, headers: headers, autoPagination: autoPagination },
    () => {
      // Update status to let user know options were saved.
      const status = document.getElementById('status');
      if (status) {
          status.textContent = 'Options saved.';
          status.style.color = 'green';
          setTimeout(() => {
            status.textContent = '';
          }, 2000);
      }
    }
  );
};

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
const restoreOptions = () => {
  chrome.storage.sync.get(
    { baseUrl: '', headers: {}, autoPagination: false },
    /** @param {{baseUrl: string, headers: Object, autoPagination: boolean}} items */
    (items) => {
      const baseUrlInput = /** @type {HTMLInputElement} */ (document.getElementById('baseUrl'));
      const headersInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('headers'));
      const autoPaginationInput = /** @type {HTMLInputElement} */ (document.getElementById('autoPagination'));

      if (baseUrlInput) baseUrlInput.value = items.baseUrl;
      if (headersInput) headersInput.value = JSON.stringify(items.headers, null, 2);
      if (autoPaginationInput) autoPaginationInput.checked = items.autoPagination;
    }
  );
};

document.addEventListener('DOMContentLoaded', restoreOptions);
const saveBtn = document.getElementById('save');
if (saveBtn) saveBtn.addEventListener('click', saveOptions);
