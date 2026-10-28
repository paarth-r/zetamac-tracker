const BRIDGE = 'com.zetamac_tracker.bridge';

function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
}

// Copy games to the optional local bridge (bridge/install.sh). Without the
// bridge installed this fails quietly and the extension works as before.
function sendToBridge(games) {
  if (!games.length) return;
  try {
    chrome.runtime.sendNativeMessage(BRIDGE, { type: 'games', games }, () => {
      void chrome.runtime.lastError;
    });
  } catch (e) { /* nativeMessaging unavailable */ }
}

function syncAll() {
  chrome.storage.local.get({ games: [] }, (data) => sendToBridge(data.games));
}

chrome.action.onClicked.addListener(openDashboard);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'open-dashboard') openDashboard();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.games) return;
  const before = new Set((changes.games.oldValue || []).map((g) => g.id));
  sendToBridge((changes.games.newValue || []).filter((g) => !before.has(g.id)));
});

// The bridge dedupes by game id, so a full sync is safe and backfills history.
chrome.runtime.onInstalled.addListener(syncAll);
chrome.runtime.onStartup.addListener(syncAll);
