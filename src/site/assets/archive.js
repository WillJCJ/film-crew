const archiveList = document.querySelector("#archive-list");

async function loadArchive() {
  try {
    const { screenings } = await window.filmCrew.fetchJson("/api/screenings");
    archiveList.innerHTML = screenings.length
      ? screenings.map(window.filmCrew.renderScreeningCard).join("")
      : '<p class="muted">No screenings have been added yet.</p>';
  } catch (error) {
    archiveList.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

loadArchive();