const dashboardUser = document.querySelector("#dashboard-user");
const adminPanel = document.querySelector("#admin-panel");
const filmSearchForm = document.querySelector("#film-search-form");
const filmSearchResults = document.querySelector("#film-search-results");
const createScreeningForm = document.querySelector("#create-screening-form");
const createScreeningMessage = document.querySelector("#create-screening-message");
const profileForm = document.querySelector("#profile-form");
const profileMessage = document.querySelector("#profile-message");
const adminProfilesList = document.querySelector("#admin-profiles-list");
const adminProfilesMessage = document.querySelector("#admin-profiles-message");
const myPickPanel = document.querySelector("#my-pick-panel");
const myPickFilmSearchForm = document.querySelector("#my-pick-film-search-form");
const myPickFilmSearchResults = document.querySelector("#my-pick-film-search-results");
const myPickForm = document.querySelector("#my-pick-form");
const myPickMessage = document.querySelector("#my-pick-message");
const rotationList = document.querySelector("#rotation-list");
const rotationMessage = document.querySelector("#rotation-message");

let rotationData = null;

function cloneTemplate(id) {
  return document.getElementById(id).content.cloneNode(true).firstElementChild;
}

function bind(root, name) {
  return root.querySelector(`[data-bind="${name}"]`);
}

function countGraphemes(value) {
  if (!value) {
    return 0;
  }

  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)).length;
  }

  return Array.from(value).length;
}

function isSingleEmoji(value) {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || countGraphemes(trimmed) !== 1) {
    return false;
  }

  if (/[\p{L}]/u.test(trimmed)) {
    return false;
  }

  return /(\p{Extended_Pictographic}|\p{Regional_Indicator})/u.test(trimmed);
}

function validateEmojiInput(input) {
  if (!input) {
    return true;
  }

  const value = String(input.value || "").trim();
  input.value = value;

  const valid = isSingleEmoji(value);
  input.setCustomValidity(valid ? "" : "Enter exactly one emoji, with no text.");
  return valid;
}

function initColourPicker(dotButton, colourInput, selectedColour) {
  if (!dotButton || !colourInput) {
    return;
  }

  const chosen = (selectedColour || colourInput.value || "#3E8F3B").toUpperCase();
  colourInput.value = chosen;
  dotButton.style.backgroundColor = chosen;

  if (!dotButton.dataset.boundColorPicker) {
    dotButton.addEventListener("click", () => {
      if (typeof colourInput.showPicker === "function") {
        colourInput.showPicker();
      } else {
        colourInput.click();
      }
    });

    colourInput.addEventListener("input", () => {
      const value = String(colourInput.value || "#3E8F3B").toUpperCase();
      colourInput.value = value;
      dotButton.style.backgroundColor = value;
    });

    dotButton.dataset.boundColorPicker = "true";
  } else {
    colourInput.dispatchEvent(new Event("input"));
  }
}

function createColorDotPicker(initialColor = "#3E8F3B") {
  const wrapper = cloneTemplate("color-dot-picker-tpl");
  const dotButton = wrapper.querySelector(".color-dot");
  const colourInput = wrapper.querySelector(".native-color-input");
  initColourPicker(dotButton, colourInput, initialColor);
  return { wrapper, dotButton, colourInput };
}

async function loadDashboard() {
  try {
    const [{ member }, fetchedRotation] = await Promise.all([
      window.filmCrew.fetchJson("/api/me"),
      window.filmCrew.fetchJson("/api/rotation").catch(() => null)
    ]);

    rotationData = fetchedRotation;
    dashboardUser.replaceChildren(
      document.createTextNode("Signed in as "),
      window.filmCrew.createMemberIdentity({
        name: member.displayName,
        profileColor: member.profileColor,
        profileEmoji: member.profileEmoji
      }),
      document.createTextNode(".")
    );
    hydrateProfileForm(member);
    await loadSchedule();

    if (rotationData?.nextPicker?.displayName === member.displayName) {
      myPickPanel?.classList.remove("hidden");
    }

    // Check if user is admin by attempting to access admin endpoint
    try {
      await window.filmCrew.fetchJson("/api/members");
      adminPanel.classList.remove("hidden");
      await populateMemberOptions();
      await renderAdminProfileEditors();
      initRefreshAllFilmsButton();
      await renderRotationAdmin();
      updateCreateScreeningDefaults(rotationData);
    } catch {
      // User is not admin, hide admin panel
    }
  } catch {
    const loginLink = window.filmCrew.createEl("a", {
      className: "text-link",
      text: "Go to login page",
      attrs: { href: "/login/" }
    });
    dashboardUser.replaceChildren(document.createTextNode("You are not authenticated. "), loginLink, document.createTextNode("."));
  }
}

function hydrateProfileForm(member) {
  if (!profileForm) {
    return;
  }

  const colourInput = profileForm.elements.profileColor;
  const emojiInput = profileForm.elements.profileEmoji;
  const dotButton = profileForm.querySelector('[data-color-dot="self"]');

  colourInput.value = (member.profileColor || "#3E8F3B").toUpperCase();
  emojiInput.value = member.profileEmoji || "🎬";
  validateEmojiInput(emojiInput);
  initColourPicker(dotButton, colourInput, colourInput.value);

  const telegramInput = profileForm.elements.telegramUsername;
  if (telegramInput) {
    telegramInput.value = member.telegramUsername || "";
  }
}

async function populateMemberOptions() {
  const select = createScreeningForm.elements.chooserDisplayName;
  const { members } = await window.filmCrew.fetchJson("/api/members");
  const options = members.map((member) => {
    const option = window.filmCrew.createEl("option", {
      text: member.displayName,
      attrs: { value: member.displayName }
    });
    return option;
  });
  select.replaceChildren(...options);
}

async function renderAdminProfileEditors() {
  if (!adminProfilesList) {
    return;
  }

  const { members } = await window.filmCrew.fetchJson("/api/members");
  const cards = members.map((member) => {
    const form = cloneTemplate("member-profile-row-tpl");
    form.dataset.displayName = member.displayName;

    bind(form, "title").replaceChildren(window.filmCrew.createMemberIdentity({
      name: member.displayName,
      profileColor: member.profileColor,
      profileEmoji: member.profileEmoji
    }));

    const emojiInput = bind(form, "emojiInput");
    emojiInput.value = member.profileEmoji || "🎬";
    validateEmojiInput(emojiInput);
    emojiInput.addEventListener("input", () => validateEmojiInput(emojiInput));

    const { wrapper: colourPickerWrap } = createColorDotPicker(member.profileColor || "#3E8F3B");
    bind(form, "colorPicker").replaceWith(colourPickerWrap);

    return form;
  });

  adminProfilesList.replaceChildren(...cards);
}

profileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateEmojiInput(profileForm.elements.profileEmoji) || !profileForm.reportValidity()) {
    return;
  }
  profileMessage.textContent = "Saving profile…";

  try {
    const { member } = await window.filmCrew.fetchJson("/api/me/profile", {
      method: "PUT",
      body: JSON.stringify({
        profileColor: profileForm.elements.profileColor.value,
        profileEmoji: profileForm.elements.profileEmoji.value,
        telegramUsername: profileForm.elements.telegramUsername?.value ?? ""
      })
    });

    hydrateProfileForm(member);
    profileMessage.textContent = "Profile updated.";
    await loadDashboard();
  } catch (error) {
    profileMessage.textContent = error.message;
  }
});

adminProfilesList?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target.closest("form.member-profile-row");
  if (!form) {
    return;
  }

  if (!validateEmojiInput(form.elements.profileEmoji) || !form.reportValidity()) {
    return;
  }

  adminProfilesMessage.textContent = "Saving member profile…";
  try {
    await window.filmCrew.fetchJson("/api/admin/members/profile", {
      method: "PUT",
      body: JSON.stringify({
        displayName: form.dataset.displayName,
        profileColor: form.elements.profileColor.value,
        profileEmoji: form.elements.profileEmoji.value
      })
    });

    adminProfilesMessage.textContent = "Member profile updated.";
    await renderAdminProfileEditors();
    await loadDashboard();
  } catch (error) {
    adminProfilesMessage.textContent = error.message;
  }
});

profileForm?.elements.profileEmoji?.addEventListener("input", (event) => {
  validateEmojiInput(event.target);
});

filmSearchForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(filmSearchForm);
  const query = formData.get("query");

  window.filmCrew.setMutedMessage(filmSearchResults, "Searching...");

  try {
    const { results } = await window.filmCrew.fetchJson(`/api/admin/film-search?q=${encodeURIComponent(query)}`);

    if (!results.length) {
      window.filmCrew.setMutedMessage(filmSearchResults, "No OMDb results matched that search.");
      return;
    }

    const cards = results.map((film) => {
      const card = cloneTemplate("film-search-card-tpl");
      const poster = bind(card, "poster");
      if (film.posterUrl) {
        poster.src = film.posterUrl;
        poster.alt = `${film.title} poster`;
        poster.hidden = false;
      }
      bind(card, "title").textContent = film.title;
      bind(card, "year").textContent = film.year || "Unknown year";
      const btn = bind(card, "select");
      btn.dataset.imdbId = film.imdbId;
      btn.dataset.filmTitle = film.title;
      return card;
    });

    window.filmCrew.replaceChildren(filmSearchResults, cards);
  } catch (error) {
    window.filmCrew.setMutedMessage(filmSearchResults, error.message);
  }
});

filmSearchResults?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-imdb-id]");
  if (!button) {
    return;
  }

  createScreeningForm.classList.remove("hidden");
  createScreeningForm.elements.imdbId.value = button.dataset.imdbId;
  createScreeningMessage.textContent = `${button.dataset.filmTitle} selected.`;
});

createScreeningForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  createScreeningMessage.textContent = "Creating screening…";

  try {
    const payload = await window.filmCrew.fetchJson("/api/admin/screenings", {
      method: "POST",
      body: JSON.stringify({
        watchDate: createScreeningForm.elements.watchDate.value,
        chooserDisplayName: createScreeningForm.elements.chooserDisplayName.value,
        imdbId: createScreeningForm.elements.imdbId.value,
        notes: createScreeningForm.elements.notes.value
      })
    });
    const { screening } = payload;
    createScreeningForm.reset();
    createScreeningForm.classList.add("hidden");
    createScreeningMessage.textContent = `Screening created for ${screening.weekKey}.`;
  } catch (error) {
    createScreeningMessage.textContent = error.message;
  }
});

function initRefreshAllFilmsButton() {
  const btn = document.getElementById("refresh-all-films-btn");
  const msg = document.getElementById("refresh-all-films-message");
  if (!btn || !msg) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    msg.textContent = "Refreshing… this may take a minute.";
    try {
      const result = await window.filmCrew.fetchJson("/api/admin/films/refresh-all", { method: "POST" });
      msg.textContent = `Done. ${result.total} films refreshed, ${result.failed} failed.`;
    } catch (err) {
      msg.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

function updateCreateScreeningDefaults(data) {
  if (!createScreeningForm) return;
  if (data?.nextScreeningDate) {
    createScreeningForm.elements.watchDate.value = data.nextScreeningDate;
  }
  if (data?.nextPicker && createScreeningForm.elements.chooserDisplayName) {
    createScreeningForm.elements.chooserDisplayName.value = data.nextPicker.displayName;
  }
}

async function renderRotationAdmin() {
  if (!rotationList) return;

  const { members } = await window.filmCrew.fetchJson("/api/members");

  const sorted = [...members].sort((a, b) => {
    const aOrd = a.rotationOrder ?? Infinity;
    const bOrd = b.rotationOrder ?? Infinity;
    if (aOrd !== bOrd) return aOrd - bOrd;
    return a.displayName.localeCompare(b.displayName);
  });

  let currentOrder = sorted.map((m) => m.displayName);

  function renderRows() {
    const rows = currentOrder.map((name, idx) => {
      const member = members.find((m) => m.displayName === name);
      const row = cloneTemplate("rotation-row-tpl");
      bind(row, "position").textContent = `${idx + 1}.`;
      bind(row, "identity").replaceWith(window.filmCrew.createMemberIdentity({
        name: member.displayName,
        profileColor: member.profileColor,
        profileEmoji: member.profileEmoji
      }));
      const upBtn = bind(row, "upBtn");
      upBtn.setAttribute("aria-label", `Move ${name} up`);
      if (idx === 0) upBtn.disabled = true;
      const downBtn = bind(row, "downBtn");
      downBtn.setAttribute("aria-label", `Move ${name} down`);
      if (idx === currentOrder.length - 1) downBtn.disabled = true;

      upBtn.addEventListener("click", () => {
        [currentOrder[idx - 1], currentOrder[idx]] = [currentOrder[idx], currentOrder[idx - 1]];
        renderRows();
      });
      downBtn.addEventListener("click", () => {
        [currentOrder[idx], currentOrder[idx + 1]] = [currentOrder[idx + 1], currentOrder[idx]];
        renderRows();
      });

      return row;
    });
    rotationList.replaceChildren(...rows);
  }

  renderRows();

  const saveBtn = document.getElementById("save-rotation-btn");
  if (saveBtn) {
    const freshBtn = saveBtn.cloneNode(true);
    saveBtn.replaceWith(freshBtn);
    freshBtn.addEventListener("click", async () => {
      if (rotationMessage) rotationMessage.textContent = "Saving…";
      freshBtn.disabled = true;
      try {
        await window.filmCrew.fetchJson("/api/admin/rotation", {
          method: "PUT",
          body: JSON.stringify({ order: currentOrder })
        });
        if (rotationMessage) rotationMessage.textContent = "Rotation saved.";
        rotationData = await window.filmCrew.fetchJson("/api/rotation").catch(() => null);
        updateCreateScreeningDefaults(rotationData);
        await loadSchedule();
      } catch (err) {
        if (rotationMessage) rotationMessage.textContent = err.message || "Could not save rotation.";
      } finally {
        freshBtn.disabled = false;
      }
    });
  }
}

myPickFilmSearchForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = myPickFilmSearchForm.elements.query.value.trim();
  window.filmCrew.setMutedMessage(myPickFilmSearchResults, "Searching…");
  try {
    const { results } = await window.filmCrew.fetchJson(`/api/admin/film-search?q=${encodeURIComponent(query)}`);
    if (!results.length) {
      window.filmCrew.setMutedMessage(myPickFilmSearchResults, "No results.");
      return;
    }
    const cards = results.map((film) => {
      const card = cloneTemplate("film-search-card-tpl");
      const poster = bind(card, "poster");
      if (film.posterUrl) {
        poster.src = film.posterUrl;
        poster.alt = `${film.title} poster`;
        poster.hidden = false;
      }
      bind(card, "title").textContent = film.title;
      bind(card, "year").textContent = film.year || "Unknown year";
      const btn = bind(card, "select");
      btn.dataset.imdbId = film.imdbId;
      btn.dataset.filmTitle = film.title;
      return card;
    });
    window.filmCrew.replaceChildren(myPickFilmSearchResults, cards);
  } catch (error) {
    window.filmCrew.setMutedMessage(myPickFilmSearchResults, error.message);
  }
});

myPickFilmSearchResults?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-imdb-id]");
  if (!button) return;
  myPickForm.classList.remove("hidden");
  myPickForm.elements.imdbId.value = button.dataset.imdbId;
  if (myPickMessage) myPickMessage.textContent = `${button.dataset.filmTitle} selected.`;
});

myPickForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (myPickMessage) myPickMessage.textContent = "Submitting pick…";
  try {
    const payload = await window.filmCrew.fetchJson("/api/screenings", {
      method: "POST",
      body: JSON.stringify({
        imdbId: myPickForm.elements.imdbId.value,
        guestPickerName: myPickForm.elements.guestPickerName.value.trim() || undefined,
        notes: myPickForm.elements.notes.value.trim() || undefined
      })
    });
    const { screening } = payload;
    myPickForm.reset();
    myPickForm.classList.add("hidden");
    myPickPanel.classList.add("hidden");
    if (myPickMessage) myPickMessage.textContent = `Pick submitted for ${screening.weekKey}.`;
  } catch (error) {
    if (myPickMessage) myPickMessage.textContent = error.message;
  }
});

loadDashboard();

// ─── Schedule ────────────────────────────────────────────────────────────────

const scheduleList = document.querySelector("#schedule-list");
const scheduleMessage = document.querySelector("#schedule-message");

let scheduleData = null; // { slots, rotation, latestDate, latestPickerName }
let suggestedSlot = null;

function suggestNextThursday(fromDateStr) {
  const date = new Date(`${fromDateStr}T00:00:00Z`);
  const day = date.getUTCDay(); // 0=Sun … 6=Sat
  let daysToAdd = (4 - day + 7) % 7 || 7; // days until Thursday; if already Thursday, go +7
  // Mon(1) Tue(2) Wed(3): this week's Thursday is too close — jump an extra week
  if (day >= 1 && day <= 3) daysToAdd += 7;
  return new Date(date.getTime() + daysToAdd * 86400000).toISOString().slice(0, 10);
}

function buildPickerOptions(rotation, selectedName) {
  const options = rotation.map((m) => {
    const opt = document.createElement("option");
    opt.value = m.displayName;
    opt.textContent = m.displayName;
    if (m.displayName === selectedName) opt.selected = true;
    return opt;
  });

  if (!options.some((opt) => opt.selected) && options[0]) {
    options[0].selected = true;
  }

  return options;
}

function computeSuggestedSlot(data, existingSlots) {
  const rotation = data?.rotation ?? [];
  if (!rotation.length) {
    return null;
  }

  let lastDate = data?.latestDate || null;
  let lastPicker = data?.latestPickerName || null;

  for (const slot of existingSlots) {
    if (slot.watchDate && (!lastDate || slot.watchDate > lastDate)) {
      lastDate = slot.watchDate;
      lastPicker = slot.pickerDisplayName || lastPicker;
    }
  }

  if (!lastDate) {
    lastDate = new Date().toISOString().slice(0, 10);
  }

  const nextDate = suggestNextThursday(lastDate);
  const lastIdx = lastPicker ? rotation.findIndex((m) => m.displayName === lastPicker) : -1;
  const nextPicker = rotation[(lastIdx + 1) % rotation.length];

  return {
    weekKey: null,
    watchDate: nextDate,
    pickerDisplayName: nextPicker?.displayName || rotation[0].displayName,
    isSuggested: true
  };
}

function renderScheduleRows(slots, rotation, suggestion) {
  if (!scheduleList) return;
  const allRows = [...slots];
  if (suggestion) {
    allRows.push(suggestion);
  }

  if (!allRows.length) {
    window.filmCrew.setMutedMessage(scheduleList, "No upcoming screenings scheduled.");
    return;
  }

  const rows = allRows.map((slot) => {
    const row = cloneTemplate("schedule-row-tpl");
    if (slot.weekKey) {
      row.dataset.weekKey = slot.weekKey;
    }
    if (slot.isSuggested) {
      row.dataset.suggested = "true";
    }

    const dateInput = row.querySelector(".schedule-date-input");
    dateInput.value = slot.watchDate;

    const filmLink = row.querySelector("[data-bind='filmLink']");
    if (filmLink) {
      filmLink.textContent = slot.filmTitle || "TBC";
      if (slot.weekKey) {
        filmLink.href = `/archive/${slot.weekKey}`;
      } else {
        filmLink.textContent = "Suggested Date";
        filmLink.removeAttribute("href");
      }
      filmLink.hidden = false;
    }

    const pickerSelect = row.querySelector(".schedule-picker-select");
    pickerSelect.replaceChildren(...buildPickerOptions(rotation, slot.pickerDisplayName));

    const actionBtn = row.querySelector("[data-action]");
    if (slot.isSuggested) {
      actionBtn.dataset.action = "add-slot";
      actionBtn.textContent = "Add";
      actionBtn.classList.remove("secondary");
      actionBtn.classList.add("primary", "schedule-add-btn");
    } else {
      const initialDate = slot.watchDate || "";
      const initialPicker = slot.pickerDisplayName || pickerSelect.value || "";

      const updateSaveVisibility = () => {
        const isDirty = dateInput.value !== initialDate || pickerSelect.value !== initialPicker;
        actionBtn.classList.toggle("hidden", !isDirty);
      };

      actionBtn.classList.add("hidden");
      dateInput.addEventListener("input", updateSaveVisibility);
      pickerSelect.addEventListener("change", updateSaveVisibility);
    }

    return row;
  });

  scheduleList.replaceChildren(...rows);
}

async function loadSchedule() {
  if (!scheduleList) return;
  try {
    scheduleData = await window.filmCrew.fetchJson("/api/schedule");
    suggestedSlot = computeSuggestedSlot(scheduleData, scheduleData.slots || []);
    renderScheduleRows(scheduleData.slots || [], scheduleData.rotation || [], suggestedSlot);
  } catch {
    window.filmCrew.setMutedMessage(scheduleList, "Could not load schedule.");
  }
}

scheduleList?.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-action]");
  if (!btn) return;

  const row = btn.closest(".schedule-row");
  if (!row) return;

  const action = btn.dataset.action;
  const rotation = scheduleData?.rotation ?? [];

  if (action === "save-slot" || action === "add-slot") {
    const dateInput = row.querySelector(".schedule-date-input");
    const pickerSelect = row.querySelector(".schedule-picker-select");
    if (!dateInput.reportValidity()) return;

    btn.disabled = true;
    if (scheduleMessage) scheduleMessage.textContent = "Saving…";
    try {
      const { slots } = await window.filmCrew.fetchJson("/api/schedule", {
        method: "PUT",
        body: JSON.stringify({
          weekKey: action === "add-slot" ? null : (row.dataset.weekKey || null),
          watchDate: dateInput.value,
          pickerDisplayName: pickerSelect.value || null
        })
      });
      scheduleData = { ...scheduleData, slots };
      suggestedSlot = computeSuggestedSlot(scheduleData, slots || []);
      renderScheduleRows(slots || [], rotation, suggestedSlot);
      if (scheduleMessage) scheduleMessage.textContent = action === "add-slot" ? "Added." : "Saved.";
    } catch (err) {
      if (scheduleMessage) scheduleMessage.textContent = err.message || (action === "add-slot" ? "Could not add." : "Could not save.");
      btn.disabled = false;
    }
    return;
  }
});