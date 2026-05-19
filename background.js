chrome.action.onClicked.addListener((tab) => {
  const dashboardUrl = chrome.runtime.getURL("dashboard/index.html");
  chrome.tabs.create({ url: dashboardUrl });
});
