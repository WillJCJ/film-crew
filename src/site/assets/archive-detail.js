const contentTarget = document.querySelector("#archive-detail-content");
const titleTarget = document.querySelector("#detail-title");
const refreshButton = document.querySelector("#refresh-omdb");
const editImdbForm = document.querySelector("#edit-imdb-form");
const editImdbInput = document.querySelector("#edit-imdb-id");
const editImdbMessage = document.querySelector("#edit-imdb-message");
let currentScreening = null;

function cloneTemplate(id) {
  return document.getElementById(id).content.cloneNode(true).firstElementChild;
}

function bind(root, name) {
  return root.querySelector(`[data-bind="${name}"]`);
}

function makeMetaRow(label, valueNode) {
  const fragment = document.createDocumentFragment();
  fragment.append(
    window.filmCrew.createEl("dt", { text: label }),
    valueNode
  );
  return fragment;
}

function renderFilmMeta(screening) {
  const rows = [];
  const film = screening.film || {};

  const pushText = (label, value) => {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      rows.push(makeMetaRow(label, window.filmCrew.createEl("dd", { text: String(value) })));
    }
  };

  if (film.imdbId) {
    const link = window.filmCrew.createEl("a", {
      text: film.imdbId,
      attrs: { href: `https://www.imdb.com/title/${film.imdbId}/`, target: "_blank", rel: "noopener noreferrer" }
    });
    const dd = window.filmCrew.createEl("dd");
    dd.appendChild(link);
    rows.push(makeMetaRow("IMDb ID", dd));
  }

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
    const item = window.filmCrew.createEl("article", { className: "rating-item" });
    const summary = window.filmCrew.createEl("strong");
    const label = rating.score === null || rating.score === undefined ? (rating.reaction || "No score") : `${rating.score}`;
    const identity = window.filmCrew.createMemberIdentity({
      name: rating.memberName,
      profileColor: rating.memberColor,
      profileEmoji: rating.memberEmoji
    });

    summary.replaceChildren(identity, document.createTextNode(` · ${label}`));
    window.filmCrew.applyScoreBandClass(summary, rating.score);
    item.appendChild(summary);

    if (rating.review) {
      item.appendChild(window.filmCrew.createEl("p", { text: rating.review }));
    }

    return item;
  });
}

function getWeekKeyFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts.length >= 2 ? parts[1] : "";
}

async function loadArchiveDetail() {
  const weekKey = getWeekKeyFromPath();
  if (!weekKey) {
    window.filmCrew.setMutedMessage(contentTarget, "Missing week key.");
    return;
  }

  try {
    const { screening } = await window.filmCrew.fetchJson(`/api/screenings/${weekKey}`);
    currentScreening = screening;
    titleTarget.textContent = `${screening.weekKey} detail`;

    const card = cloneTemplate("archive-detail-tpl");
    bind(card, "weekKey").textContent = screening.weekKey;
    bind(card, "title").textContent = screening.film.title;
    bind(card, "yearGroup").textContent = `(${screening.film.year || "Unknown year"})`;
    window.filmCrew.renderChooserLine(bind(card, "chooserLine"), screening);

    const posterEl = bind(card, "poster");
    if (screening.film.posterUrl) {
      posterEl.src = screening.film.posterUrl;
      posterEl.alt = `${screening.film.title} poster`;
      posterEl.hidden = false;
    }

    const metaEl = bind(card, "filmMeta");
    const metaRows = renderFilmMeta(screening);
    if (metaRows.length) {
      metaEl.replaceChildren(...metaRows);
      metaEl.hidden = false;
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

    bind(card, "plot").textContent = screening.film.plot || "No plot stored yet.";

    const scoreEl = bind(card, "score");
    scoreEl.textContent = window.filmCrew.formatAverage(screening.averageScore);
    window.filmCrew.applyScoreBandClass(scoreEl, screening.averageScore);
    bind(card, "ratingCount").textContent = ` · ${screening.ratingCount} ratings`;

    bind(card, "ratings").replaceChildren(...renderRatings(screening.ratings));
    window.filmCrew.replaceChildren(contentTarget, [card]);

    // Show editing controls for any authenticated user
    try {
      const { member } = await window.filmCrew.fetchJson("/api/me");
      if (member) {
        refreshButton.hidden = false;
        if (editImdbForm) {
          editImdbInput.value = screening.film.imdbId || "";
          editImdbForm.hidden = false;
        }
      }
    } catch {
      // Not authenticated — controls stay hidden
    }
  } catch (error) {
    window.filmCrew.setMutedMessage(contentTarget, error.message || "Could not load screening detail.");
  }
}

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

editImdbForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentScreening) return;

  const imdbId = editImdbInput.value.trim();
  editImdbMessage.textContent = "Saving…";

  try {
    await window.filmCrew.fetchJson(`/api/admin/screenings/${currentScreening.weekKey}/film`, {
      method: "PATCH",
      body: JSON.stringify({ imdbId })
    });
    editImdbMessage.textContent = "Saved. Reloading…";
    await loadArchiveDetail();
    editImdbMessage.textContent = "";
  } catch (err) {
    editImdbMessage.textContent = err.message || "Could not update IMDb ID.";
  }
});

loadArchiveDetail();
