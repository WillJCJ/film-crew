const archiveList = document.querySelector("#archive-list");

async function loadArchive() {
  try {
    const { screenings } = await window.filmCrew.fetchJson("/api/screenings");
    if (screenings.length) {
      const cards = screenings.map((screening) => {
        const card = window.filmCrew.renderScreeningCard(screening, { showPlot: false });
        const link = window.filmCrew.createEl("a", {
          className: "card-link",
          attrs: { href: `/archive/${screening.weekKey}` }
        });
        link.appendChild(card);
        return link;
      });
      window.filmCrew.replaceChildren(archiveList, cards);
    } else {
      window.filmCrew.setMutedMessage(archiveList, "No screenings have been added yet.");
    }
  } catch (error) {
    window.filmCrew.setMutedMessage(archiveList, error.message);
  }
}

loadArchive();