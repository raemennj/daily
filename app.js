const DATA_URL = 'data/daily_reflections.json';
const NOTES_KEY = 'daily-reflections-notes-v1';
const FONT_SCALE_KEY = 'daily-reflections-font-scale-v1';
const FONT_SCALE_MIN = 0.85;
const FONT_SCALE_MAX = 1.25;
const FONT_SCALE_STEP = 0.05;
const SEARCH_PAGE_SIZE = 20;
const MONTH_DAY_CAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FALLBACK_YEAR = 2024;
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const monthIndexByName = Object.fromEntries(
  monthNames.map((name, idx) => [name.toLowerCase(), idx])
);

const state = {
  entries: [],
  entryMap: new Map(),
  currentEntry: null,
  currentMonthIndex: null,
  currentDay: null,
  notes: {},
  fontScale: 1,
  calendarMonthIndex: null
};

const searchState = {
  query: '',
  matches: [],
  visibleCount: 0
};

const els = {
  todayButton: document.getElementById('todayButton'),
  randomButton: document.getElementById('randomButton'),
  shareButton: document.getElementById('shareButton'),
  prevButton: document.getElementById('prevButton'),
  nextButton: document.getElementById('nextButton'),
  calendarButton: document.getElementById('calendarButton'),
  menuButton: document.getElementById('menuButton'),
  menuModal: document.getElementById('menuModal'),
  menuClose: document.getElementById('menuClose'),
  fontScaleDown: document.getElementById('fontScaleDown'),
  fontScaleUp: document.getElementById('fontScaleUp'),
  fontScaleValue: document.getElementById('fontScaleValue'),
  calendarModal: document.getElementById('calendarModal'),
  calendarClose: document.getElementById('calendarClose'),
  calendarPrev: document.getElementById('calendarPrev'),
  calendarNext: document.getElementById('calendarNext'),
  calendarMonthLabel: document.getElementById('calendarMonthLabel'),
  calendarGrid: document.getElementById('calendarGrid'),
  currentMonth: document.getElementById('currentMonth'),
  currentDay: document.getElementById('currentDay'),
  currentTitle: document.getElementById('currentTitle'),
  currentSource: document.getElementById('currentSource'),
  currentQuote: document.getElementById('currentQuote'),
  currentReflection: document.getElementById('currentReflection'),
  currentTags: document.getElementById('currentTags'),
  pageTag: document.getElementById('pageTag'),
  noteField: document.getElementById('noteField'),
  saveNote: document.getElementById('saveNote'),
  deleteNote: document.getElementById('deleteNote'),
  noteStatus: document.getElementById('noteStatus'),
  notePreview: document.getElementById('notePreview'),
  notesList: document.getElementById('notesList'),
  searchInput: document.getElementById('searchInput'),
  searchResults: document.getElementById('searchResults'),
  networkStatus: document.getElementById('networkStatus'),
  pwaStatus: document.getElementById('pwaStatus')
};

init();

async function init() {
  loadFontScale();
  bindEvents();
  loadNotes();
  await loadEntries();
  showToday();
  updateNetworkStatus();
  registerServiceWorker();
  onSearch();
}

function bindEvents() {
  els.todayButton.addEventListener('click', showToday);
  els.prevButton.addEventListener('click', () => moveDay(-1));
  els.nextButton.addEventListener('click', () => moveDay(1));
  els.randomButton.addEventListener('click', showRandom);
  els.calendarButton.addEventListener('click', openCalendar);
  if (els.menuButton) {
    els.menuButton.addEventListener('click', () => {
      if (isMenuOpen()) {
        closeMenu();
      } else {
        openMenu();
      }
    });
  }
  if (els.fontScaleDown) {
    els.fontScaleDown.addEventListener('click', () => nudgeFontScale(-1));
  }
  if (els.fontScaleUp) {
    els.fontScaleUp.addEventListener('click', () => nudgeFontScale(1));
  }
  els.calendarClose.addEventListener('click', closeCalendar);
  if (els.menuClose) {
    els.menuClose.addEventListener('click', closeMenu);
  }
  els.calendarPrev.addEventListener('click', () => adjustCalendarMonth(-1));
  els.calendarNext.addEventListener('click', () => adjustCalendarMonth(1));
  els.calendarModal.addEventListener('click', (event) => {
    if (event.target?.dataset?.close === 'calendar') {
      closeCalendar();
    }
  });
  if (els.menuModal) {
    els.menuModal.addEventListener('click', (event) => {
      if (event.target?.dataset?.close === 'menu') {
        closeMenu();
      }
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (isCalendarOpen()) closeCalendar();
    if (isMenuOpen()) closeMenu();
  });
  if (els.shareButton) {
    els.shareButton.addEventListener('click', shareCurrent);
  }
  els.saveNote.addEventListener('click', saveCurrentNote);
  if (els.deleteNote) {
    els.deleteNote.addEventListener('click', deleteCurrentNote);
  }
  els.searchInput.addEventListener('input', onSearch);
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
}

function clampFontScale(value) {
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));
}

function updateFontScaleUI() {
  if (!els.fontScaleValue) return;
  const percent = Math.round((state.fontScale || 1) * 100);
  els.fontScaleValue.textContent = `${percent}%`;
  if (els.fontScaleDown) {
    els.fontScaleDown.disabled = state.fontScale <= FONT_SCALE_MIN + 0.001;
  }
  if (els.fontScaleUp) {
    els.fontScaleUp.disabled = state.fontScale >= FONT_SCALE_MAX - 0.001;
  }
}

function setFontScale(value, options = {}) {
  const nextValue = clampFontScale(value);
  state.fontScale = Number(nextValue.toFixed(2));
  document.documentElement.style.setProperty('--type-scale', state.fontScale.toString());
  updateFontScaleUI();
  if (options.persist === false) return;
  try {
    localStorage.setItem(FONT_SCALE_KEY, state.fontScale.toString());
  } catch (err) {
    // Ignore storage failures (private mode, denied access, etc.).
  }
}

function loadFontScale() {
  try {
    const stored = Number(localStorage.getItem(FONT_SCALE_KEY));
    if (!Number.isNaN(stored) && stored > 0) {
      setFontScale(stored, { persist: false });
      return;
    }
  } catch (err) {
    // Ignore storage failures.
  }
  setFontScale(1, { persist: false });
}

function nudgeFontScale(direction) {
  setFontScale((state.fontScale || 1) + FONT_SCALE_STEP * direction);
}

function daysInMonth(monthIndex) {
  return MONTH_DAY_CAP[monthIndex] || 31;
}

async function loadEntries() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
    state.entries = await res.json();
    buildEntryMap();
    renderNotesList();
  } catch (err) {
    console.error(err);
    const fileProtocol = location.protocol === 'file:';
    els.currentTitle.textContent = 'Unable to load reflections';
    els.currentReflection.textContent = fileProtocol
      ? 'Open this folder with a local server (http://localhost:PORT). Browsers block file:// fetches for JSON.'
      : 'Check your connection and refresh. Offline copies are cached after first load.';
  }
}

function monthIndexFromName(name) {
  return monthIndexByName[name.toLowerCase()] ?? -1;
}

function entryKey(monthIndex, day) {
  return `${monthIndex}-${Number(day)}`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEntryMap() {
  state.entryMap = new Map();
  state.entries.forEach((entry) => {
    const monthIndex = monthIndexFromName(entry.month);
    if (monthIndex >= 0) {
      state.entryMap.set(entryKey(monthIndex, entry.day), entry);
    }
  });
}

function findEntry(monthIndex, day) {
  return state.entryMap.get(entryKey(monthIndex, day)) || null;
}

function jumpToDate(monthIndex, day, options = {}) {
  const entry = findEntry(monthIndex, day);
  if (entry) {
    renderEntry(entry);
    return true;
  } else {
    els.noteStatus.textContent = 'No entry for that date.';
    if (options.fallbackToFirst && state.entries.length) {
      renderEntry(state.entries[0]);
    }
    return false;
  }
}

function showToday() {
  const now = new Date();
  jumpToDate(now.getMonth(), now.getDate(), { fallbackToFirst: true });
}

function showRandom() {
  if (!state.entries.length) return;
  const entry = state.entries[Math.floor(Math.random() * state.entries.length)];
  renderEntry(entry);
}

function renderEntry(entry) {
  state.currentEntry = entry;
  state.currentMonthIndex = monthIndexFromName(entry.month);
  state.currentDay = Number(entry.day);
  els.currentMonth.textContent = entry.month;
  els.currentDay.textContent = entry.day.toString().padStart(2, '0');
  els.currentTitle.textContent = entry.title;
  updateTitleScale(entry.title);
  els.currentSource.textContent = entry.source || '';
  els.currentQuote.textContent = entry.quote || '';
  els.currentReflection.textContent = entry.reflection || '';
  renderTags(entry);
  syncNoteField();
  if (isCalendarOpen()) {
    renderCalendar();
  }
}

function updateTitleScale(title) {
  if (!els.currentTitle) return;
  const length = (title || '').trim().length;
  let scale = 1;
  if (length > 52) {
    scale = 0.78;
  } else if (length > 42) {
    scale = 0.84;
  } else if (length > 32) {
    scale = 0.9;
  } else if (length > 24) {
    scale = 0.96;
  }
  els.currentTitle.style.setProperty('--title-scale', scale.toString());
}

function renderTags(entry) {
  const pageTag = entry.page_index ? `p.${entry.page_index}` : 'Daily';
  if (els.pageTag) {
    els.pageTag.textContent = pageTag;
    return;
  }
  els.currentTags.innerHTML = `
    <span class="tag">${pageTag}</span>
  `;
}

function shiftDay(monthIndex, day, direction) {
  let nextMonth = monthIndex;
  let nextDay = day + direction;
  if (direction > 0 && nextDay > daysInMonth(nextMonth)) {
    nextMonth = (nextMonth + 1) % 12;
    nextDay = 1;
  }
  if (direction < 0 && nextDay < 1) {
    nextMonth = (nextMonth + 11) % 12;
    nextDay = daysInMonth(nextMonth);
  }
  return { monthIndex: nextMonth, day: nextDay };
}

function moveDay(direction) {
  if (!state.currentEntry) return;
  let monthIndex = state.currentMonthIndex ?? new Date().getMonth();
  let day = state.currentDay ?? new Date().getDate();
  let safety = 0;
  ({ monthIndex, day } = shiftDay(monthIndex, day, direction));
  while (safety < 370) {
    const entry = findEntry(monthIndex, day);
    if (entry) {
      renderEntry(entry);
      return;
    }
    ({ monthIndex, day } = shiftDay(monthIndex, day, direction));
    safety += 1;
  }
}

function isCalendarOpen() {
  return els.calendarModal.classList.contains('open');
}

function isMenuOpen() {
  return Boolean(els.menuModal?.classList.contains('open'));
}

function openCalendar() {
  if (!state.entries.length) return;
  state.calendarMonthIndex = state.currentMonthIndex ?? new Date().getMonth();
  renderCalendar();
  els.calendarModal.classList.add('open');
  els.calendarModal.setAttribute('aria-hidden', 'false');
}

function closeCalendar() {
  els.calendarModal.classList.remove('open');
  els.calendarModal.setAttribute('aria-hidden', 'true');
}

function openMenu() {
  if (!els.menuModal) return;
  els.menuModal.classList.add('open');
  els.menuModal.setAttribute('aria-hidden', 'false');
  if (els.menuButton) {
    els.menuButton.setAttribute('aria-expanded', 'true');
    els.menuButton.setAttribute('aria-label', 'Close menu');
  }
  document.body.classList.add('menu-open');
  syncNotePreview();
  renderNotesList();
  els.noteField?.focus();
}

function closeMenu() {
  if (!els.menuModal) return;
  els.menuModal.classList.remove('open');
  els.menuModal.setAttribute('aria-hidden', 'true');
  if (els.menuButton) {
    els.menuButton.setAttribute('aria-expanded', 'false');
    els.menuButton.setAttribute('aria-label', 'Open menu');
  }
  document.body.classList.remove('menu-open');
}

function adjustCalendarMonth(direction) {
  const currentIndex = state.calendarMonthIndex ?? new Date().getMonth();
  state.calendarMonthIndex = (currentIndex + direction + 12) % 12;
  renderCalendar();
}

function renderCalendar() {
  const monthIndex = state.calendarMonthIndex ?? new Date().getMonth();
  const firstDay = new Date(FALLBACK_YEAR, monthIndex, 1).getDay();
  const days = daysInMonth(monthIndex);
  const today = new Date();
  const cells = [];

  WEEKDAY_LABELS.forEach((label) => {
    cells.push(`<div class="calendar-label" role="columnheader">${label}</div>`);
  });

  for (let i = 0; i < firstDay; i += 1) {
    cells.push('<div class="calendar-empty" aria-hidden="true"></div>');
  }

  for (let day = 1; day <= days; day += 1) {
    const entry = findEntry(monthIndex, day);
    const isToday = today.getMonth() === monthIndex && today.getDate() === day;
    const isSelected = state.currentMonthIndex === monthIndex && state.currentDay === day;
    const classes = ['calendar-day'];
    if (isToday) classes.push('today');
    if (isSelected) classes.push('selected');
    if (!entry) {
      cells.push(`<button class="${classes.join(' ')}" disabled>${day}</button>`);
    } else {
      cells.push(
        `<button class="${classes.join(' ')}" data-month="${monthIndex}" data-day="${day}">${day}</button>`
      );
    }
  }

  els.calendarMonthLabel.textContent = monthNames[monthIndex];
  els.calendarGrid.innerHTML = cells.join('');
  els.calendarGrid.querySelectorAll('.calendar-day:not(:disabled)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const month = Number(btn.dataset.month);
      const day = Number(btn.dataset.day);
      jumpToDate(month, day);
      closeCalendar();
    });
  });
}

function renderNotesList() {
  if (!els.notesList) return;
  const noteKeys = Object.keys(state.notes || {});
  if (!noteKeys.length) {
    els.notesList.innerHTML = '<div class="empty">No saved notes yet.</div>';
    return;
  }

  const noteData = noteKeys
    .map((key) => {
      const parts = key.split('-');
      const day = Number(parts.pop());
      const monthName = parts.join('-');
      const monthIndex = monthIndexFromName(monthName);
      const entry = monthIndex >= 0 ? findEntry(monthIndex, day) : null;
      const note = state.notes[key] || '';
      return { day, monthName, monthIndex, entry, note };
    })
    .sort((a, b) => {
      const aMonth = a.monthIndex < 0 ? 99 : a.monthIndex;
      const bMonth = b.monthIndex < 0 ? 99 : b.monthIndex;
      if (aMonth !== bMonth) return aMonth - bMonth;
      return a.day - b.day;
    });

  els.notesList.innerHTML = noteData
    .map((item) => {
      const title = escapeHtml(item.entry?.title || `${item.monthName} ${item.day}`);
      const dateLabel = escapeHtml(item.entry?.date || `${item.monthName} ${item.day}`);
      const trimmed = item.note.trim();
      const snippet = trimmed.length > 140 ? `${trimmed.slice(0, 140)}...` : trimmed;
      const snippetText = snippet || 'Empty note.';
      return `<button class="note-item" data-month="${item.monthIndex}" data-day="${item.day}">
        <div class="note-item-title">${title}</div>
        <div class="note-item-meta">${dateLabel}</div>
        <div class="note-item-snippet">${escapeHtml(snippetText)}</div>
      </button>`;
    })
    .join('');

  els.notesList.querySelectorAll('.note-item').forEach((btn) => {
    const month = Number(btn.dataset.month);
    const day = Number(btn.dataset.day);
    if (Number.isNaN(month) || Number.isNaN(day) || month < 0) return;
    btn.addEventListener('click', () => {
      jumpToDate(month, day);
    });
  });
}

function loadNotes() {
  try {
    state.notes = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}');
  } catch (err) {
    state.notes = {};
  }
  renderNotesList();
}

function saveNotes() {
  localStorage.setItem(NOTES_KEY, JSON.stringify(state.notes));
}

function currentNoteKey() {
  if (!state.currentEntry) return null;
  return `${state.currentEntry.month}-${state.currentEntry.day}`;
}

function syncNoteField() {
  const key = currentNoteKey();
  els.noteField.value = (key && state.notes[key]) || '';
  els.noteStatus.textContent = '';
  syncNotePreview();
}

function saveCurrentNote() {
  const key = currentNoteKey();
  if (!key) return;
  state.notes[key] = els.noteField.value.trim();
  saveNotes();
  els.noteStatus.textContent = 'Saved locally';
  syncNotePreview();
  renderNotesList();
  setTimeout(() => (els.noteStatus.textContent = ''), 1500);
}

function deleteCurrentNote() {
  const key = currentNoteKey();
  if (!key) return;
  if (!state.notes[key]) {
    els.noteStatus.textContent = 'No saved note to delete.';
    setTimeout(() => (els.noteStatus.textContent = ''), 1500);
    return;
  }
  delete state.notes[key];
  saveNotes();
  syncNoteField();
  renderNotesList();
  els.noteStatus.textContent = 'Note deleted';
  setTimeout(() => (els.noteStatus.textContent = ''), 1500);
}

function syncNotePreview() {
  if (!els.notePreview) return;
  const key = currentNoteKey();
  const savedNote = key ? state.notes[key] : '';
  els.notePreview.textContent = savedNote || 'No saved note yet.';
}

function normalizeForSearch(value) {
  return (value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSearchMatches(query) {
  return state.entries.filter((entry) => {
    const noteKey = `${entry.month}-${entry.day}`;
    const noteText = state.notes[noteKey] || '';
    const haystack = normalizeForSearch(
      `${entry.title} ${entry.quote} ${entry.reflection} ${noteText}`
    );
    return haystack.includes(query);
  });
}

function renderSearchResults() {
  if (!searchState.matches.length) {
    els.searchResults.innerHTML = '<div class="empty">No matches yet.</div>';
    return;
  }

  const visible = searchState.matches.slice(0, searchState.visibleCount);
  const remaining = searchState.matches.length - visible.length;
  const resultsMarkup = visible
    .map((entry) => {
      const monthIdx = monthNames.findIndex((m) => m.toLowerCase() === entry.month.toLowerCase());
      const source = entry.source ? ` - ${entry.source}` : '';
      return `<button class="result" data-month="${monthIdx}" data-day="${entry.day}">
        <div class="result-title">${entry.title}</div>
        <div class="result-meta">${entry.month} ${entry.day}${source}</div>
      </button>`;
    })
    .join('');

  const footerMarkup = `
    <div class="results-footer">
      <div class="results-count">Showing ${visible.length} of ${searchState.matches.length}</div>
      ${remaining > 0
    ? `<button class="ghost load-more" type="button">Show next ${Math.min(SEARCH_PAGE_SIZE, remaining)}</button>`
    : ''}
    </div>
  `;

  els.searchResults.innerHTML = resultsMarkup + footerMarkup;

  els.searchResults.querySelectorAll('.result').forEach((btn) => {
    btn.addEventListener('click', () => {
      const month = Number(btn.dataset.month);
      const day = Number(btn.dataset.day);
      jumpToDate(month, day);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  const loadMoreButton = els.searchResults.querySelector('.load-more');
  if (loadMoreButton) {
    loadMoreButton.addEventListener('click', () => {
      searchState.visibleCount = Math.min(
        searchState.visibleCount + SEARCH_PAGE_SIZE,
        searchState.matches.length
      );
      renderSearchResults();
    });
  }
}

function onSearch() {
  const rawQuery = els.searchInput.value.trim();
  const query = normalizeForSearch(rawQuery);
  if (!query || query.length < 2) {
    searchState.query = '';
    searchState.matches = [];
    searchState.visibleCount = 0;
    els.searchResults.innerHTML = '<div class="empty">Type to search the collection.</div>';
    return;
  }

  if (query !== searchState.query) {
    searchState.query = query;
    searchState.matches = getSearchMatches(query);
    searchState.visibleCount = Math.min(SEARCH_PAGE_SIZE, searchState.matches.length);
  }

  renderSearchResults();
}

async function shareCurrent() {
  if (!state.currentEntry) return;
  const text = `${state.currentEntry.title}\n${state.currentEntry.quote}\n\n${state.currentEntry.reflection}`;
  const sharePayload = {
    title: 'Daily Reflections',
    text,
    url: location.href
  };

  if (navigator.share) {
    try {
      await navigator.share(sharePayload);
    } catch (err) {
      // user canceled share
    }
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    els.noteStatus.textContent = 'Copied for sharing';
    setTimeout(() => (els.noteStatus.textContent = ''), 1600);
  }
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  els.networkStatus.textContent = online ? 'Online' : 'Offline ready';
  els.networkStatus.classList.toggle('muted', !online);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!location.protocol.startsWith('http')) return;
  try {
    await navigator.serviceWorker.register('service-worker.js');
    els.pwaStatus.textContent = 'Ready for Add to Home Screen';
    els.pwaStatus.classList.remove('muted');
  } catch (err) {
    console.warn('Service worker registration failed', err);
  }
}
