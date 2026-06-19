// Service worker for background tasks
chrome.runtime.onInstalled.addListener(() => {
  console.log('IRCTC Premium Tatkal Assistant Installed.');
  
  // Initialize default settings if not present
  chrome.storage.sync.get([
    'username',
    'password',
    'fromStation',
    'toStation',
    'journeyDate',
    'quota',
    'travelClass',
    'targetTrain',
    'targetClass'
  ], (result) => {
    const defaults = {};
    if (!result.username) defaults.username = '';
    if (!result.password) defaults.password = '';
    if (!result.fromStation) defaults.fromStation = 'BODINAYAKKANUR - BDNK';
    if (!result.toStation) defaults.toStation = 'CHENNAI EGMORE - MS (CHENNAI)';
    if (!result.journeyDate) {
      // Default to next day
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      // Format to DD/MM/YYYY
      const dd = String(tomorrow.getDate()).padStart(2, '0');
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const yyyy = tomorrow.getFullYear();
      defaults.journeyDate = `${dd}/${mm}/${yyyy}`;
    }
    if (!result.quota) defaults.quota = 'PT'; // Premium Tatkal
    if (!result.travelClass) defaults.travelClass = 'All Classes';
    if (!result.targetTrain) defaults.targetTrain = '';
    if (!result.targetClass) defaults.targetClass = '';

    if (Object.keys(defaults).length > 0) {
      chrome.storage.sync.set(defaults, () => {
        console.log('Default settings initialized.');
      });
    }
  });
});
