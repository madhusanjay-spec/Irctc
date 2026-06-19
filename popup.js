document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const fromStationInput = document.getElementById('fromStation');
  const toStationInput = document.getElementById('toStation');
  const journeyDateInput = document.getElementById('journeyDate');
  const quotaSelect = document.getElementById('quota');
  const travelClassSelect = document.getElementById('travelClass');
  const passengerNamesInput = document.getElementById('passengerNames');
  const paymentModeSelect = document.getElementById('paymentMode');
  const targetTrainInput = document.getElementById('targetTrain');
  const targetClassSelect = document.getElementById('targetClass');
  const fasterModeCheckbox = document.getElementById('fasterMode');
  const saveBtn = document.getElementById('saveBtn');
  const openIrctcBtn = document.getElementById('openIrctcBtn');
  const statusMessage = document.getElementById('statusMessage');

  // Load saved preferences
  chrome.storage.sync.get([
    'username',
    'password',
    'fromStation',
    'toStation',
    'journeyDate',
    'quota',
    'travelClass',
    'passengerNames',
    'paymentMode',
    'targetTrain',
    'targetClass',
    'fasterMode'
  ], (result) => {
    if (result.username) usernameInput.value = result.username;
    if (result.password) passwordInput.value = result.password;
    if (result.fromStation) fromStationInput.value = result.fromStation;
    if (result.toStation) toStationInput.value = result.toStation;
    if (result.journeyDate) journeyDateInput.value = result.journeyDate;
    if (result.quota) quotaSelect.value = result.quota;
    if (result.travelClass) travelClassSelect.value = result.travelClass;
    if (result.passengerNames) passengerNamesInput.value = result.passengerNames;
    if (result.paymentMode) paymentModeSelect.value = result.paymentMode;
    if (result.targetTrain) targetTrainInput.value = result.targetTrain;
    if (result.targetClass) targetClassSelect.value = result.targetClass;
    if (result.fasterMode !== undefined) fasterModeCheckbox.checked = result.fasterMode;
  });

  // Save preferences
  saveBtn.addEventListener('click', () => {
    const prefs = {
      username: usernameInput.value.trim(),
      password: passwordInput.value.trim(),
      fromStation: fromStationInput.value.trim(),
      toStation: toStationInput.value.trim(),
      journeyDate: journeyDateInput.value.trim(),
      quota: quotaSelect.value,
      travelClass: travelClassSelect.value,
      passengerNames: passengerNamesInput.value.trim(),
      paymentMode: paymentModeSelect.value,
      targetTrain: targetTrainInput.value.trim(),
      targetClass: targetClassSelect.value,
      fasterMode: fasterModeCheckbox.checked
    };

    chrome.storage.sync.set(prefs, () => {
      showStatus('Preferences saved successfully!', 'success');
    });
  });

  // Open IRCTC
  openIrctcBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.irctc.co.in/nget/train-search' });
  });

  // Utility to show status
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    statusMessage.classList.remove('hidden');
    
    setTimeout(() => {
      statusMessage.classList.add('hidden');
    }, 3000);
  }
});
