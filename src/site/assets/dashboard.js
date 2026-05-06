const dashboardUser = document.querySelector("#dashboard-user");
const currentScreeningTarget = document.querySelector("#dashboard-current-screening");
const ratingForm = document.querySelector("#rating-form");
const ratingMessage = document.querySelector("#rating-message");
const adminPanel = document.querySelector("#admin-panel");
const filmSearchForm = document.querySelector("#film-search-form");
const filmSearchResults = document.querySelector("#film-search-results");
const createScreeningForm = document.querySelector("#create-screening-form");
const createScreeningMessage = document.querySelector("#create-screening-message");

let currentMember = null;
let currentScreening = null;

function renderCurrentScreening(screening) {
  if (!screening) {
    currentScreeningTarget.innerHTML = '<p class="muted">No screenings yet. Add one below if you are the admin.</p>';
    ratingForm.classList.add("hidden");
    return;
  }

  const ratings = screening.ratings?.length
    ? `
      <div class="rating-list">
        ${screening.ratings
          .map(
            (rating) => `
              <article class="rating-item">
                <strong>${rating.memberName}</strong> · ${rating.score}/10
                <p>${rating.review || "No review yet."}</p>
              </article>
            `
          )
          .join("")}
      </div>
    `
    : '<p class="muted">No ratings submitted yet.</p>';

  currentScreeningTarget.innerHTML = `
    <article class="detail-card">
      <p class="eyebrow">${screening.weekKey}</p>
      <h2>${screening.film.title}</h2>
      <p class="muted">Chosen by ${screening.chooser.name} on ${screening.watchDate}</p>
      <p>${screening.film.plot || "No plot stored yet."}</p>
      <p><strong>${window.filmCrew.formatAverage(screening.averageScore)}</strong> · ${screening.ratingCount} ratings</p>
      ${ratings}
    </article>
  `;

  ratingForm.classList.remove("hidden");
  const existing = screening.ratings.find((rating) => rating.memberId === currentMember.id);
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
    dashboardUser.textContent = `Signed in as ${member.displayName}.`;
    renderCurrentScreening(screening);

    // Check if user is admin by attempting to access admin endpoint
    try {
      await window.filmCrew.fetchJson("/api/members");
      adminPanel.classList.remove("hidden");
      await populateMemberOptions();
    } catch {
      // User is not admin, hide admin panel
    }
  } catch (error) {
    dashboardUser.innerHTML = 'You are not authenticated. <a class="text-link" href="/login/">Go to login page</a>.';
    currentScreeningTarget.innerHTML = "";
    ratingForm.classList.add("hidden");
  }
}

async function populateMemberOptions() {
  const select = createScreeningForm.elements.chooserMemberId;
  const { members } = await window.filmCrew.fetchJson("/api/members");
  select.innerHTML = members
    .map((member) => `<option value="${member.id}">${member.displayName}</option>`)
    .join("");
}

ratingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentScreening) {
    return;
  }

  ratingMessage.textContent = "Saving…";
  try {
    const payload = await window.filmCrew.fetchJson(`/api/screenings/${currentScreening.id}/ratings`, {
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

  filmSearchResults.innerHTML = '<p class="muted">Searching…</p>';

  try {
    const { results } = await window.filmCrew.fetchJson(`/api/admin/film-search?q=${encodeURIComponent(query)}`);
    filmSearchResults.innerHTML = results.length
      ? results
          .map(
            (film) => `
              <article class="card">
                ${film.posterUrl ? `<img class="poster" src="${film.posterUrl}" alt="${film.title} poster">` : ""}
                <h3>${film.title}</h3>
                <p class="muted">${film.year || "Unknown year"}</p>
                <button class="button secondary" type="button" data-imdb-id="${film.imdbId}" data-film-title="${film.title}">Use this film</button>
              </article>
            `
          )
          .join("")
      : '<p class="muted">No OMDb results matched that search.</p>';
  } catch (error) {
    filmSearchResults.innerHTML = `<p class="muted">${error.message}</p>`;
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
        chooserMemberId: Number(createScreeningForm.elements.chooserMemberId.value),
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