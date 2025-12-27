const BOOKS = [
  {
    id: "source-a",
    label: "Twelve Steps and Twelve Traditions (Source A)",
    file: "data/twlvxtwlv.json"
  },
  {
    id: "source-b",
    label: "Twelve Steps and Twelve Traditions (Source B)",
    file: "data/twelve_steps_structured.json"
  }
];

const elements = {
  bookSelect: document.getElementById("bookSelect"),
  bookTitle: document.getElementById("bookTitle"),
  bookAuthor: document.getElementById("bookAuthor"),
  bookSubject: document.getElementById("bookSubject"),
  progressFill: document.getElementById("progressFill"),
  progressLabel: document.getElementById("progressLabel"),
  continueBtn: document.getElementById("continueBtn"),
  resetBtn: document.getElementById("resetBtn"),
  searchInput: document.getElementById("searchInput"),
  clearSearch: document.getElementById("clearSearch"),
  searchCount: document.getElementById("searchCount"),
  filterChips: document.getElementById("filterChips"),
  tocList: document.getElementById("tocList"),
  notesList: document.getElementById("notesList"),
  contentTitle: document.getElementById("contentTitle"),
  contentMeta: document.getElementById("contentMeta"),
  contentEyebrow: document.getElementById("contentEyebrow"),
  focusToggle: document.getElementById("focusToggle"),
  toTopBtn: document.getElementById("toTopBtn"),
  sections: document.getElementById("sections")
};

const appState = {
  currentBookId: BOOKS[0].id,
  filter: "all",
  query: "",
  cache: {},
  observer: null,
  firstSectionId: null,
  tocMap: new Map(),
  activeToc: null
};

function init() {
  const focusPref = localStorage.getItem("book-study:focus");
  if (focusPref === "1") {
    document.body.classList.add("focus");
  }

  const savedBook = localStorage.getItem("book-study:last-book");
  if (savedBook && BOOKS.some((book) => book.id === savedBook)) {
    appState.currentBookId = savedBook;
  }

  BOOKS.forEach((book) => {
    const option = document.createElement("option");
    option.value = book.id;
    option.textContent = book.label;
    elements.bookSelect.appendChild(option);
  });
  elements.bookSelect.value = appState.currentBookId;

  elements.bookSelect.addEventListener("change", (event) => {
    appState.currentBookId = event.target.value;
    appState.query = "";
    elements.searchInput.value = "";
    updateClearSearchButton();
    localStorage.setItem("book-study:last-book", appState.currentBookId);
    render();
  });

  elements.searchInput.addEventListener("input", (event) => {
    appState.query = event.target.value.trim();
    updateClearSearchButton();
    renderSections();
  });

  elements.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      appState.query = "";
      elements.searchInput.value = "";
      updateClearSearchButton();
      renderSections();
    }
  });

  elements.clearSearch.addEventListener("click", () => {
    appState.query = "";
    elements.searchInput.value = "";
    updateClearSearchButton();
    renderSections();
    elements.searchInput.focus();
  });

  elements.filterChips.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) {
      return;
    }
    elements.filterChips.querySelectorAll(".chip").forEach((button) => {
      button.classList.toggle("active", button === chip);
    });
    appState.filter = chip.dataset.filter;
    renderSections();
  });

  elements.continueBtn.addEventListener("click", () => {
    const state = loadBookState(appState.currentBookId);
    const targetId = state.lastSectionId || appState.firstSectionId;
    if (targetId) {
      const target = document.getElementById(`section-${targetId}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  });

  elements.resetBtn.addEventListener("click", () => {
    if (!confirm("Reset notes and progress for this book?")) {
      return;
    }
    const state = loadBookState(appState.currentBookId);
    state.notes = {};
    state.read = {};
    state.lastSectionId = null;
    saveBookState(appState.currentBookId, state);
    renderSections();
    updateNotesList();
    updateProgress();
  });

  elements.focusToggle.addEventListener("click", () => {
    document.body.classList.toggle("focus");
    updateFocusButton();
  });

  elements.toTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", () => {
    const show = window.scrollY > 280;
    elements.toTopBtn.classList.toggle("visible", show);
  });

  updateFocusButton();
  updateClearSearchButton();
  render();
}

function storageKey(bookId) {
  return `book-study:${bookId}`;
}

function loadBookState(bookId) {
  const raw = localStorage.getItem(storageKey(bookId));
  if (!raw) {
    return { notes: {}, read: {}, lastSectionId: null };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      notes: parsed.notes || {},
      read: parsed.read || {},
      lastSectionId: parsed.lastSectionId || null
    };
  } catch (error) {
    return { notes: {}, read: {}, lastSectionId: null };
  }
}

function saveBookState(bookId, data) {
  localStorage.setItem(storageKey(bookId), JSON.stringify(data));
}

async function loadBook(bookId) {
  if (appState.cache[bookId]) {
    return appState.cache[bookId];
  }
  const bookConfig = BOOKS.find((book) => book.id === bookId);
  const response = await fetch(bookConfig.file);
  const data = await response.json();
  const prepared = prepareBook(data, bookConfig);
  appState.cache[bookId] = prepared;
  return prepared;
}

function normalizeText(text) {
  if (!text) {
    return "";
  }
  return text
    .replace(/\u0192\?o/g, "\"")
    .replace(/\u0192\?\?/g, "\"")
    .replace(/\u0192\?/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "-")
    .replace(/\u00a0/g, " ");
}

function prepareBook(data, config) {
  let currentGroup = "front";
  let currentHeadingKey = null;
  const sections = data.sections.map((section, index) => {
    const key = String(index);
    const text = normalizeText(section.text);
    const type = section.type || "paragraph";
    if (type === "heading") {
      currentHeadingKey = key;
      const lower = text.toLowerCase();
      if (lower.includes("twelve steps")) {
        currentGroup = "steps";
      } else if (lower.includes("twelve traditions")) {
        currentGroup = "traditions";
      } else if (lower.startsWith("tradition")) {
        currentGroup = "traditions";
      } else if (lower.startsWith("step")) {
        currentGroup = "steps";
      }
    }
    return {
      key,
      type,
      text,
      items: section.items ? section.items.map(normalizeText) : [],
      level: section.level || 2,
      pageNumber: section.pageNumber,
      group: currentGroup,
      anchorKey: currentHeadingKey || key
    };
  });

  return {
    id: config.id,
    label: config.label,
    metadata: data.metadata || {},
    sections
  };
}

function render() {
  loadBook(appState.currentBookId).then((book) => {
    updateHeader(book);
    renderSections();
    updateNotesList();
  });
}

function updateHeader(book) {
  elements.bookTitle.textContent = book.metadata.title || book.label;
  elements.bookAuthor.textContent = book.metadata.author || "";
  elements.bookSubject.textContent = book.metadata.subject || "";
  elements.contentTitle.textContent = book.metadata.title || book.label;
  elements.contentEyebrow.textContent = book.label;
  const pageCount = book.metadata.pageCount ? `${book.metadata.pageCount} pages` : "";
  const author = book.metadata.author ? `By ${book.metadata.author}` : "";
  const date = book.metadata.creationDate ? `Created ${book.metadata.creationDate}` : "";
  const metaPieces = [author, pageCount, date].filter(Boolean);
  elements.contentMeta.textContent = metaPieces.join(" | ");
}

function buildToc(book, sections) {
  elements.tocList.innerHTML = "";
  appState.tocMap = new Map();
  appState.activeToc = null;
  const fragment = document.createDocumentFragment();
  (sections || book.sections)
    .filter((section) => section.type === "heading")
    .forEach((section) => {
      const item = document.createElement("li");
      item.textContent = section.text;
      item.dataset.target = `section-${section.key}`;
      item.dataset.level = section.level || 2;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", `Go to ${section.text}`);
      appState.tocMap.set(section.key, item);
      const handleScroll = () => {
        const target = document.getElementById(item.dataset.target);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      };
      item.addEventListener("click", handleScroll);
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleScroll();
        }
      });
      fragment.appendChild(item);
    });
  elements.tocList.appendChild(fragment);
}

function renderSections() {
  loadBook(appState.currentBookId).then((book) => {
    const query = appState.query;
    const state = loadBookState(appState.currentBookId);
    elements.sections.innerHTML = "";
    const fragment = document.createDocumentFragment();

    const filtered = book.sections.filter((section) => matchesFilter(section));
    const visible = query ? filtered.filter((section) => matchesQuery(section, query)) : filtered;
    appState.firstSectionId = visible.length > 0 ? visible[0].key : null;

    if (visible.length === 0) {
      const empty = document.createElement("div");
      empty.className = "section section--empty";
      empty.innerHTML = "<p class=\"section-paragraph\">No matches. Try clearing search or changing filters.</p>";
      fragment.appendChild(empty);
    } else {
      visible.forEach((section, index) => {
        const sectionEl = buildSection(section, state, query, index);
        fragment.appendChild(sectionEl);
      });
    }

    elements.sections.appendChild(fragment);
    elements.searchCount.textContent = query
      ? `${visible.length} match${visible.length === 1 ? "" : "es"} of ${filtered.length}`
      : `${filtered.length} sections`;
    buildToc(book, filtered);
    if (visible.length > 0) {
      setActiveToc(visible[0].anchorKey);
    }
    updateContinueButton(state);
    updateObserver();
    updateProgress();
  });
}

function matchesFilter(section) {
  if (appState.filter === "all") {
    return true;
  }
  return section.group === appState.filter;
}

function matchesQuery(section, query) {
  if (!query) {
    return true;
  }
  const needle = query.toLowerCase();
  if ((section.text || "").toLowerCase().includes(needle)) {
    return true;
  }
  return (section.items || []).some((item) => item.toLowerCase().includes(needle));
}

function buildSection(section, state, query, index) {
  const sectionEl = document.createElement("article");
  sectionEl.className = "section";
  sectionEl.id = `section-${section.key}`;
  sectionEl.dataset.sectionId = section.key;
  sectionEl.dataset.anchorId = section.anchorKey;
  sectionEl.style.animationDelay = `${Math.min(index * 40, 320)}ms`;

  if (state.read[section.key]) {
    sectionEl.classList.add("read");
  }
  if (state.notes[section.key]) {
    sectionEl.classList.add("section--note-open");
  }

  if (section.type === "heading") {
    const heading = document.createElement("h2");
    heading.className = `section-heading level-${section.level || 2}`;
    heading.innerHTML = highlightText(section.text, query);
    sectionEl.appendChild(heading);
  } else if (section.type === "paragraph") {
    const paragraph = document.createElement("p");
    paragraph.className = "section-paragraph";
    paragraph.innerHTML = highlightText(section.text, query);
    sectionEl.appendChild(paragraph);
  } else if (section.type === "list") {
    const listTitle = document.createElement("p");
    listTitle.className = "section-paragraph";
    listTitle.innerHTML = highlightText(section.text, query);
    sectionEl.appendChild(listTitle);

    const list = document.createElement("ul");
    list.className = "section-list";
    section.items.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = highlightText(item, query);
      list.appendChild(li);
    });
    sectionEl.appendChild(list);
  }

  const actions = document.createElement("div");
  actions.className = "section-actions";
  const meta = document.createElement("div");
  const pageLabel = section.pageNumber ? `Page ${section.pageNumber}` : "Section";
  const groupLabel = section.group === "steps" ? "Steps" : section.group === "traditions" ? "Traditions" : "Front Matter";
  meta.textContent = `${pageLabel} | ${groupLabel}`;

  const status = document.createElement("div");
  status.className = "section-status";
  status.textContent = state.read[section.key] ? "Read" : "Unread";

  const noteToggle = document.createElement("button");
  noteToggle.className = "note-toggle";
  noteToggle.type = "button";
  noteToggle.setAttribute("aria-expanded", String(sectionEl.classList.contains("section--note-open")));
  updateNoteToggle(noteToggle, sectionEl.classList.contains("section--note-open"));
  noteToggle.addEventListener("click", () => {
    sectionEl.classList.toggle("section--note-open");
    updateNoteToggle(noteToggle, sectionEl.classList.contains("section--note-open"));
  });

  actions.appendChild(meta);
  actions.appendChild(status);
  actions.appendChild(noteToggle);
  sectionEl.appendChild(actions);

  const noteArea = document.createElement("div");
  noteArea.className = "note-area";
  const noteField = document.createElement("textarea");
  noteField.placeholder = "Write your study notes here.";
  noteField.value = state.notes[section.key] || "";
  noteField.addEventListener("input", (event) => {
    const updated = loadBookState(appState.currentBookId);
    updated.notes[section.key] = event.target.value.trim();
    saveBookState(appState.currentBookId, updated);
    updateNotesList();
  });
  noteArea.appendChild(noteField);
  sectionEl.appendChild(noteArea);

  return sectionEl;
}

function updateObserver() {
  if (appState.observer) {
    appState.observer.disconnect();
  }
  appState.observer = new IntersectionObserver(
    (entries) => {
      const state = loadBookState(appState.currentBookId);
      const allowProgress = !appState.query;
      let updated = false;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        const sectionId = entry.target.dataset.sectionId;
        const anchorId = entry.target.dataset.anchorId;
        setActiveToc(anchorId);
        if (allowProgress && !state.read[sectionId]) {
          state.read[sectionId] = true;
          updated = true;
          entry.target.classList.add("read");
          const status = entry.target.querySelector(".section-status");
          if (status) {
            status.textContent = "Read";
          }
        }
        if (allowProgress) {
          state.lastSectionId = sectionId;
        }
      });
      if (updated) {
        saveBookState(appState.currentBookId, state);
        updateProgress();
      } else if (allowProgress && state.lastSectionId) {
        saveBookState(appState.currentBookId, state);
      }
    },
    { threshold: 0.5 }
  );

  document.querySelectorAll(".section[data-section-id]").forEach((section) => {
    appState.observer.observe(section);
  });
}

function updateContinueButton(state) {
  const targetId = state.lastSectionId || appState.firstSectionId;
  elements.continueBtn.disabled = !targetId;
  elements.continueBtn.textContent = state.lastSectionId ? "Continue" : "Start";
}

function updateClearSearchButton() {
  elements.clearSearch.classList.toggle("hidden", !appState.query);
}

function updateFocusButton() {
  const isFocus = document.body.classList.contains("focus");
  elements.focusToggle.textContent = isFocus ? "Exit Focus" : "Focus";
  elements.focusToggle.setAttribute("aria-pressed", String(isFocus));
  localStorage.setItem("book-study:focus", isFocus ? "1" : "0");
}

function updateNoteToggle(button, isOpen) {
  button.textContent = isOpen ? "Hide Notes" : "Notes";
  button.setAttribute("aria-expanded", String(isOpen));
}

function setActiveToc(anchorId) {
  if (!anchorId || appState.activeToc === anchorId) {
    return;
  }
  const next = appState.tocMap.get(anchorId);
  if (!next) {
    return;
  }
  if (appState.activeToc) {
    const prev = appState.tocMap.get(appState.activeToc);
    if (prev) {
      prev.classList.remove("active");
    }
  }
  next.classList.add("active");
  appState.activeToc = anchorId;
}

function updateProgress() {
  loadBook(appState.currentBookId).then((book) => {
    const state = loadBookState(appState.currentBookId);
    const total = book.sections.length || 1;
    const readCount = Object.keys(state.read).length;
    const percent = Math.min(100, Math.round((readCount / total) * 100));
    elements.progressFill.style.width = `${percent}%`;
    elements.progressLabel.textContent = `${readCount} of ${total} sections read (${percent}%)`;
  });
}

function updateNotesList() {
  loadBook(appState.currentBookId).then((book) => {
    const state = loadBookState(appState.currentBookId);
    const entries = Object.entries(state.notes)
      .filter(([, value]) => value && value.length > 0)
      .slice(0, 5)
      .map(([key, value]) => {
        const section = book.sections.find((item) => item.key === key);
        const title = section ? section.text : "Note";
        return { key, title, value };
      });
    elements.notesList.innerHTML = "";
    if (entries.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = "No notes yet.";
      elements.notesList.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    entries.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = `${entry.title}: ${entry.value.slice(0, 60)}`;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", `Open notes for ${entry.title}`);
      item.addEventListener("click", () => {
        const target = document.getElementById(`section-${entry.key}`);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          item.click();
        }
      });
      fragment.appendChild(item);
    });
    elements.notesList.appendChild(fragment);
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text, query) {
  const safeText = escapeHtml(text || "");
  if (!query) {
    return safeText;
  }
  const escapedQuery = escapeRegExp(query);
  const regex = new RegExp(escapedQuery, "gi");
  return safeText.replace(regex, (match) => `<mark>${match}</mark>`);
}

init();



