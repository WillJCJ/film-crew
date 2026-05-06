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

let currentMember = null;
let currentScreening = null;

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
  ratingForm.elements.score.value = existing?.score || "";
  ratingForm.elements.review.value = existing?.review || "";
}

async function loadDashboard() {
  try {
    const [{ member }, { screening }] = await Promise.all([
      window.filmCrew.fetchJson("/api/me"),
      window.filmCrew.fetchJson("/api/screenings/current")
    ]);

    currentMember = member;
    currentScreening = screening;
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

    // Check if user is admin by attempting to access admin endpoint
    try {
      await window.filmCrew.fetchJson("/api/members");
      adminPanel.classList.remove("hidden");
      await populateMemberOptions();
      await renderAdminProfileEditors();
    } catch {
      // User is not admin, hide admin panel
    }
  } catch (error) {
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
    const { wrapper: colourPickerWrap, colourInput: colourValueInput } = createColorDotPicker(member.profileColor || "#3E8F3B");
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

  ratingMessage.textContent = "Saving…";
  try {
    const payload = await window.filmCrew.fetchJson(`/api/screenings/${currentScreening.weekKey}/ratings`, {
      method: "POST",
      body: JSON.stringify({
        score: Number(ratingForm.elements.score.value),
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

loadDashboard();