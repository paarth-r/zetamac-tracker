function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
}

chrome.action.onClicked.addListener(openDashboard);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'open-dashboard') openDashboard();
});
