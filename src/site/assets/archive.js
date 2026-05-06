const archiveList = document.querySelector("#archive-list");

function cloneTemplate(id) {
  return document.getElementById(id).content.cloneNode(true).firstElementChild;
}

function bind(root, name) {
  return root.querySelector(`[data-bind="${name}"]`);
}

async function loadArchive() {
  try {
    const { screenings } = await window.filmCrew.fetchJson("/api/screenings");
    if (screenings.length) {
      const rows = screenings.map((screening) => {
        const row = cloneTemplate("archive-row-tpl");
        bind(row, "title").textContent = screening.film.title;
        bind(row, "year").textContent = screening.film.year ? `(${screening.film.year})` : "";
        bind(row, "chooser").textContent = screening.chooser?.name || "";
        bind(row, "date").textContent = screening.watchDate || "";
        const scoreEl = bind(row, "score");
        scoreEl.textContent = window.filmCrew.formatAverage(screening.averageScore);
        window.filmCrew.applyScoreBandClass(scoreEl, screening.averageScore);
        const posterEl = bind(row, "poster");
        if (screening.film.posterUrl) {
          posterEl.src = screening.film.posterUrl;
          posterEl.alt = `${screening.film.title} poster`;
          posterEl.hidden = false;
        }
        bind(row, "plot").textContent = screening.film.plot || "";
        const detailLink = bind(row, "detailLink");
        detailLink.href = `/archive/${screening.weekKey}`;
        return row;
      });
      archiveList.replaceChildren(...rows);
    } else {
      archiveList.replaceChildren(
        Object.assign(document.createElement("li"), {
          innerHTML: "<p class=\"muted\">No screenings have been added yet.</p>"
        })
      );
    }
  } catch (error) {
    archiveList.replaceChildren(
      Object.assign(document.createElement("li"), {
        innerHTML: `<p class="muted">${error.message}</p>`
      })
    );
  }
}

loadArchive();