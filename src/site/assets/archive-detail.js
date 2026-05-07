const contentTarget = document.querySelector("#archive-detail-content");
const refreshButton = document.querySelector("#refresh-omdb");
const deleteButton = document.querySelector("#delete-screening");
const detailRatingForm = document.querySelector("#detail-rating-form");
const detailRatingMessage = document.querySelector("#detail-rating-message");
let currentScreening = null;
let currentMemberName = null;
let currentMemberIsAdmin = false;

function cloneTemplate(id) {
  return document.getElementById(id).content.cloneNode(true).firstElementChild;
}

function bind(root, name) {
  return root.querySelector(`[data-bind="${name}"]`);
}

function renderFilmMeta(screening) {
  const rows = [];
  const film = screening.film || {};

  const pushRow = (label, valueNode) => {
    const row = cloneTemplate("film-meta-row-tpl");
    bind(row, "label").textContent = label;
    if (typeof valueNode === "string") {
      bind(row, "value").textContent = valueNode;
    } else {
      bind(row, "value").replaceChildren(valueNode);
    }
    rows.push(row);
  };

  {
    const display = window.filmCrew.createEl("div", { className: "imdb-inline-display" });
    display.dataset.role = "imdb-inline";
    if (film.imdbId) {
      const link = window.filmCrew.createEl("a", {
        text: film.imdbId,
        attrs: {
          href: `https://www.imdb.com/title/${film.imdbId}/`,
          target: "_blank",
          rel: "noopener noreferrer",
          "data-role": "imdb-link"
        }
      });
      display.appendChild(link);
    } else {
      display.appendChild(window.filmCrew.createEl("span", {
        className: "muted",
        text: "Not set",
        attrs: { "data-role": "imdb-link" }
      }));
    }

    const inlineInput = window.filmCrew.createEl("input", {
      className: "hidden",
      attrs: {
        type: "text",
        name: "imdbId",
        placeholder: "tt1234567",
        value: film.imdbId || "",
        "data-role": "imdb-input"
      }
    });
    display.appendChild(inlineInput);

    const editBtn = window.filmCrew.createEl("button", {
      className: "button secondary compact authed-only",
      text: "Edit",
      attrs: {
        type: "button",
        "data-action": "toggle-imdb-edit",
        "data-mode": "edit",
        "aria-label": "Edit IMDb ID"
      }
    });
    display.appendChild(editBtn);

    const message = window.filmCrew.createEl("p", {
      className: "form-message",
      attrs: { "data-role": "imdb-inline-message" }
    });
    const holder = window.filmCrew.createEl("div", { className: "imdb-inline-holder" });
    holder.replaceChildren(display, message);
    pushRow("IMDb ID", holder);
  }

  const pushText = (label, value) => {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      pushRow(label, String(value));
    }
  };

  pushText("Runtime", film.runtime);
  pushText("Director", film.director);
  pushText("Genre", film.genre);
  pushText("IMDb rating", film.imdbRating);
  pushText("IMDb votes", film.imdbVotes);

  if (screening.watchDate) {
    pushText("Watch date", screening.watchDate);
  }

  return rows;
}

function renderRatings(ratings) {
  if (!ratings?.length) {
    return [window.filmCrew.createEl("p", { className: "muted", text: "No ratings submitted yet." })];
  }

  return ratings.map((rating) => {
    const item = cloneTemplate("rating-item-tpl");
    const summaryEl = bind(item, "summary");
    const label = rating.score === null || rating.score === undefined ? (rating.reaction || "No score") : `${rating.score}`;
    const identity = window.filmCrew.createMemberIdentity({
      name: rating.memberName,
      profileColor: rating.memberColor,
      profileEmoji: rating.memberEmoji
    });
    summaryEl.replaceChildren(identity, document.createTextNode(` · ${label}`));
    window.filmCrew.applyScoreBandClass(summaryEl, rating.score);

    const reviewEl = bind(item, "review");
    if (rating.review) {
      reviewEl.textContent = rating.review;
      reviewEl.hidden = false;
    } else {
      reviewEl.textContent = "";
      reviewEl.hidden = true;
    }

    if (currentMemberName && rating.memberName === currentMemberName) {
      const actionsEl = bind(item, "actions");
      if (actionsEl) {
        actionsEl.classList.remove("hidden");
      }
    }

    return item;
  });
}

function getWeekKeyFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts.length >= 2 ? parts[1] : "";
}

function mountFilmPicker() {
  const panelEl = cloneTemplate("film-picker-panel-tpl");
  const anchor = document.querySelector("section.panel");
  if (!anchor) return;
  anchor.after(panelEl);

  // Query from live DOM now that the panel is inserted.
  const searchForm = document.getElementById("detail-film-search-form");
  const searchResults = document.getElementById("detail-film-search-results");
  const imdbForm = document.getElementById("detail-film-imdb-form");
  const imdbMessage = document.getElementById("detail-film-imdb-message");

  searchForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = searchForm.elements.query.value.trim();
    if (!query) return;
    window.filmCrew.setMutedMessage(searchResults, "Searching…");
    try {
      const { results } = await window.filmCrew.fetchJson(`/api/films/search?q=${encodeURIComponent(query)}`);
      if (!results.length) {
        window.filmCrew.setMutedMessage(searchResults, "No results found.");
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
        bind(card, "year").textContent = film.year || "";
        const btn = bind(card, "select");
        btn.dataset.imdbId = film.imdbId;
        return card;
      });
      window.filmCrew.replaceChildren(searchResults, cards);
    } catch (error) {
      window.filmCrew.setMutedMessage(searchResults, error.message);
    }
  });

  searchResults?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-imdb-id]");
    if (!button || !currentScreening) return;
    button.disabled = true;
    try {
      await setFilmByImdbId(button.dataset.imdbId, imdbMessage);
    } finally {
      button.disabled = false;
    }
  });

  imdbForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const imdbId = imdbForm.elements.imdbId.value.trim();
    if (!imdbId) return;
    await setFilmByImdbId(imdbId, imdbMessage);
  });
}

async function setFilmByImdbId(imdbId, messageEl) {
  if (!currentScreening) return;
  if (messageEl) messageEl.textContent = "Saving…";
  try {
    await window.filmCrew.fetchJson(`/api/admin/screenings/${currentScreening.weekKey}/film`, {
      method: "PATCH",
      body: JSON.stringify({ imdbId })
    });
    await loadArchiveDetail();
  } catch (error) {
    if (messageEl) messageEl.textContent = error.message || "Could not set film.";
  }
}

async function loadArchiveDetail() {
  // Remove any previously mounted film picker (e.g. after a film is set).
  document.querySelector(".film-picker-panel")?.remove();
  const weekKey = getWeekKeyFromPath();
  if (!weekKey) {
    window.filmCrew.setMutedMessage(contentTarget, "Missing week key.");
    return;
  }

  try {
    const { screening } = await window.filmCrew.fetchJson(`/api/screenings/${weekKey}`);
    currentScreening = screening;
    currentMemberName = null;
    currentMemberIsAdmin = false;
    try {
      const { member } = await window.filmCrew.fetchJson("/api/me");
      currentMemberName = member.displayName;
      currentMemberIsAdmin = Boolean(member.isAdmin);
    } catch {
      // Not authenticated.
    }

    const hasFilm = Boolean(screening.film?.title);
    const canPickFilm = Boolean(currentMemberName) &&
      (currentMemberIsAdmin || screening.chooser?.name === currentMemberName);

    const card = cloneTemplate("archive-detail-tpl");
    bind(card, "weekKey").textContent = screening.weekKey;
    const titleEl = bind(card, "title");
    titleEl.textContent = hasFilm ? screening.film.title : "TBC";
    const selectFilmLink = bind(card, "selectFilmLink");
    if (selectFilmLink) {
      selectFilmLink.hidden = hasFilm || !canPickFilm;
    }
    bind(card, "yearGroup").textContent = hasFilm ? `(${screening.film.year || "Unknown year"})` : "";
    window.filmCrew.renderChooserLine(bind(card, "chooserLine"), screening);

    const posterEl = bind(card, "poster");
    if (screening.film.posterUrl) {
      posterEl.src = screening.film.posterUrl;
      posterEl.alt = `${screening.film.title} poster`;
      posterEl.hidden = false;
    }

    const metaEl = bind(card, "filmMeta");
    if (hasFilm) {
      const metaRows = renderFilmMeta(screening);
      if (metaRows.length) {
        metaEl.replaceChildren(...metaRows);
        metaEl.hidden = false;
      } else {
        metaEl.replaceChildren();
        metaEl.hidden = true;
      }
    } else {
      metaEl.replaceChildren();
      metaEl.hidden = true;
    }

    const notesEl = bind(card, "notes");
    if (screening.notes) {
      notesEl.textContent = `Notes: ${screening.notes}`;
      notesEl.hidden = false;
    } else {
      notesEl.textContent = "";
      notesEl.hidden = true;
    }

    bind(card, "plot").textContent = hasFilm ? (screening.film.plot || "No plot stored yet.") : "";

    const scoreEl = bind(card, "score");
    scoreEl.textContent = hasFilm ? window.filmCrew.formatAverage(screening.averageScore) : "";
    if (hasFilm) window.filmCrew.applyScoreBandClass(scoreEl, screening.averageScore);
    bind(card, "ratingCount").textContent = hasFilm ? ` · ${screening.ratingCount} ratings` : "";

    bind(card, "ratings").replaceChildren(...(hasFilm ? renderRatings(screening.ratings) : []));
    window.filmCrew.replaceChildren(contentTarget, [card]);

    if (detailRatingForm) {
      if (!hasFilm) {
        detailRatingForm.hidden = true;
      } else {
        detailRatingForm.hidden = false;
        detailRatingForm.elements.score.value = "";
        detailRatingForm.elements.review.value = "";
        if (currentMemberName) {
          const existing = screening.ratings.find((rating) => rating.memberName === currentMemberName);
          detailRatingForm.elements.score.value = existing?.score ?? "";
          detailRatingForm.elements.review.value = existing?.review || "";
        }
      }
    }

    if (refreshButton) {
      refreshButton.hidden = !hasFilm;
    }

    if (deleteButton) {
      deleteButton.hidden = !currentMemberIsAdmin;
    }

    if (!hasFilm && canPickFilm) {
      mountFilmPicker();
    }
  } catch (error) {
    window.filmCrew.setMutedMessage(contentTarget, error.message || "Could not load screening detail.");
  }
}

deleteButton?.addEventListener("click", async () => {
  if (!currentScreening) return;
  const confirmed = window.confirm(
    `Delete the screening for ${currentScreening.weekKey}? The film record and all ratings will be kept.`
  );
  if (!confirmed) return;
  deleteButton.disabled = true;
  try {
    await window.filmCrew.fetchJson(`/api/admin/screenings/${currentScreening.weekKey}`, {
      method: "DELETE"
    });
    window.location.href = "/archive/";
  } catch (error) {
    window.filmCrew.setMutedMessage(contentTarget, error.message || "Could not delete screening.");
    deleteButton.disabled = false;
  }
});

refreshButton?.addEventListener("click", async () => {
  if (!currentScreening?.film?.imdbId) {
    window.filmCrew.setMutedMessage(contentTarget, "This film has no IMDb ID to refresh.");
    return;
  }

  const previousLabel = refreshButton.textContent;
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing…";

  try {
    await window.filmCrew.fetchJson(`/api/films/${currentScreening.film.imdbId}/refresh`, {
      method: "POST"
    });
    await loadArchiveDetail();
  } catch (error) {
    window.filmCrew.setMutedMessage(contentTarget, error.message || "Could not refresh from OMDb.");
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = previousLabel;
  }
});

contentTarget?.addEventListener("click", async (event) => {
  const promptRemoveButton = event.target.closest('button[data-action="prompt-remove-rating"]');
  if (promptRemoveButton) {
    const actionsEl = promptRemoveButton.closest('[data-bind="actions"]') || promptRemoveButton.parentElement;
    const confirmButton = actionsEl?.querySelector('button[data-action="confirm-remove-rating"]');
    if (confirmButton) {
      confirmButton.classList.remove("hidden");
      confirmButton.focus();
    }
    return;
  }

  const confirmRemoveButton = event.target.closest('button[data-action="confirm-remove-rating"]');
  if (confirmRemoveButton) {
    if (!currentScreening) {
      return;
    }

    detailRatingMessage.textContent = "Removing…";
    confirmRemoveButton.disabled = true;
    try {
      await window.filmCrew.fetchJson(`/api/screenings/${currentScreening.weekKey}/ratings`, {
        method: "DELETE"
      });
      await loadArchiveDetail();
      detailRatingMessage.textContent = "Rating removed.";
    } catch (error) {
      detailRatingMessage.textContent = error.message;
      confirmRemoveButton.disabled = false;
    }
    return;
  }

  const editButton = event.target.closest('button[data-action="toggle-imdb-edit"]');
  if (editButton) {
    const valueCell = editButton.closest("dd");
    const inlineRoot = valueCell?.querySelector('[data-role="imdb-inline"]');
    const inlineInput = inlineRoot?.querySelector('[data-role="imdb-input"]');
    const inlineLink = inlineRoot?.querySelector('[data-role="imdb-link"]');
    const message = valueCell?.querySelector('[data-role="imdb-inline-message"]');
    const mode = editButton.dataset.mode || "edit";

    if (!inlineRoot || !inlineInput || !inlineLink) {
      return;
    }

    if (mode === "edit") {
      inlineLink.classList.add("hidden");
      inlineInput.classList.remove("hidden");
      editButton.textContent = "Save";
      editButton.dataset.mode = "save";
      inlineInput.focus();
      inlineInput.select();
      return;
    }

    const imdbId = inlineInput.value.trim();
    if (!/^tt\d+$/i.test(imdbId)) {
      if (message) {
        message.textContent = "IMDb ID must look like tt1234567.";
      }
      return;
    }

    if (!currentScreening) {
      return;
    }

    editButton.disabled = true;
    if (message) {
      message.textContent = "Saving…";
    }

    window.filmCrew.fetchJson(`/api/admin/screenings/${currentScreening.weekKey}/film`, {
      method: "PATCH",
      body: JSON.stringify({ imdbId })
    }).then(async () => {
      await loadArchiveDetail();
    }).catch((err) => {
      if (message) {
        message.textContent = err.message || "Could not update IMDb ID.";
      }
      editButton.disabled = false;
    });
  }
});

contentTarget?.addEventListener("keydown", (event) => {
  const inlineInput = event.target.closest('[data-role="imdb-input"]');
  if (!inlineInput) {
    return;
  }
  if (event.key === "Escape") {
    const inlineRoot = inlineInput.closest('[data-role="imdb-inline"]');
    const editButton = inlineRoot?.querySelector('button[data-action="toggle-imdb-edit"]');
    const inlineLink = inlineRoot?.querySelector('[data-role="imdb-link"]');
    const message = inlineRoot?.closest("dd")?.querySelector('[data-role="imdb-inline-message"]');
    if (inlineLink && editButton) {
      inlineInput.classList.add("hidden");
      inlineLink.classList.remove("hidden");
      editButton.textContent = "Edit";
      editButton.dataset.mode = "edit";
      if (currentScreening?.film?.imdbId) {
        inlineInput.value = currentScreening.film.imdbId;
      }
      if (message) {
        message.textContent = "";
      }
    }
  }
});

detailRatingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentScreening) {
    return;
  }

  const rawValue = detailRatingForm.elements.score.value.trim();
  const numericValue = Number(rawValue);
  if (!rawValue || isNaN(numericValue) || numericValue < 1) {
    detailRatingMessage.textContent = "Enter a score of 1 or above (decimals allowed).";
    return;
  }

  detailRatingMessage.textContent = "Saving…";
  try {
    await window.filmCrew.fetchJson(`/api/screenings/${currentScreening.weekKey}/ratings`, {
      method: "POST",
      body: JSON.stringify({
        score: numericValue,
        review: detailRatingForm.elements.review.value
      })
    });
    await loadArchiveDetail();
    detailRatingMessage.textContent = "Rating saved.";
  } catch (error) {
    detailRatingMessage.textContent = error.message;
  }
});

loadArchiveDetail();
