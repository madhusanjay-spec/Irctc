// --- IRCTC Train Finder Module ---
// Finds one requested train card by scanning loaded cards, scrolling, and rescanning.
(function () {
  const DEFAULT_SCROLL_STEP = 650;
  const SCROLL_SETTLE_MS = 850;
  const DOM_UPDATE_TIMEOUT_MS = 1200;
  const HIGHLIGHT_DURATION_MS = 8000;
  const CLASS_ACTION_TIMEOUT_MS = 12000;
  const BOOK_NOW_TIMEOUT_MS = 10000;

  let activeSearchId = 0;
  let debugMode = true;
  let matchingTrainCard = null;
  let highlightedCard = null;
  let restoreHighlightTimer = null;

  function log(message, ...args) {
    if (args.length > 0) {
      console.log(`[Train Finder] ${message}`, ...args);
    } else {
      console.log(`[Train Finder] ${message}`);
    }
  }

  function debugLog(message, ...args) {
    if (!debugMode) return;
    if (args.length > 0) {
      console.log(`[Train Finder][Debug] ${message}`, ...args);
    } else {
      console.log(`[Train Finder][Debug] ${message}`);
    }
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function findTargetTrain(trainNumber, options = {}) {
    const targetTrainNumber = normalizeTrainNumber(trainNumber);
    debugMode = options.debug !== undefined ? Boolean(options.debug) : true;
    const notify = typeof options.notify === 'function' ? options.notify : null;
    const targetClassCode = normalizeClassCode(options.targetClass);

    activeSearchId++;
    const searchId = activeSearchId;
    matchingTrainCard = null;

    if (!targetTrainNumber) {
      console.warn('[Train Finder] Cannot search without a valid train number.');
      return { found: false, card: null, trainNumber: null };
    }

    log(`Searching for train ${targetTrainNumber}`);
    if (notify) notify(`Searching for train ${targetTrainNumber}...`);

    while (searchId === activeSearchId) {
      const cards = scanVisibleTrainCards();
      log(`Found ${cards.length} train cards`);
      printDiscoveredTrainNumbers(cards, targetTrainNumber);

      const targetCard = findMatchingCard(cards, targetTrainNumber);
      if (targetCard) {
        matchingTrainCard = targetCard;
        log(`Match found: ${targetTrainNumber}`);
        highlightTrain(targetCard);
        if (notify) notify(`Train ${targetTrainNumber} found and highlighted.`);

        let bookingResult = null;
        if (targetClassCode) {
          bookingResult = await selectClassAndBook(targetCard, targetClassCode, notify);
        }

        return {
          found: true,
          card: targetCard,
          trainNumber: targetTrainNumber,
          bookingResult
        };
      }

      if (!canScrollFurther()) {
        console.warn(`[Train Finder] Bottom of page reached. Train ${targetTrainNumber} was not found.`);
        if (notify) notify(`Train ${targetTrainNumber} not found on this page.`);
        return { found: false, card: null, trainNumber: targetTrainNumber };
      }

      log('Train not visible, scrolling');
      const scrollResult = await scrollAndLoadMore();
      if (scrollResult.newCardsDetected) {
        log('New cards detected');
      }

      if (!scrollResult.didScroll && !scrollResult.newCardsDetected && !canScrollFurther()) {
        console.warn(`[Train Finder] Page cannot scroll further. Train ${targetTrainNumber} was not found.`);
        if (notify) notify(`Train ${targetTrainNumber} not found on this page.`);
        return { found: false, card: null, trainNumber: targetTrainNumber };
      }
    }

    return { found: false, card: null, trainNumber: targetTrainNumber, cancelled: true };
  }

  function scanVisibleTrainCards() {
    const root = document.querySelector('app-train-list') || document;
    const candidates = [];

    root.querySelectorAll('app-train-avl-enq').forEach((card) => {
      candidates.push(card);
    });

    root.querySelectorAll('.train-heading').forEach((heading) => {
      const card = heading.closest('app-train-avl-enq, .form-group, .row, .col-xs-12, .col-sm-12, .col-md-12');
      if (card) candidates.push(card);
    });

    if (candidates.length === 0) {
      root.querySelectorAll('.form-group, .row, .col-xs-12, .col-sm-12, .col-md-12').forEach((element) => {
        if (extractTrainNumber(element)) candidates.push(element);
      });
    }

    return dedupeTrainCards(candidates);
  }

  async function scrollAndLoadMore() {
    const beforeCards = scanVisibleTrainCards();
    const beforeSignature = getCardSignature(beforeCards);
    const beforeScrollTop = getScrollTop();

    window.scrollBy({ top: DEFAULT_SCROLL_STEP, behavior: 'smooth' });

    const domChanged = await waitForTrainDomUpdate(beforeSignature, DOM_UPDATE_TIMEOUT_MS);
    await wait(SCROLL_SETTLE_MS);

    const afterCards = scanVisibleTrainCards();
    const afterSignature = getCardSignature(afterCards);
    const afterScrollTop = getScrollTop();
    const newCardsDetected = domChanged || afterCards.length > beforeCards.length || afterSignature !== beforeSignature;

    return {
      didScroll: afterScrollTop > beforeScrollTop,
      newCardsDetected,
      atBottom: !canScrollFurther()
    };
  }

  function extractTrainNumber(card) {
    if (!card) return null;

    const textSources = [];
    const heading = card.querySelector('.train-heading');
    if (heading) textSources.push(heading.innerText || heading.textContent || '');

    card.querySelectorAll('strong, .train-name').forEach((element) => {
      textSources.push(element.innerText || element.textContent || '');
    });

    textSources.push(card.innerText || card.textContent || '');

    for (const text of textSources) {
      const extracted = extractTrainNumberFromText(text);
      if (extracted) return extracted;
    }

    return null;
  }

  function highlightTrain(card) {
    if (!card) return;

    log('Scrolling train into view');
    card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

    if (restoreHighlightTimer) {
      clearTimeout(restoreHighlightTimer);
      restoreHighlightTimer = null;
    }

    if (highlightedCard && highlightedCard !== card) {
      restoreOriginalHighlight(highlightedCard);
    }

    highlightedCard = card;
    card.dataset.irctcFinderOriginalBorder = card.style.border || '';
    card.dataset.irctcFinderOriginalBoxShadow = card.style.boxShadow || '';
    card.dataset.irctcFinderOriginalBorderRadius = card.style.borderRadius || '';
    card.dataset.irctcFinderOriginalTransition = card.style.transition || '';

    card.style.border = '4px solid #ff6b6b';
    card.style.boxShadow = '0 0 20px rgba(255, 107, 107, 0.65)';
    card.style.borderRadius = '8px';
    card.style.transition = 'border 0.25s ease, box-shadow 0.25s ease';

    restoreHighlightTimer = setTimeout(() => {
      restoreOriginalHighlight(card);
      if (highlightedCard === card) highlightedCard = null;
      restoreHighlightTimer = null;
    }, HIGHLIGHT_DURATION_MS);
  }

  async function selectClassAndBook(card, targetClassCode, notify) {
    log(`=================== AUTO-BOOKING SEQUENCE STARTED ===================`);
    log(`[Step 1] Attempting to select class ${targetClassCode}`);
    if (notify) notify(`Train found. Selecting ${targetClassCode}...`);

    const classControl = findTargetClassControl(card, targetClassCode);
    if (!classControl) {
      console.warn(`[Train Finder] [ERROR] ${targetClassCode} class option was not found on matched train card.`);
      if (notify) notify(`${targetClassCode} option not found for this train.`);
      return { classSelected: false, firstDateClicked: false, bookNowClicked: false };
    }

    log(`[Step 1] Found ${targetClassCode} class option. Initiating human-like click.`);
    await clickElement(classControl);

    log(`[Step 2] Waiting for date availability options to load...`);
    const firstDateOption = await waitForElement(() => {
      return findFirstDateOption(card, targetClassCode);
    }, CLASS_ACTION_TIMEOUT_MS, 500);

    if (!firstDateOption) {
      console.warn(`[Train Finder] [ERROR] First ${targetClassCode} date option was not found after class selection.`);
      if (notify) notify(`${targetClassCode} date options did not load.`);
      return { classSelected: true, firstDateClicked: false, bookNowClicked: false };
    }

    log(`[Step 3] Date availability loaded successfully. Waiting 1.5s for Angular state synchronization...`);
    await wait(1500);

    const dateText = getElementText(firstDateOption);
    log(`[Step 3] Targeting first date option: "${dateText}"`);
    log(`[Step 3] Initiating human-like mouse movement and click on date option.`);
    await clickDateOption(firstDateOption);

    log(`[Step 4] Date option clicked. Waiting 2s for selection to register...`);
    await wait(2000);

    log(`[Step 5] Searching for Book Now button...`);
    const bookNowButton = await waitForElement(() => {
      return findBookNowButton(card);
    }, BOOK_NOW_TIMEOUT_MS, 500);

    if (!bookNowButton) {
      console.warn('[Train Finder] [ERROR] Book Now button was not found or remained disabled.');
      if (notify) notify('Book Now button was not available after selecting the first date.');
      return { classSelected: true, firstDateClicked: true, bookNowClicked: false };
    }

    log(`[Step 5] Book Now button found. Initiating click.`);
    if (notify) notify(`Clicking Book Now for ${targetClassCode}.`);
    
    let retryCount = 0;
    const MAX_RETRIES = 3;
    let success = false;
    
    while (retryCount < MAX_RETRIES) {
      await clickElement(bookNowButton);
      
      log(`[Step 6] Verifying booking progression... (Checking for errors)`);
      const errorFound = await checkForErrorToast(1500); // Wait 1.5s for error toast
      
      if (errorFound) {
        retryCount++;
        log(`[ERROR DETECTED] "Please select class" error appeared! (Retry ${retryCount}/${MAX_RETRIES})`);
        if (notify) notify(`Error detected. Retrying date selection... (${retryCount}/${MAX_RETRIES})`);
        
        dismissToasts();
        
        log(`[Retry] Simulating mouse movement and re-clicking date option...`);
        await clickDateOption(firstDateOption);
        await wait(1500);
        
        log(`[Retry] Re-clicking Book Now...`);
      } else {
        success = true;
        log(`[Step 6] No errors detected. Proceeding to next page.`);
        break;
      }
    }

    if (!success) {
      log(`[ERROR] Failed to bypass "Please select class" error after ${MAX_RETRIES} retries.`);
    }
    
    log(`=================== AUTO-BOOKING SEQUENCE COMPLETED ===================`);

    return { classSelected: true, firstDateClicked: true, bookNowClicked: true };
  }

  function findTargetClassControl(card, targetClassCode) {
    const className = getClassDisplayName(targetClassCode);
    const candidates = getVisibleElements(card)
      .filter((element) => {
        const text = getElementText(element);
        if (!text || text.length > 220) return false;
        return text.includes(`(${targetClassCode})`) || text.includes(targetClassCode) || text.includes(className);
      })
      .sort((a, b) => {
        const textA = getElementText(a);
        const textB = getElementText(b);
        const aHasRefresh = textA.includes('REFRESH') ? 0 : 1;
        const bHasRefresh = textB.includes('REFRESH') ? 0 : 1;
        if (aHasRefresh !== bHasRefresh) return aHasRefresh - bHasRefresh;
        return textA.length - textB.length;
      });

    for (const candidate of candidates) {
      const clickable = getClickableElement(candidate);
      if (clickable && isVisible(clickable) && !isDisabled(clickable)) {
        return clickable;
      }
    }

    return null;
  }

  function findFirstDateOption(card, targetClassCode) {
    const candidates = getVisibleElements(card)
      .filter((element) => {
        if (isDisabled(element)) return false;

        const text = getElementText(element);
        if (!text || text.length > 180) return false;
        if (!isDateOptionText(text)) return false;

        const rect = element.getBoundingClientRect();
        return rect.width >= 60 && rect.height >= 35;
      })
      .map((element) => getDateOptionTile(element, card))
      .filter(Boolean)
      .filter((element, index, all) => all.indexOf(element) === index)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return isVisible(element) && !isDisabled(element) && rect.width >= 80 && rect.height >= 45;
      })
      .sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        if (Math.abs(rectA.top - rectB.top) > 5) return rectA.top - rectB.top;
        return rectA.left - rectB.left;
      });

    debugLog(`${targetClassCode} date candidates found: ${candidates.length}`);
    return candidates.length > 0 ? getClickableElement(candidates[0]) || candidates[0] : null;
  }

  function getDateOptionTile(element, card) {
    let tile = element;
    let parent = element.parentElement;

    while (parent && parent !== card && card.contains(parent)) {
      const parentText = getElementText(parent);
      const parentRect = parent.getBoundingClientRect();

      if (!isDateOptionText(parentText)) break;
      if (parentText.length > 220) break;
      if (parentRect.width > 380 || parentRect.height > 180) break;
      if (containsMultipleDateOptions(parentText)) break;

      tile = parent;
      parent = parent.parentElement;
    }

    return tile;
  }

  function isDateOptionText(text) {
    const availabilityPattern = /(AVAILABLE(?:-\d+)?|WL\s*\d+|RAC\s*\d+|REGRET|NOT AVAILABLE|CURR_AVBL)/i;
    const datePattern = /\b(MON|TUE|WED|THU|FRI|SAT|SUN)\b|\b\d{1,2}\s+[A-Z]{3}\b/i;

    if (!text) return false;
    if (!availabilityPattern.test(text)) return false;
    if (!datePattern.test(text)) return false;
    if (text.includes('BOOK NOW') || text.includes('OTHER DATES')) return false;
    if (text.includes('NTES')) return false;

    return true;
  }

  function containsMultipleDateOptions(text) {
    const dayMatches = text.match(/\b(MON|TUE|WED|THU|FRI|SAT|SUN)\b/gi) || [];
    const dateMatches = text.match(/\b\d{1,2}\s+[A-Z]{3}\b/gi) || [];
    return dayMatches.length > 1 || dateMatches.length > 1;
  }

  function findBookNowButton(card) {
    const candidates = Array.from(card.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]'))
      .filter((element) => {
        if (!isVisible(element) || isDisabled(element)) return false;
        const text = getElementText(element) || String(element.value || '').toUpperCase();
        return text.includes('BOOK NOW');
      });

    return candidates.length > 0 ? candidates[0] : null;
  }

  function getVisibleElements(root) {
    return Array.from(root.querySelectorAll('*')).filter(isVisible);
  }

  function getElementText(element) {
    return (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase();
  }

  function getClickableElement(element) {
    return element.closest('button, a, [role="button"], td.link, .link, .pre-avl, .btn') ||
      element.querySelector('button, a, [role="button"], td.link, .link, .pre-avl, .btn') ||
      element;
  }

  async function clickElement(element) {
    if (!element) return;
    
    // Auto-scrolling disabled per user request
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    
    // Find the exact innermost element at those coordinates
    const exactTarget = document.elementFromPoint(centerX, centerY) || element;
    
    log(`[Click Simulation] Firing exactly one .click() on <${exactTarget.tagName.toLowerCase()}> with classes "${exactTarget.className}"`);
    
    // Fire EXACTLY ONE click to avoid IRCTC's double-click penalty
    exactTarget.click();
    
    await wait(350);
  }

  async function hardwareClick(element) {
    if (!element) return;
    
    // The user requested to stop scrolling the page entirely.
    // The physical coordinates will just be calculated based on the element's current position on screen.
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    
    // Calculate absolute screen coordinates for Python PyAutoGUI
    const borderX = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
    const borderY = Math.max(0, window.outerHeight - window.innerHeight - borderX);
    
    const logicalX = window.screenX + borderX + centerX;
    const logicalY = window.screenY + borderY + centerY;
    
    const dpr = window.devicePixelRatio || 1;
    const screenX = Math.round(logicalX * dpr);
    
    // User requested another "down by 0.3cm" (approx 12 pixels).
    // Previous offset was 115px DOWN. New offset is 127px DOWN.
    const Y_OFFSET_DOWN = 127;
    const screenY = Math.round(logicalY * dpr) + Y_OFFSET_DOWN;
    
    log(`[OS Controller] Logical: ${logicalX}, ${logicalY} | DPR: ${dpr} | Physical Target: X=${screenX}, Y=${screenY} (Adjusted DOWN by ${Y_OFFSET_DOWN}px)`);
    
    try {
      const response = await fetch('http://localhost:5000/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: screenX, y: screenY })
      });
      
      if (response.ok) {
        log(`[OS Controller] Successfully executed physical hardware click via Python.`);
      } else {
        log(`[OS Controller] WARNING: Python server returned an error.`);
        element.click(); // Fallback
      }
    } catch (e) {
      log(`[OS Controller] ERROR: Could not connect to Python server. Is mouse_controller.py running?`);
      console.error(e);
      element.click(); // Fallback
    }
    
    await wait(500);
  }

  async function clickDateOption(dateOptionTile) {
    if (!dateOptionTile) return;

    log(`[Date Click] Handing over control to OS Hardware Mouse Controller...`);
    const divElement = dateOptionTile.querySelector('div.pre-avl, div') || dateOptionTile;
    
    await hardwareClick(divElement);
  }

  function waitForElement(findElement, timeoutMs, intervalMs) {
    const startedAt = Date.now();

    return new Promise((resolve) => {
      const interval = setInterval(() => {
        const element = findElement();
        if (element) {
          clearInterval(interval);
          resolve(element);
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          clearInterval(interval);
          resolve(null);
        }
      }, intervalMs);
    });
  }

  function extractTrainNumberFromText(text) {
    if (!text) return null;

    const bracketMatch = text.match(/\(\s*(\d(?:[\s-]*\d){4})\s*\)/);
    if (bracketMatch) return normalizeTrainNumber(bracketMatch[1]);

    const exactMatch = text.match(/(?:^|[^\d])(\d{5})(?:[^\d]|$)/);
    if (exactMatch) return normalizeTrainNumber(exactMatch[1]);

    const spacedMatch = text.match(/(?:^|[^\d])(\d(?:[\s-]*\d){4})(?:[^\d]|$)/);
    if (spacedMatch) return normalizeTrainNumber(spacedMatch[1]);

    return null;
  }

  function normalizeTrainNumber(value) {
    if (value === undefined || value === null) return null;
    const normalized = String(value).replace(/[^\d]/g, '');
    return normalized.length > 0 ? normalized : null;
  }

  function normalizeClassCode(value) {
    if (!value) return '';
    return String(value).replace(/[^\da-z]/gi, '').toUpperCase();
  }

  function getClassDisplayName(targetClassCode) {
    const classNames = {
      '1A': 'AC FIRST CLASS',
      '2A': 'AC 2 TIER',
      '3A': 'AC 3 TIER',
      SL: 'SLEEPER',
      CC: 'AC CHAIR CAR',
      '2S': 'SECOND SITTING'
    };

    return classNames[targetClassCode] || targetClassCode;
  }

  async function checkForErrorToast(timeoutMs) {
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        const toasts = Array.from(document.querySelectorAll('.ui-toast-message, .p-toast-message, .toast-message, .ui-messages-error, .ui-growl-message'));
        const hasError = toasts.some(toast => {
          const text = (toast.innerText || toast.textContent || '').toUpperCase();
          return text.includes('PLEASE SELECT CLASS') || text.includes('SELECT CLASS') || text.includes('PLEASE SELECT QUOTA');
        });
        
        if (hasError) {
          clearInterval(interval);
          resolve(true);
          return;
        }
        
        if (Date.now() - startedAt >= timeoutMs) {
          clearInterval(interval);
          resolve(false);
        }
      }, 200);
    });
  }

  function dismissToasts() {
    document.querySelectorAll('.ui-toast-close-icon, .p-toast-icon-close').forEach(btn => {
      try { btn.click(); } catch (e) {}
    });
  }

  function findMatchingCard(cards, targetTrainNumber) {
    for (const card of cards) {
      const cardTrainNumber = extractTrainNumber(card);
      if (cardTrainNumber === targetTrainNumber) {
        return card;
      }
    }

    return null;
  }

  function printDiscoveredTrainNumbers(cards, targetTrainNumber) {
    if (!debugMode) return;

    const rows = cards.map((card, index) => {
      const trainNumber = extractTrainNumber(card);
      debugLog(`Discovered train number: ${trainNumber || 'none'} (card ${index + 1})`);
      return {
        card: index + 1,
        trainNumber,
        matchesTarget: trainNumber === targetTrainNumber
      };
    });

    if (rows.length > 0) {
      console.table(rows);
    }
  }

  function dedupeTrainCards(candidates) {
    const uniqueCards = [];
    const seen = new Set();

    candidates.forEach((candidate) => {
      if (!candidate || seen.has(candidate)) return;
      const trainNumber = extractTrainNumber(candidate);
      if (!trainNumber) return;

      const existingSameTrain = uniqueCards.find((card) => extractTrainNumber(card) === trainNumber);
      if (existingSameTrain) {
        if (existingSameTrain.contains(candidate)) return;
        if (candidate.contains(existingSameTrain)) {
          const existingIndex = uniqueCards.indexOf(existingSameTrain);
          uniqueCards[existingIndex] = candidate;
          seen.add(candidate);
        }
        return;
      }

      seen.add(candidate);
      uniqueCards.push(candidate);
    });

    return uniqueCards;
  }

  function getCardSignature(cards) {
    return cards.map((card) => extractTrainNumber(card) || '').join('|');
  }

  function waitForTrainDomUpdate(previousSignature, timeoutMs) {
    return new Promise((resolve) => {
      let resolved = false;
      const finish = (value) => {
        if (resolved) return;
        resolved = true;
        observer.disconnect();
        clearTimeout(timeout);
        resolve(value);
      };

      const observer = new MutationObserver(() => {
        const nextSignature = getCardSignature(scanVisibleTrainCards());
        if (nextSignature !== previousSignature) {
          finish(true);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      const timeout = setTimeout(() => {
        finish(false);
      }, timeoutMs);
    });
  }

  function canScrollFurther() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    const viewportHeight = window.innerHeight || scrollingElement.clientHeight;
    const maxScrollTop = Math.max(0, scrollingElement.scrollHeight - viewportHeight);
    return getScrollTop() < maxScrollTop - 2;
  }

  function getScrollTop() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    return window.scrollY || scrollingElement.scrollTop || 0;
  }

  function isVisible(element) {
    if (!element || !element.getBoundingClientRect) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isDisabled(element) {
    return Boolean(
      element.disabled ||
      element.getAttribute('aria-disabled') === 'true' ||
      element.classList.contains('disabled') ||
      element.classList.contains('ui-state-disabled')
    );
  }

  function restoreOriginalHighlight(card) {
    if (!card || !card.dataset) return;

    card.style.border = card.dataset.irctcFinderOriginalBorder || '';
    card.style.boxShadow = card.dataset.irctcFinderOriginalBoxShadow || '';
    card.style.borderRadius = card.dataset.irctcFinderOriginalBorderRadius || '';
    card.style.transition = card.dataset.irctcFinderOriginalTransition || '';

    delete card.dataset.irctcFinderOriginalBorder;
    delete card.dataset.irctcFinderOriginalBoxShadow;
    delete card.dataset.irctcFinderOriginalBorderRadius;
    delete card.dataset.irctcFinderOriginalTransition;
  }

  function stop() {
    activeSearchId++;
  }

  function setDebugMode(enabled) {
    debugMode = Boolean(enabled);
  }

  function getMatchingTrainCard() {
    return matchingTrainCard;
  }

  window.IRCTCTrainFinder = {
    findTargetTrain,
    scanVisibleTrainCards,
    scrollAndLoadMore,
    extractTrainNumber,
    highlightTrain,
    selectClassAndBook,
    stop,
    setDebugMode,
    getMatchingTrainCard
  };

  window.irctcDebug = Object.assign({}, window.irctcDebug, {
    findTrain: findTargetTrain,
    scanCards: scanVisibleTrainCards,
    getTrainNumbers: () => {
      const trainNumbers = scanVisibleTrainCards().map((card) => extractTrainNumber(card));
      log('Visible train numbers:', trainNumbers);
      return trainNumbers;
    },
    getMatchingTrainCard,
    setTrainFinderDebug: setDebugMode
  });
})();
