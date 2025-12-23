const DATA_URL = 'data/daily_reflections.json';
const NOTES_KEY = 'daily-reflections-notes-v1';
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
  calendarMonthIndex: null
};

const els = {
  monthSelect: document.getElementById('monthSelect'),
  daySelect: document.getElementById('daySelect'),
  goButton: document.getElementById('goButton'),
  openCalendar: document.getElementById('openCalendar'),
  todayButton: document.getElementById('todayButton'),
  randomButton: document.getElementById('randomButton'),
  shareButton: document.getElementById('shareButton'),
  prevButton: document.getElementById('prevButton'),
  nextButton: document.getElementById('nextButton'),
  calendarButton: document.getElementById('calendarButton'),
  calendarModal: document.getElementById('calendarModal'),
  calendarClose: document.getElementById('calendarClose'),
  calendarPrev: document.getElementById('calendarPrev'),
  calendarNext: document.getElementById('calendarNext'),
  calendarMonthLabel: document.getElementById('calendarMonthLabel'),
  calendarGrid: document.getElementById('calendarGrid'),
  currentMonth: document.getElementById('currentMonth'),
  currentDay: document.getElementById('currentDay'),
  currentDate: document.getElementById('currentDate'),
  currentTitle: document.getElementById('currentTitle'),
  currentSource: document.getElementById('currentSource'),
  currentQuote: document.getElementById('currentQuote'),
  currentReflection: document.getElementById('currentReflection'),
  currentTags: document.getElementById('currentTags'),
  noteField: document.getElementById('noteField'),
  saveNote: document.getElementById('saveNote'),
  noteStatus: document.getElementById('noteStatus'),
  searchInput: document.getElementById('searchInput'),
  searchResults: document.getElementById('searchResults'),
  networkStatus: document.getElementById('networkStatus'),
  pwaStatus: document.getElementById('pwaStatus')
};

init();

async function init() {
  fillMonthOptions();
  bindEvents();
  loadNotes();
  await loadEntries();
  showToday();
  updateNetworkStatus();
  registerServiceWorker();
  onSearch();
}

function bindEvents() {
  els.monthSelect.addEventListener('change', () => updateDayOptions());
  els.goButton.addEventListener('click', () => {
    const month = Number(els.monthSelect.value);
    const day = Number(els.daySelect.value);
    jumpToDate(month, day);
  });
  els.openCalendar.addEventListener('click', openCalendar);
  els.todayButton.addEventListener('click', showToday);
  els.prevButton.addEventListener('click', () => moveDay(-1));
  els.nextButton.addEventListener('click', () => moveDay(1));
  els.randomButton.addEventListener('click', showRandom);
  els.calendarButton.addEventListener('click', openCalendar);
  els.calendarClose.addEventListener('click', closeCalendar);
  els.calendarPrev.addEventListener('click', () => adjustCalendarMonth(-1));
  els.calendarNext.addEventListener('click', () => adjustCalendarMonth(1));
  els.calendarModal.addEventListener('click', (event) => {
    if (event.target?.dataset?.close === 'calendar') {
      closeCalendar();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isCalendarOpen()) {
      closeCalendar();
    }
  });
  els.shareButton.addEventListener('click', shareCurrent);
  els.saveNote.addEventListener('click', saveCurrentNote);
  els.searchInput.addEventListener('input', onSearch);
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
}

function fillMonthOptions() {
  els.monthSelect.innerHTML = monthNames
    .map((m, idx) => `<option value="${idx}">${m}</option>`)
    .join('');
  updateDayOptions();
}

function updateDayOptions(monthIndex = Number(els.monthSelect.value)) {
  const days = daysInMonth(monthIndex);
  const currentDay = Math.min(Number(els.daySelect.value) || 1, days);
  const options = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const selected = day === currentDay ? 'selected' : '';
    return `<option value="${day}" ${selected}>${day}</option>`;
  });
  els.daySelect.innerHTML = options.join('');
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
  els.currentDate.textContent = entry.date || `${entry.month} ${entry.day}`;
  els.currentTitle.textContent = entry.title;
  els.currentSource.textContent = entry.source || '';
  els.currentQuote.textContent = entry.quote || '';
  els.currentReflection.textContent = entry.reflection || '';
  renderTags(entry);
  syncNoteField();
  syncSelects();
  if (isCalendarOpen()) {
    renderCalendar();
  }
}

function renderTags(entry) {
  const monthTag = entry.month;
  const pageTag = entry.page_index ? `p.${entry.page_index}` : 'Daily';
  els.currentTags.innerHTML = `
    <span class="tag">${monthTag}</span>
    <span class="tag">${pageTag}</span>
  `;
}

function syncSelects() {
  if (state.currentMonthIndex == null || state.currentMonthIndex < 0) return;
  els.monthSelect.value = state.currentMonthIndex;
  updateDayOptions(state.currentMonthIndex);
  els.daySelect.value = state.currentDay;
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

function loadNotes() {
  try {
    state.notes = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}');
  } catch (err) {
    state.notes = {};
  }
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
}

function saveCurrentNote() {
  const key = currentNoteKey();
  if (!key) return;
  state.notes[key] = els.noteField.value.trim();
  saveNotes();
  els.noteStatus.textContent = 'Saved locally';
  setTimeout(() => (els.noteStatus.textContent = ''), 1500);
}

function onSearch() {
  const query = els.searchInput.value.trim().toLowerCase();
  if (!query || query.length < 2) {
    els.searchResults.innerHTML = '<div class="empty">Type to search the collection.</div>';
    return;
  }

  const matches = state.entries
    .filter((entry) => {
      const haystack = `${entry.title} ${entry.quote} ${entry.reflection}`.toLowerCase();
      return haystack.includes(query);
    })
    .slice(0, 20);

  if (!matches.length) {
    els.searchResults.innerHTML = '<div class="empty">No matches yet.</div>';
    return;
  }

  els.searchResults.innerHTML = matches
    .map((entry) => {
      const monthIdx = monthNames.findIndex((m) => m.toLowerCase() === entry.month.toLowerCase());
      const source = entry.source ? ` - ${entry.source}` : '';
      return `<button class="result" data-month="${monthIdx}" data-day="${entry.day}">
        <div class="result-title">${entry.title}</div>
        <div class="result-meta">${entry.month} ${entry.day}${source}</div>
      </button>`;
    })
    .join('');

  els.searchResults.querySelectorAll('.result').forEach((btn) => {
    btn.addEventListener('click', () => {
      const month = Number(btn.dataset.month);
      const day = Number(btn.dataset.day);
      jumpToDate(month, day);
      els.monthSelect.value = month;
      updateDayOptions(month);
      els.daySelect.value = day;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
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

