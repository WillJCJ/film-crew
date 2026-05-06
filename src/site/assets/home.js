const currentTarget = document.querySelector("#current-screening");
const recentTarget = document.querySelector("#recent-screenings");

async function loadHome() {
  try {
    const [{ screening }, { screenings }] = await Promise.all([
      window.filmCrew.fetchJson("/api/screenings/current"),
      window.filmCrew.fetchJson("/api/screenings")
    ]);

    currentTarget.innerHTML = screening
      ? window.filmCrew.renderScreeningCard(screening)
      : '<p class="muted">No screenings have been added yet.</p>';

    recentTarget.innerHTML = screenings.length
      ? screenings.slice(0, 3).map(window.filmCrew.renderScreeningCard).join("")
      : '<p class="muted">The archive is still empty.</p>';
  } catch (error) {
    currentTarget.innerHTML = `<p class="muted">${error.message}</p>`;
    recentTarget.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

loadHome();