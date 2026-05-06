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
const nextPickContent = document.querySelector("#next-pick-content");
const myPickPanel = document.querySelector("#my-pick-panel");
const myPickFilmSearchForm = document.querySelector("#my-pick-film-search-form");
const myPickFilmSearchResults = document.querySelector("#my-pick-film-search-results");
const myPickForm = document.querySelector("#my-pick-form");
const myPickMessage = document.querySelector("#my-pick-message");
const screeningDayForm = document.querySelector("#screening-day-form");
const screeningDayMessage = document.querySelector("#screening-day-message");
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
    renderNextPickPanel(rotationData);
    hydrateScreeningDayForm(rotationData);

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
        profileEmoji: profileForm.elements.profileEmoji.value
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

function renderNextPickPanel(data) {
  if (!nextPickContent) return;
  if (!data?.rotation?.length) {
    window.filmCrew.setMutedMessage(nextPickContent, "Rotation not set up yet.");
    return;
  }

  const { nextPicker, nextScreeningDate } = data;
  if (!nextPicker) {
    window.filmCrew.setMutedMessage(nextPickContent, "Could not determine next picker.");
    return;
  }

  const formattedDate = new Date(nextScreeningDate + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC"
  });

  const identity = window.filmCrew.createMemberIdentity({
    name: nextPicker.displayName,
    profileColor: nextPicker.profileColor,
    profileEmoji: nextPicker.profileEmoji
  });

  const pickerLine = window.filmCrew.createEl("p");
  pickerLine.replaceChildren(identity, document.createTextNode(" picks next."));
  const dateLine = window.filmCrew.createEl("p", { className: "muted", text: `Scheduled for ${formattedDate}.` });
  nextPickContent.replaceChildren(pickerLine, dateLine);
}

function hydrateScreeningDayForm(data) {
  if (!screeningDayForm) return;
  screeningDayForm.elements.day.value = String(data?.screeningDayOfWeek ?? 4);
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
        renderNextPickPanel(rotationData);
        updateCreateScreeningDefaults(rotationData);
      } catch (err) {
        if (rotationMessage) rotationMessage.textContent = err.message || "Could not save rotation.";
      } finally {
        freshBtn.disabled = false;
      }
    });
  }
}

screeningDayForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const day = Number(screeningDayForm.elements.day.value);
  if (screeningDayMessage) screeningDayMessage.textContent = "Saving…";
  try {
    await window.filmCrew.fetchJson("/api/settings/screening-day", {
      method: "PUT",
      body: JSON.stringify({ day })
    });
    rotationData = await window.filmCrew.fetchJson("/api/rotation").catch(() => null);
    renderNextPickPanel(rotationData);
    updateCreateScreeningDefaults(rotationData);
    if (screeningDayMessage) screeningDayMessage.textContent = "Saved.";
  } catch (err) {
    if (screeningDayMessage) screeningDayMessage.textContent = err.message || "Could not save.";
  }
});

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