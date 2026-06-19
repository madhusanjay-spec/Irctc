// --- Hacker Terminal UI & Logger ---
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

function createHackerTerminal() {
  let term = document.getElementById('irctc-pt-terminal');
  if (!term) {
    term = document.createElement('div');
    term.id = 'irctc-pt-terminal';
    term.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      width: 350px;
      max-height: 300px;
      background: rgba(0, 10, 0, 0.9);
      color: #0f0;
      border: 1px solid #0f0;
      border-radius: 4px;
      padding: 10px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      overflow-y: auto;
      z-index: 999998;
      pointer-events: none;
      box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
      text-shadow: 0 0 2px #0f0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;
    document.body.appendChild(term);
  }
  return term;
}

function appendToTerminal(msg, isError) {
  const term = createHackerTerminal();
  const line = document.createElement('div');
  const timestamp = new Date().toISOString().substring(11, 23); // HH:mm:ss.SSS
  const cleanMsg = msg.replace('[IRCTC Assistant] ', '').replace('IRCTC Premium Tatkal Assistant: ', '');
  line.innerText = `[${timestamp}] > ${cleanMsg}`;
  if (isError) {
    line.style.color = '#ff3f34';
    line.style.textShadow = '0 0 2px #ff3f34';
  }
  term.appendChild(line);
  term.scrollTop = term.scrollHeight;
}

console.log = function(...args) {
  originalConsoleLog.apply(console, args);
  if (typeof args[0] === 'string' && (args[0].includes('[IRCTC Assistant]') || args[0].includes('IRCTC Premium Tatkal Assistant:'))) {
    appendToTerminal(args[0], false);
  }
};

console.error = function(...args) {
  originalConsoleError.apply(console, args);
  if (typeof args[0] === 'string' && (args[0].includes('[IRCTC Assistant]') || args[0].includes('IRCTC Premium Tatkal Assistant:'))) {
    appendToTerminal(args[0], true);
  }
};

// --- Global State Variables ---
let prefs = {};
let hasFilledLogin = false;
let hasClickedSignIn = false;
let hasFilledSearch = false;
let hasInitializedResults = false;
let hasFilledPassengers = false;
let hasSolvedReviewCaptcha = false;

// Intervals
let loginPopupInterval = null;
let fillRetryInterval = null;
let searchRetryInterval = null;
let searchRetries = 0;

// Timer State
let automationTimerInterval = null;
let automationStartTime = 0;

function createTimerUI() {
  let timerDiv = document.getElementById('irctc-pt-timer');
  if (!timerDiv) {
    timerDiv = document.createElement('div');
    timerDiv.id = 'irctc-pt-timer';
    timerDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #000000e6;
      color: #ff3f34;
      border: 2px solid #ff3f34;
      padding: 10px 20px;
      border-radius: 8px;
      z-index: 999999;
      font-family: monospace;
      font-size: 24px;
      font-weight: bold;
      box-shadow: 0 4px 15px rgba(255, 63, 52, 0.4);
      pointer-events: none;
    `;
    timerDiv.innerText = '0.00s';
    document.body.appendChild(timerDiv);
  }
  return timerDiv;
}

function startGlobalTimer() {
  if (sessionStorage.getItem('irctc_pt_timer_start')) return; // Already running
  automationStartTime = Date.now();
  sessionStorage.setItem('irctc_pt_timer_start', automationStartTime);
  resumeTimer();
}

function resumeTimer() {
  const storedTime = sessionStorage.getItem('irctc_pt_timer_start');
  if (storedTime) {
    automationStartTime = parseInt(storedTime, 10);
    const timerDiv = createTimerUI();
    if (automationTimerInterval) clearInterval(automationTimerInterval);
    automationTimerInterval = setInterval(() => {
      const elapsed = (Date.now() - automationStartTime) / 1000;
      timerDiv.innerText = elapsed.toFixed(2) + 's';
    }, 10);
  }
}

function stopTimer() {
  if (automationTimerInterval) {
    clearInterval(automationTimerInterval);
    automationTimerInterval = null;
    sessionStorage.removeItem('irctc_pt_timer_start');
    
    const elapsed = (Date.now() - automationStartTime) / 1000;
    const timerDiv = document.getElementById('irctc-pt-timer');
    if (timerDiv) {
      timerDiv.innerText = elapsed.toFixed(2) + 's';
      timerDiv.style.color = '#0be881'; // Turn green when done
      timerDiv.style.borderColor = '#0be881';
      timerDiv.style.boxShadow = '0 4px 15px rgba(11, 232, 129, 0.4)';
    }
  }
}

// --- Initialize Extension ---
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
  'targetClass'
], (result) => {
  prefs = result;
  console.log("IRCTC Premium Tatkal Assistant: Preferences loaded.");
  resumeTimer();
  initObserver();
  
  if (prefs.username && prefs.password) {
    openLoginPopup();
  }
});

// --- Helper Functions ---

function fillInput(element, value) {
  if (!element || value === undefined || value === null) return;
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeInputValueSetter.call(element, value);

  element.dispatchEvent(new Event('keydown', { bubbles: true }));
  element.dispatchEvent(new Event('keypress', { bubbles: true }));
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('keyup', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
  element.dispatchEvent(new Event('focus', { bubbles: true }));
}

// --- DOM Observer ---

function initObserver() {
  const observer = new MutationObserver((mutations) => {
    // 0. Language Selection Alert Popup
    const langBtn = Array.from(document.querySelectorAll('button')).find(
      el => el.textContent && el.textContent.trim().toUpperCase() === 'ENGLISH'
    );
    if (langBtn && !langBtn.dataset.autoClicked) {
       console.log('[IRCTC Assistant] Language selection popup detected. Clicking English.');
       langBtn.dataset.autoClicked = "true";
       langBtn.click();
    }

    // 1. Login Dialog
    const loginDialog = document.querySelector('app-login');
    if (loginDialog) {
      waitForLoginModal(loginDialog);
    } else {
      if (hasFilledLogin || hasClickedSignIn) {
        hasFilledLogin = false;
        hasClickedSignIn = false;
        if (fillRetryInterval) {
          clearInterval(fillRetryInterval);
          fillRetryInterval = null;
        }
      }
    }

    // 2. Main Search Form
    const searchForm = document.querySelector('app-jp-input');
    
    // Check if the user is logged in by looking for the main LOGIN link
    const loginBtn = Array.from(document.querySelectorAll('a, button, span')).find(
      el => el.textContent && el.textContent.trim().toUpperCase().includes('LOGIN') && !el.closest('app-login')
    );
    const isUserLoggedIn = !loginBtn;

    if (searchForm && !hasFilledSearch && isUserLoggedIn) {
      waitForSearchForm();
    } else if (!searchForm) {
      hasFilledSearch = false;
      searchRetries = 0;
      if (searchRetryInterval) {
        clearInterval(searchRetryInterval);
        searchRetryInterval = null;
      }
    }
    
    // 3. Train Results Page Finder
    const trainListContainer = document.querySelector('app-train-list');
    if (trainListContainer && !hasInitializedResults && prefs.targetTrain) {
      hasInitializedResults = true;
      setTimeout(() => {
        initializeResultsPage();
      }, 1500); 
    } else if (!trainListContainer) {
      hasInitializedResults = false;
      if (window.IRCTCTrainFinder && typeof window.IRCTCTrainFinder.stop === 'function') {
        window.IRCTCTrainFinder.stop();
      }
    }
    
    // 4. Passenger Details Page
    const addPassengerBtn = Array.from(document.querySelectorAll('a, span')).find(
      el => el.textContent && el.textContent.includes('+ Add Passenger')
    );
    
    if (addPassengerBtn && !hasFilledPassengers && prefs.passengerNames) {
      hasFilledPassengers = true;
      const passengerDelay = prefs.fasterMode ? 100 : 1000;
      setTimeout(() => {
        fillPassengerDetails(prefs.passengerNames);
      }, passengerDelay);
    } else if (!addPassengerBtn) {
      hasFilledPassengers = false;
    }

    // 5. Review Booking Page (CAPTCHA)
    const reviewCaptchaImg = document.querySelector('.captcha-img');
    const isReviewPage = reviewCaptchaImg && !loginDialog; 
    
    if (isReviewPage && !hasSolvedReviewCaptcha) {
      hasSolvedReviewCaptcha = true;
      setTimeout(() => {
        handleReviewCaptcha(reviewCaptchaImg);
      }, 500);
    } else if (!isReviewPage) {
      hasSolvedReviewCaptcha = false;
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  console.log("IRCTC Premium Tatkal Assistant: Observer initialized.");
}

// --- Login Automation Modules ---

function openLoginPopup() {
  console.log('Opening login popup...');
  startGlobalTimer();
  const pollInterval = prefs.fasterMode ? 100 : 1000;
  
  loginPopupInterval = setInterval(() => {
    const loginBtn = Array.from(document.querySelectorAll('a, button')).find(
      el => el.textContent.trim().toUpperCase().includes('LOGIN') && !el.closest('app-login')
    );
    if (loginBtn) {
      clearInterval(loginPopupInterval);
      loginPopupInterval = null;
      
      const clickDelay = prefs.fasterMode ? 50 : 1000;
      setTimeout(() => {
        loginBtn.click();
      }, clickDelay);
    }
  }, pollInterval);
}

function waitForLoginModal(loginDialog) {
  if (!hasClickedSignIn && !fillRetryInterval && prefs.username && prefs.password) {
    console.log('Login popup detected');
    const fillInterval = prefs.fasterMode ? 50 : 500;
    
    fillRetryInterval = setInterval(() => {
      const usernameInput = loginDialog.querySelector('input[formcontrolname="userid"]');
      const passwordInput = loginDialog.querySelector('input[formcontrolname="password"]');
      if (usernameInput && passwordInput) {
        fillUsername(usernameInput);
        fillPassword(passwordInput);
        if (usernameInput.value === prefs.username && passwordInput.value === prefs.password) {
          console.log('Credentials verified');
          hasFilledLogin = true;
          clickSignIn(loginDialog);
        }
      }
    }, fillInterval);
  }
}

function fillUsername(usernameInput) {
  if (usernameInput.value !== prefs.username) {
    fillInput(usernameInput, prefs.username);
    console.log('Username filled');
  }
}

function fillPassword(passwordInput) {
  if (passwordInput.value !== prefs.password) {
    fillInput(passwordInput, prefs.password);
    console.log('Password filled');
  }
}

function clickSignIn(loginDialog) {
  if (hasClickedSignIn) return;
  const signInBtn = loginDialog.querySelector('button[type="submit"]');
  if (signInBtn) {
    clearInterval(fillRetryInterval);
    fillRetryInterval = null;
    hasClickedSignIn = true; // Prevent multiple triggers
    
    console.log('Clicking Sign In');
    const clickDelay = prefs.fasterMode ? 50 : 1000;
    setTimeout(() => {
      signInBtn.click();
      console.log('Login attempt completed');
      
      // Focus captcha instantly in faster mode
      if (prefs.fasterMode) {
        const captchaInput = loginDialog.querySelector('input[formcontrolname="captcha"]');
        if (captchaInput) {
            captchaInput.focus();
            console.log('Captcha instantly focused');
        }
      }
      
      showNotification('Sign In clicked. Please complete CAPTCHA/OTP.');
    }, clickDelay);
  }
}

// --- Search Form Automation ---

function waitForSearchForm() {
  if (hasFilledSearch || searchRetryInterval) return;
  
  console.log('[IRCTC Assistant] Search page detected');
  startGlobalTimer(); // Start timer here if login was skipped
  
  const searchInterval = prefs.fasterMode ? 100 : 500;
  searchRetryInterval = setInterval(() => {
    const searchForm = document.querySelector('app-jp-input');
    if (!searchForm) {
      clearInterval(searchRetryInterval);
      searchRetryInterval = null;
      return;
    }

    const fromInput = searchForm.querySelector('.ui-autocomplete-input[aria-controls="pr_id_1_list"]');
    const toInput = searchForm.querySelector('.ui-autocomplete-input[aria-controls="pr_id_2_list"]');
    const dateInput = searchForm.querySelector('p-calendar input');
    
    if (fromInput && toInput && dateInput) {
      clearInterval(searchRetryInterval);
      searchRetryInterval = null;
      searchRetries = 0;
      
      // Mark as filled to prevent observer from re-triggering this loop
      hasFilledSearch = true; 
      initializeSearchAutomation(searchForm, fromInput, toInput);
    } else {
      searchRetries++;
      if (searchRetries >= 20) { // increased retries since interval is faster
        console.error('[IRCTC Assistant] Failed to find search fields after retries.');
        clearInterval(searchRetryInterval);
        searchRetryInterval = null;
      }
    }
  }, searchInterval);
}

function initializeSearchAutomation(searchForm, fromInput, toInput) {
  try {
    if (prefs.fromStation && fromInput.value !== prefs.fromStation) {
      fillInput(fromInput, prefs.fromStation);
    }
    if (prefs.toStation && toInput.value !== prefs.toStation) {
      fillInput(toInput, prefs.toStation);
    }

    const dropdowns = searchForm.querySelectorAll('p-dropdown');
    let classDropdown = null;
    let quotaDropdown = null;
    
    dropdowns.forEach(dropdown => {
      // The ID might be on the p-dropdown itself, or on an input child
      if (dropdown.id === 'journeyQuota') quotaDropdown = dropdown;
      if (dropdown.id === 'journeyClass') classDropdown = dropdown;
      
      const input = dropdown.querySelector('input');
      if (input && input.id === 'journeyQuota') quotaDropdown = dropdown;
      if (input && input.id === 'journeyClass') classDropdown = dropdown;
    });

    // Execute sequentially to avoid UI race conditions (dropdowns closing each other)
    // In fasterMode, the internal delays are 0ms so this happens near-instantly in the background
    const delay = prefs.fasterMode ? 0 : 500;
    setTimeout(() => {
      selectDropdownItem(quotaDropdown, prefs.quota, () => {
        selectDropdownItem(classDropdown, prefs.travelClass, () => {
          verifySelection(searchForm);
          
          if (prefs.journeyDate) {
            selectJourneyDate(prefs.journeyDate, () => {
              if (prefs.fasterMode) {
                clickSearchTrains(searchForm);
              } else {
                waitForDatePickerClose(() => {
                  clickSearchTrains(searchForm);
                });
              }
            });
          } else {
            clickSearchTrains(searchForm);
          }
        });
      });
    }, delay);

  } catch (err) {
    console.error('[IRCTC Assistant] Error during search automation:', err);
  }
}

// Date Picker Handling

function parseTargetDate(dateStr) {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10).toString();
  const monthNum = parseInt(parts[1], 10);
  const year = parts[2];
  
  const monthNames = ["January", "February", "March", "April", "May", "June", 
                      "July", "August", "September", "October", "November", "December"];
  const month = monthNames[monthNum - 1];
  
  return { day, month, year, original: dateStr, monthNum };
}

function simulateHumanClick(element) {
  const pointerEvents = ['pointerover', 'pointerenter', 'pointerdown', 'pointerup'];
  const mouseEvents = ['mouseover', 'mouseenter', 'mousemove', 'mousedown', 'mouseup', 'click'];
  
  pointerEvents.forEach(type => {
    element.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, view: window }));
  });
  
  mouseEvents.forEach(type => {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  });
  
  element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
}

function selectJourneyDate(dateStr, callback) {
  console.log(`[IRCTC Assistant] Initialization: Target Date is ${dateStr}`);
  
  const targetDateObj = parseTargetDate(dateStr);
  if (!targetDateObj) {
    console.error(`[IRCTC Assistant] Invalid date format: ${dateStr}`);
    throw new Error('Invalid date format for journey date');
  }

  let attemptCount = 0;
  const MAX_ATTEMPTS = 5;

  const runAttempt = () => {
    attemptCount++;
    console.log(`\n[IRCTC Assistant] --- Date Selection Attempt ${attemptCount}/${MAX_ATTEMPTS} ---`);
    
    const calendarEl = document.querySelector('p-calendar');
    const dateInput = calendarEl ? calendarEl.querySelector('input') : null;
    
    if (!calendarEl || !dateInput) {
      console.error('[IRCTC Assistant] Calendar components not found in DOM.');
      if (attemptCount < MAX_ATTEMPTS) {
        setTimeout(runAttempt, 1000);
        return;
      }
      throw new Error('Calendar components missing.');
    }

    // Step 1: Open calendar
    console.log('[IRCTC Assistant] Opening calendar popup...');
    simulateHumanClick(dateInput);
    dateInput.focus();

    // Give UI time to render calendar
    setTimeout(() => {
      const datePicker = document.querySelector('.ui-datepicker, .p-datepicker');
      if (!datePicker || getComputedStyle(datePicker).display === 'none') {
        console.warn('[IRCTC Assistant] Calendar popup failed to open.');
        return retryOrFail();
      }

      // Step 2: Month/Year Validation and Navigation Loop
      const navigateCalendar = () => {
        const displayedMonthEl = datePicker.querySelector('.ui-datepicker-month, .p-datepicker-month');
        const displayedYearEl = datePicker.querySelector('.ui-datepicker-year, .p-datepicker-year');
        
        if (!displayedMonthEl || !displayedYearEl) {
           console.warn('[IRCTC Assistant] Cannot read month/year from calendar header.');
           return retryOrFail();
        }

        const displayedMonth = displayedMonthEl.textContent.trim();
        const displayedYear = displayedYearEl.textContent.trim();
        console.log(`[IRCTC Assistant] Calendar shows: ${displayedMonth} ${displayedYear} | Target: ${targetDateObj.month} ${targetDateObj.year}`);

        if (displayedYear !== targetDateObj.year || displayedMonth.toLowerCase() !== targetDateObj.month.toLowerCase()) {
           console.log('[IRCTC Assistant] Incorrect month/year. Clicking Next...');
           const nextBtn = datePicker.querySelector('.ui-datepicker-next, .p-datepicker-next');
           if (nextBtn) {
             simulateHumanClick(nextBtn);
             setTimeout(navigateCalendar, 300); // wait for transition
             return;
           } else {
             console.error('[IRCTC Assistant] Next button not found on calendar.');
             return retryOrFail();
           }
        }

        // Step 3: Find and click correct day tile
        console.log('[IRCTC Assistant] Correct month/year reached. Searching for day tile:', targetDateObj.day);
        const tiles = Array.from(datePicker.querySelectorAll('td:not(.ui-state-disabled):not(.p-disabled) a'));
        const targetTile = tiles.find(t => t.textContent.trim() === targetDateObj.day);

        if (!targetTile) {
           console.error('[IRCTC Assistant] Target day tile not found in current month.');
           return retryOrFail();
        }

        console.log('[IRCTC Assistant] Day tile found. Attributes:', 
            Array.from(targetTile.attributes).map(a => `${a.name}="${a.value}"`).join(', ')
        );
        
        console.log('[IRCTC Assistant] Simulating human click on tile...');
        simulateHumanClick(targetTile);

        // Step 4: Native Input Setter Fallback (Defense in Depth)
        setTimeout(() => {
          console.log('[IRCTC Assistant] Applying Native Setter injection...');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(dateInput, dateStr);
          ['input', 'change', 'blur', 'focusout'].forEach(evt => {
            dateInput.dispatchEvent(new Event(evt, { bubbles: true }));
          });

          // Give Angular a moment to run Zone.js cycle
          setTimeout(verifySelection, 300);
        }, 100);
      };

      navigateCalendar();

    }, 500);

    const retryOrFail = () => {
      if (attemptCount < MAX_ATTEMPTS) {
        console.log(`[IRCTC Assistant] Attempt ${attemptCount} failed. Retrying...`);
        setTimeout(runAttempt, 800);
      } else {
        console.error('[IRCTC Assistant] CRITICAL FAILURE: Could not select date after 5 attempts.');
        throw new Error('Date Selection Failed');
      }
    };

    // Step 5: Verification
    const verifySelection = () => {
      console.log('[IRCTC Assistant] Beginning final verification...');
      let isVerified = true;

      // 1. Check Input Value
      if (dateInput.value !== dateStr) {
        console.error(`[IRCTC Assistant] Verification Failed: Input value is ${dateInput.value}, expected ${dateStr}`);
        isVerified = false;
      }

      // 2. Check Angular State via ng-reflect-model
      const reflectModel = calendarEl.getAttribute('ng-reflect-model') || calendarEl.getAttribute('ng-reflect-date');
      if (reflectModel) {
        // ng-reflect-model might be a JS date string like "Mon Aug 15 2026..."
        if (!reflectModel.includes(targetDateObj.year) || !reflectModel.toLowerCase().includes(targetDateObj.month.toLowerCase().substring(0,3))) {
           console.error(`[IRCTC Assistant] Verification Failed: ng-reflect-model (${reflectModel}) does not match target ${dateStr}`);
           isVerified = false;
        } else {
           console.log(`[IRCTC Assistant] ng-reflect-model verification passed: ${reflectModel}`);
        }
      } else {
        console.log('[IRCTC Assistant] Warning: ng-reflect-model attribute not found, skipping direct angular verification.');
      }

      // 3. Ensure calendar is closed
      const datePickerAfter = document.querySelector('.ui-datepicker, .p-datepicker');
      if (datePickerAfter && getComputedStyle(datePickerAfter).display !== 'none') {
        console.warn('[IRCTC Assistant] Calendar popup is still open. Attempting to force close...');
        dateInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        dateInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true }));
      }

      if (isVerified) {
        console.log('[IRCTC Assistant] SUCCESS: Date selection fully verified. Angular state is updated.');
        if (callback) callback();
      } else {
        retryOrFail();
      }
    };

  };

  runAttempt();
}

function isDatePickerOpen() {
  const datePicker = document.querySelector('.ui-datepicker, p-calendar .ui-datepicker');
  return datePicker && getComputedStyle(datePicker).display !== 'none';
}

function closeDatePicker() {
  if (isDatePickerOpen()) {
    console.log('[IRCTC Assistant] Calendar popup detected');
    console.log('[IRCTC Assistant] Clicking outside calendar');
    
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  }
}

function waitForDatePickerClose(callback) {
  let retries = 0;
  
  const checkInterval = setInterval(() => {
    if (isDatePickerOpen() && retries < 5) {
      closeDatePicker();
      retries++;
    } else {
      clearInterval(checkInterval);
      if (retries >= 5) {
        console.error('[IRCTC Assistant] Failed to close calendar after 5 retries.');
      } else {
        console.log('[IRCTC Assistant] Calendar closed');
      }
      if (callback) callback();
    }
  }, 300);
}

// Search Action

function clickSearchTrains(searchForm) {
  let retries = 0;
  const clickInterval = prefs.fasterMode ? 50 : 500;
  const clickLoop = setInterval(() => {
    const searchBtn = searchForm.querySelector('button[type="submit"]');
    
    // In fasterMode, wait until the login popup is fully gone before clicking search
    if (prefs.fasterMode && document.querySelector('app-login')) {
      return; 
    }
    
    if (searchBtn && !searchBtn.disabled) {
      clearInterval(clickLoop);
      console.log('[IRCTC Assistant] Search button found');
      
      if (!prefs.fasterMode) {
        searchBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      
      console.log('[IRCTC Assistant] Clicking Search Trains');
      
      const clickDelay = prefs.fasterMode ? 0 : 1000;
      setTimeout(() => {
        searchBtn.click();
        console.log('[IRCTC Assistant] Search submitted');
        showNotification('Search parameters auto-filled and submitted successfully.');
      }, clickDelay);

    } else {
      retries++;
      const maxRetries = prefs.fasterMode ? 600 : 5; // 600 * 50ms = 30 seconds wait for login
      if (retries >= maxRetries) {
        console.error('[IRCTC Assistant] Failed to find or click Search button after retries.');
        clearInterval(clickLoop);
      }
    }
  }, clickInterval);
}

// Quota and Verification

function selectDropdownItem(dropdownEl, targetValue, callback) {
  if (!dropdownEl || !targetValue) {
    if (callback) callback();
    return;
  }

  // Convert extension value to IRCTC exact dropdown text
  let expectedText = targetValue.toUpperCase();
  if (targetValue === 'GN') expectedText = 'GENERAL';
  else if (targetValue === 'TQ') expectedText = 'TATKAL';
  else if (targetValue === 'PT') expectedText = 'PREMIUM TATKAL';
  else if (targetValue === 'LD') expectedText = 'LADIES';

  const label = dropdownEl.querySelector('.ui-dropdown-label, .p-dropdown-label');
  if (label && label.innerText.toUpperCase().includes(expectedText)) {
    console.log(`[IRCTC Assistant] Option already selected: ${expectedText}`);
    if (callback) callback();
    return; 
  }

  const trigger = dropdownEl.querySelector('.ui-dropdown-trigger, .p-dropdown-trigger');
  if (trigger) {
    trigger.click();
    
    const initialDelay = prefs.fasterMode ? 0 : 300;
    setTimeout(() => {
      const items = document.querySelectorAll('.ui-dropdown-item, .p-dropdown-item');
      let clicked = false;
      for (let item of items) {
        const itemText = item.innerText.toUpperCase();
        if (itemText.includes(expectedText)) {
          item.click();
          clicked = true;
          break;
        }
      }
      
      if (clicked) {
        console.log(`[IRCTC Assistant] Selected option: ${expectedText}`);
      } else {
        console.error(`[IRCTC Assistant] Failed to find option: ${expectedText}`);
        trigger.click(); // Close if not found
      }
      
      const closingDelay = prefs.fasterMode ? 50 : 300;
      setTimeout(() => {
        if (callback) callback();
      }, closingDelay);

    }, initialDelay);
  } else {
    console.error(`[IRCTC Assistant] Failed to find dropdown trigger for: ${expectedText}`);
    if (callback) callback();
  }
}

function verifySelection(searchForm) {
  if (!prefs.quota) return;
  const dropdowns = searchForm.querySelectorAll('p-dropdown');
  let quotaDropdown = null;
  dropdowns.forEach(dropdown => {
    if (dropdown.id === 'journeyQuota') quotaDropdown = dropdown;
    const input = dropdown.querySelector('input');
    if (input && input.id === 'journeyQuota') quotaDropdown = dropdown;
  });

  if (quotaDropdown) {
    const label = quotaDropdown.querySelector('.ui-dropdown-label, .p-dropdown-label');
    const labelText = label ? label.innerText.toUpperCase() : '';
    if (prefs.quota === 'PT' && !labelText.includes('PREMIUM TATKAL')) {
      console.error('[IRCTC Assistant] Error: Premium Tatkal not available or failed to select.');
    } else if (prefs.quota === 'PT') {
      console.log('[IRCTC Assistant] Premium Tatkal selected successfully');
    }
  }
}

function initializeResultsPage() {
  if (!prefs.targetTrain) return;

  if (!window.IRCTCTrainFinder || typeof window.IRCTCTrainFinder.findTargetTrain !== 'function') {
    console.error('[Train Finder] Module is not available.');
    return;
  }

  window.IRCTCTrainFinder.findTargetTrain(prefs.targetTrain, {
    debug: true,
    targetClass: prefs.targetClass,
    notify: showNotification
  });
}

// --- UI Notification System ---

function showNotification(message) {
  const existing = document.getElementById('irctc-pt-notifier');
  if (existing) existing.remove();

  const notif = document.createElement('div');
  notif.id = 'irctc-pt-notifier';
  notif.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #2b2b36;
    color: #4cd137;
    border: 1px solid #4cd137;
    padding: 15px 20px;
    border-radius: 8px;
    z-index: 99999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 14px;
    font-weight: 500;
    white-space: pre-line;
    transition: opacity 0.5s;
  `;
  notif.innerText = message;
  document.body.appendChild(notif);

  setTimeout(() => {
    notif.style.opacity = '0';
    setTimeout(() => notif.remove(), 500);
  }, 6000);
}

// --- Passenger Details Automation ---

async function fillPassengerDetails(namesString) {
  if (!namesString) return;
  console.log('[IRCTC Assistant] Starting Passenger Details Autofill...');
  
  const names = namesString.split(',').map(n => n.trim()).filter(n => n);
  if (names.length === 0) return;

  for (let i = 0; i < names.length; i++) {
    const targetName = names[i].toUpperCase();
    console.log(`[IRCTC Assistant] Processing passenger ${i + 1}/${names.length}: ${targetName}`);
    
    // Check if we need to add a new row
    let nameInputs = document.querySelectorAll('p-autocomplete input');
    
    if (i >= nameInputs.length) {
      console.log('[IRCTC Assistant] Adding new passenger row...');
      const addBtn = Array.from(document.querySelectorAll('a, span')).find(
        el => el.textContent && el.textContent.includes('+ Add Passenger')
      );
      if (addBtn) {
        addBtn.click();
        await new Promise(r => setTimeout(r, 500)); // wait for row to render
        nameInputs = document.querySelectorAll('p-autocomplete input');
      } else {
        console.error('[IRCTC Assistant] Could not find "+ Add Passenger" button.');
        break;
      }
    }
    
    const inputField = nameInputs[i];
    if (!inputField) {
      console.error(`[IRCTC Assistant] Could not find input field for passenger ${i + 1}.`);
      continue;
    }

    // Focus input to trigger master list dropdown
    inputField.focus();
    inputField.click();
    
    // Wait for dropdown to appear
    let dropdownList = null;
    let retries = 0;
    while (retries < 10) {
      await new Promise(r => setTimeout(r, 200));
      // In PrimeNG, the dropdown might be attached to the body or right next to the input
      const lists = document.querySelectorAll('.ui-autocomplete-list, .p-autocomplete-list');
      // Find the one that is visible
      for (const list of lists) {
        if (list.offsetParent !== null) {
          dropdownList = list;
          break;
        }
      }
      if (dropdownList) break;
      retries++;
    }

    if (!dropdownList) {
      console.error(`[IRCTC Assistant] Master list dropdown did not appear for ${targetName}.`);
      showNotification(`Warning: Master list dropdown did not appear for ${targetName}. Is the user logged in and has saved passengers?`);
      continue;
    }

    // Search for the name in the dropdown
    const items = dropdownList.querySelectorAll('li');
    let found = false;
    
    for (const item of items) {
      const text = item.innerText || item.textContent;
      if (text.toUpperCase().includes(targetName)) {
        console.log(`[IRCTC Assistant] Found match in master list: ${text}`);
        item.click();
        found = true;
        break;
      }
    }

    if (!found) {
      console.error(`[IRCTC Assistant] Could not find "${targetName}" in the master list.`);
      showNotification(`Warning: Could not find "${targetName}" in your IRCTC Master List.`);
      // Unfocus so we can proceed
      inputField.blur();
    }
    
    await new Promise(r => setTimeout(r, 500)); // wait between passengers
  }
  
  // --- Payment Mode Selection ---
  if (prefs.paymentMode) {
    console.log(`[IRCTC Assistant] Selecting Payment Mode: ${prefs.paymentMode}`);
    // Wait for the passenger row animations and page layout to settle
    await new Promise(r => setTimeout(r, 1500)); 

    const targetText = prefs.paymentMode === 'CARD' ? 'Credit & Debit Cards' : 'BHIM/UPI';
    let paymentFound = false;

    // 1. Find the label or text element containing the target text
    const labels = document.querySelectorAll('label, span, div');
    let targetLabel = null;
    for (const el of labels) {
      // Prioritize leaf nodes or labels
      if ((el.tagName === 'LABEL' || el.children.length === 0) && el.textContent.includes(targetText)) {
        targetLabel = el;
        break;
      }
    }

    // 2. Traverse up to find the associated PrimeNG radio button component
    if (targetLabel) {
      let container = targetLabel.parentElement;
      let radioBox = null;
      let radioInput = null;
      
      while (container && container !== document.body) {
        radioBox = container.querySelector('.ui-radiobutton-box, .p-radiobutton-box');
        radioInput = container.querySelector('input[type="radio"]');
        
        if (radioBox || radioInput) {
          // Scroll the container into the dead center of the screen
          container.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(r => setTimeout(r, 800)); // wait for scroll
          
          if (radioBox) {
            radioBox.click();
            radioBox.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            radioBox.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          }
          
          if (radioInput) {
            radioInput.click();
            radioInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
          
          targetLabel.click(); // Click label as fallback
          paymentFound = true;
          break;
        }
        container = container.parentElement;
      }
    }

    if (paymentFound) {
      console.log(`[IRCTC Assistant] Payment mode selected successfully.`);
      
      // Wait for any UI updates before clicking Continue
      await new Promise(r => setTimeout(r, 1000));
      
      const buttons = Array.from(document.querySelectorAll('button'));
      const continueBtn = buttons.find(b => b.innerText && b.innerText.trim().toUpperCase() === 'CONTINUE' && !b.disabled);
      
      if (continueBtn) {
        console.log('[IRCTC Assistant] Clicking Continue button');
        continueBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 500));
        stopTimer();
        continueBtn.click();
      } else {
        stopTimer();
        console.error('[IRCTC Assistant] Continue button not found');
      }

    } else {
      stopTimer();
      console.error(`[IRCTC Assistant] Failed to find Payment Mode containing text: ${targetText}`);
    }
  } else {
    // If no payment mode was selected, we still stop the timer at the end
    stopTimer();
  }

  console.log('[IRCTC Assistant] Passenger Details Autofill completed.');
  showNotification('Passenger auto-fill & payment selection completed.');
}

// --- Review Booking CAPTCHA ---

async function handleReviewCaptcha(imgElement) {
  try {
    console.log('[IRCTC Assistant] Review Booking Captcha found. Attempting to solve...');
    const base64Src = imgElement.src;
    
    if (!base64Src || !base64Src.startsWith('data:image')) {
      console.warn('[IRCTC Assistant] Captcha image is not base64 encoded.');
      return;
    }

    showNotification('Solving CAPTCHA via local server...');
    
    const response = await fetch('http://localhost:5000/solve_captcha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: base64Src })
    });
    
    const data = await response.json();
    if (data.status === 'success' && data.text) {
      const captchaInput = document.querySelector('input[formcontrolname="captcha"], input#captcha');
      if (captchaInput) {
        const cleanText = data.text.replace(/\s+/g, '');
        fillInput(captchaInput, cleanText);
        console.log('[IRCTC Assistant] Captcha solved and filled:', cleanText);
        showNotification('CAPTCHA auto-filled! Clicking Continue...');
        
        // Find and click the Continue button
        const buttons = Array.from(document.querySelectorAll('button'));
        const continueBtn = buttons.find(b => b.innerText && b.innerText.trim().toUpperCase() === 'CONTINUE' && !b.disabled);
        if (continueBtn) {
          console.log('[IRCTC Assistant] Clicking Continue button after CAPTCHA');
          continueBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => { continueBtn.click(); }, 500);
        }
      }
    } else {
      console.error('[IRCTC Assistant] CAPTCHA solve failed:', data.error);
    }
  } catch (error) {
    console.error('[IRCTC Assistant] Error communicating with OCR server:', error);
  }
}
