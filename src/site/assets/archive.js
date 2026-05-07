const archiveList = document.querySelector("#archive-list");
const upcomingList = document.querySelector("#upcoming-list");

function cloneTemplate(id) {
  return document.getElementById(id).content.cloneNode(true).firstElementChild;
}

function bind(root, name) {
  return root.querySelector(`[data-bind="${name}"]`);
}

function buildRow(screening) {
  const row = cloneTemplate("archive-row-tpl");
  const hasFilm = Boolean(screening.film?.title);
  bind(row, "title").textContent = hasFilm ? screening.film.title : "TBC";
  bind(row, "year").textContent = screening.film.year ? `(${screening.film.year})` : "";
  bind(row, "chooser").textContent = screening.chooser?.name || "";
  bind(row, "date").textContent = screening.watchDate || "";
  const scoreEl = bind(row, "score");
  scoreEl.textContent = hasFilm ? window.filmCrew.formatAverage(screening.averageScore) : "";
  if (hasFilm) window.filmCrew.applyScoreBandClass(scoreEl, screening.averageScore);
  const posterEl = bind(row, "poster");
  if (screening.film.posterUrl) {
    posterEl.src = screening.film.posterUrl;
    posterEl.alt = `${screening.film.title} poster`;
    posterEl.hidden = false;
  }
  bind(row, "plot").textContent = screening.film.plot || "";
  bind(row, "detailLink").href = `/archive/${screening.weekKey}`;
  return row;
}

function emptyItem(message) {
  return Object.assign(document.createElement("li"), {
    innerHTML: `<p class="muted">${message}</p>`
  });
}

async function loadArchive() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { screenings } = await window.filmCrew.fetchJson("/api/screenings");

    const upcoming = screenings.filter((s) => s.watchDate >= today);
    const previous = screenings.filter((s) => !s.watchDate || s.watchDate && s.watchDate < today);

    if (upcomingList) {
      upcomingList.replaceChildren(
        ...(upcoming.length
          ? upcoming.map(buildRow)
          : [emptyItem("No upcoming screenings.")])
      );
    }

    if (archiveList) {
      archiveList.replaceChildren(
        ...(previous.length
          ? previous.map(buildRow)
          : [emptyItem("No previous screenings.")])
      );
    }
  } catch (error) {
    const errItem = emptyItem(error.message);
    upcomingList?.replaceChildren(errItem.cloneNode(true));
    archiveList?.replaceChildren(errItem);
  }
}

loadArchive();