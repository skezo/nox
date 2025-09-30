chrome.runtime.onInstalled.addListener(() => {
  // Initialize storage with empty domains array if not exists
  chrome.storage.sync.get('domains', (result) => {
    if (!result.domains) {
      chrome.storage.sync.set({ domains: [] });
    }
  });
});