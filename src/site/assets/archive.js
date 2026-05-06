const archiveList = document.querySelector("#archive-list");

async function loadArchive() {
  try {
    const { screenings } = await window.filmCrew.fetchJson("/api/screenings");
    if (screenings.length) {
      window.filmCrew.replaceChildren(archiveList, screenings.map(window.filmCrew.renderScreeningCard));
    } else {
      window.filmCrew.setMutedMessage(archiveList, "No screenings have been added yet.");
    }
  } catch (error) {
    window.filmCrew.setMutedMessage(archiveList, error.message);
  }
}

loadArchive();