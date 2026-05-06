const extremesGrid = document.querySelector("#extremes-grid");
const memberAveragesEl = document.querySelector("#member-averages");
const memberFavoritesEl = document.querySelector("#member-favorites");

function cloneTemplate(id) {
  return document.getElementById(id).content.cloneNode(true).firstElementChild;
}

function bind(root, name) {
  return root.querySelector(`[data-bind="${name}"]`);
}

function renderFilmStatCard(label, film) {
  if (!film) {
    return window.filmCrew.createEl("p", { className: "muted", text: "Not enough data yet." });
  }

  const card = cloneTemplate("film-stat-card-tpl");
  bind(card, "label").textContent = label;

  const link = bind(card, "titleLink");
  link.textContent = film.title;
  link.href = `/archive/${film.weekKey}`;

  bind(card, "yearGroup").textContent = `(${film.year || "Unknown year"})`;

  const scoreEl = bind(card, "score");
  scoreEl.textContent = film.averageScore !== null ? `${film.averageScore} avg` : "No score";
  window.filmCrew.applyScoreBandClass(scoreEl, film.averageScore);

  return card;
}

function renderMemberAverages(memberAverages) {
  if (!memberAverages?.length) {
    return [window.filmCrew.createEl("p", { className: "muted", text: "No ratings yet." })];
  }

  return memberAverages.map((m) => {
    const row = cloneTemplate("member-average-tpl");

    const identity = window.filmCrew.createMemberIdentity({
      name: m.displayName,
      profileColor: m.profileColor,
      profileEmoji: m.profileEmoji
    });
    bind(row, "identity").replaceChildren(identity);

    const avgEl = bind(row, "average");
    avgEl.textContent = m.averageScore !== null ? String(m.averageScore) : "—";
    window.filmCrew.applyScoreBandClass(avgEl, m.averageScore);

    bind(row, "count").textContent = `${m.ratingCount} ratings`;

    return row;
  });
}

function renderMemberFavorites(memberFavorites) {
  if (!memberFavorites?.length) {
    return [window.filmCrew.createEl("p", { className: "muted", text: "No ratings yet." })];
  }

  return memberFavorites.map((m) => {
    const row = cloneTemplate("member-favorite-tpl");

    const identity = window.filmCrew.createMemberIdentity({
      name: m.displayName,
      profileColor: m.profileColor,
      profileEmoji: m.profileEmoji
    });
    bind(row, "identity").replaceChildren(identity);

    const link = bind(row, "filmLink");
    link.textContent = `${m.title}${m.year ? ` (${m.year})` : ""}`;
    link.href = `/archive/${m.weekKey}`;

    const scoreEl = bind(row, "score");
    scoreEl.textContent = m.score !== null ? String(m.score) : "—";
    window.filmCrew.applyScoreBandClass(scoreEl, m.score);

    return row;
  });
}

async function loadStats() {
  try {
    const { highestRated, lowestRated, memberAverages, memberFavorites } = await window.filmCrew.fetchJson("/api/stats");

    window.filmCrew.replaceChildren(extremesGrid, [
      renderFilmStatCard("Highest rated", highestRated),
      renderFilmStatCard("Lowest rated", lowestRated)
    ]);

    window.filmCrew.replaceChildren(memberAveragesEl, renderMemberAverages(memberAverages));
    window.filmCrew.replaceChildren(memberFavoritesEl, renderMemberFavorites(memberFavorites));
  } catch (error) {
    window.filmCrew.setMutedMessage(extremesGrid, error.message || "Could not load stats.");
  }
}

loadStats();
