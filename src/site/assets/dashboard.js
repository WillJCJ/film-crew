const dashboardUser = document.querySelector("#dashboard-user");
const currentScreeningTarget = document.querySelector("#dashboard-current-screening");
const ratingForm = document.querySelector("#rating-form");
const ratingMessage = document.querySelector("#rating-message");
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

let currentMember = null;
let currentScreening = null;
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
  const wrapper = window.filmCrew.createEl("div", { className: "color-picker-dot-wrap" });
  const dotButton = window.filmCrew.createEl("button", {
    className: "color-dot",
    attrs: {
      type: "button",
      "aria-label": "Choose profile colour"
    }
  });
  const colourInput = window.filmCrew.createEl("input", {
    className: "native-color-input",
    attrs: {
      type: "color",
      name: "profileColor",
      value: initialColor.toUpperCase(),
      required: "required"
    }
  });

  initColourPicker(dotButton, colourInput, initialColor);
  wrapper.replaceChildren(dotButton, colourInput);
  return { wrapper, dotButton, colourInput };
}

function renderRatings(ratings) {
  if (!ratings?.length) {
    return [window.filmCrew.createEl("p", { className: "muted", text: "No ratings submitted yet." })];
  }

  return ratings.map((rating) => {
    const item = cloneTemplate("rating-item-tpl");
    const summaryEl = bind(item, "summary");
    const ratingLabel = rating.score === null || rating.score === undefined ? (rating.reaction || "No score") : `${rating.score}`;
    const identity = window.filmCrew.createMemberIdentity({
      name: rating.memberName,
      profileColor: rating.memberColor,
      profileEmoji: rating.memberEmoji
    });
    summaryEl.replaceChildren(identity, document.createTextNode(` · ${ratingLabel}`));
    window.filmCrew.applyScoreBandClass(summaryEl, rating.score);

    const reviewEl = bind(item, "review");
    if (rating.review) {
      reviewEl.textContent = rating.review;
      reviewEl.hidden = false;
    } else {
      reviewEl.textContent = "";
      reviewEl.hidden = true;
    }

    return item;
  });
}

function renderCurrentScreening(screening) {
  if (!screening) {
    window.filmCrew.setMutedMessage(currentScreeningTarget, "No screenings yet. Add one below if you are the admin.");
    ratingForm.classList.add("hidden");
    return;
  }

  const card = cloneTemplate("current-screening-tpl");
  bind(card, "weekKey").textContent = screening.weekKey;
  bind(card, "title").textContent = screening.film.title;
  window.filmCrew.renderChooserLine(bind(card, "chooserLine"), screening);
  bind(card, "plot").textContent = screening.film.plot || "No plot stored yet.";
  const scoreEl = bind(card, "score");
  scoreEl.textContent = window.filmCrew.formatAverage(screening.averageScore);
  window.filmCrew.applyScoreBandClass(scoreEl, screening.averageScore);
  bind(card, "ratingCount").textContent = ` · ${screening.ratingCount} ratings`;
  bind(card, "ratings").replaceChildren(...renderRatings(screening.ratings));

  currentScreeningTarget.replaceChildren(card);
  ratingForm.classList.remove("hidden");
  const existing = screening.ratings.find((rating) => rating.memberName === currentMember.displayName);
  ratingForm.elements.score.value = existing?.score ?? "";
  ratingForm.elements.review.value = existing?.review || "";
}

async function loadDashboard() {
  try {
    const [{ member }, { screening }, fetchedRotation] = await Promise.all([
      window.filmCrew.fetchJson("/api/me"),
      window.filmCrew.fetchJson("/api/screenings/current"),
      window.filmCrew.fetchJson("/api/rotation").catch(() => null)
    ]);

    currentMember = member;
    currentScreening = screening;
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
    renderCurrentScreening(screening);
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
    window.filmCrew.replaceChildren(currentScreeningTarget, []);
    ratingForm.classList.add("hidden");
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
    const form = window.filmCrew.createEl("form", { className: "member-profile-row" });
    form.dataset.displayName = member.displayName;

    const title = window.filmCrew.createEl("p", { className: "member-profile-title" });
    title.replaceChildren(window.filmCrew.createMemberIdentity({
      name: member.displayName,
      profileColor: member.profileColor,
      profileEmoji: member.profileEmoji
    }));

    const controls = window.filmCrew.createEl("div", { className: "member-profile-controls" });
    const emojiInput = window.filmCrew.createEl("input", {
      attrs: {
        name: "profileEmoji",
        value: member.profileEmoji || "🎬",
        required: "required"
      }
    });
    const { wrapper: colourPickerWrap } = createColorDotPicker(member.profileColor || "#3E8F3B");
    validateEmojiInput(emojiInput);
    emojiInput.addEventListener("input", () => validateEmojiInput(emojiInput));

    const saveButton = window.filmCrew.createEl("button", {
      className: "button secondary",
      text: "Save",
      attrs: { type: "submit" }
    });

    controls.replaceChildren(emojiInput, colourPickerWrap, saveButton);
    form.replaceChildren(title, controls);
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

    currentMember = member;
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

ratingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentScreening) {
    return;
  }

  const rawValue = ratingForm.elements.score.value.trim();
  const numericValue = Number(rawValue);
  if (!rawValue || isNaN(numericValue) || numericValue < 1) {
    ratingMessage.textContent = "Enter a score of 1 or above (decimals allowed).";
    return;
  }

  ratingMessage.textContent = "Saving…";
  try {
    const payload = await window.filmCrew.fetchJson(`/api/screenings/${currentScreening.weekKey}/ratings`, {
      method: "POST",
      body: JSON.stringify({
        score: numericValue,
        review: ratingForm.elements.review.value
      })
    });
    currentScreening = payload.screening;
    renderCurrentScreening(currentScreening);
    ratingMessage.textContent = "Rating saved.";
  } catch (error) {
    ratingMessage.textContent = error.message;
  }
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
    currentScreening = payload.screening;
    renderCurrentScreening(currentScreening);
    createScreeningForm.reset();
    createScreeningForm.classList.add("hidden");
    createScreeningMessage.textContent = "Screening created.";
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
      const row = window.filmCrew.createEl("div", { className: "rotation-row" });
      const position = window.filmCrew.createEl("span", { className: "rotation-position muted", text: `${idx + 1}.` });
      const identity = window.filmCrew.createMemberIdentity({
        name: member.displayName,
        profileColor: member.profileColor,
        profileEmoji: member.profileEmoji
      });
      const upBtn = window.filmCrew.createEl("button", {
        className: "button secondary compact",
        text: "↑",
        attrs: { type: "button", "aria-label": `Move ${name} up` }
      });
      if (idx === 0) upBtn.disabled = true;
      const downBtn = window.filmCrew.createEl("button", {
        className: "button secondary compact",
        text: "↓",
        attrs: { type: "button", "aria-label": `Move ${name} down` }
      });
      if (idx === currentOrder.length - 1) downBtn.disabled = true;

      upBtn.addEventListener("click", () => {
        [currentOrder[idx - 1], currentOrder[idx]] = [currentOrder[idx], currentOrder[idx - 1]];
        renderRows();
      });
      downBtn.addEventListener("click", () => {
        [currentOrder[idx], currentOrder[idx + 1]] = [currentOrder[idx + 1], currentOrder[idx]];
        renderRows();
      });

      row.replaceChildren(position, identity, upBtn, downBtn);
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
    currentScreening = payload.screening;
    renderCurrentScreening(currentScreening);
    myPickForm.reset();
    myPickForm.classList.add("hidden");
    myPickPanel.classList.add("hidden");
    if (myPickMessage) myPickMessage.textContent = "Pick submitted.";
  } catch (error) {
    if (myPickMessage) myPickMessage.textContent = error.message;
  }
});

loadDashboard();