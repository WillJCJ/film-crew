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

function cloneTemplate(id) {
  return document.getElementById(id).content.cloneNode(true).firstElementChild;
}

function bind(root, name) {
  return root.querySelector(`[data-bind="${name}"]`);
}

function renderRatings(ratings) {
  if (!ratings?.length) {
    return [window.filmCrew.createEl("p", { className: "muted", text: "No ratings submitted yet." })];
  }

  return ratings.map((rating) => {
    const item = cloneTemplate("rating-item-tpl");
    const ratingLabel = rating.score === null || rating.score === undefined ? (rating.reaction || "No score") : `${rating.score}/10`;
    bind(item, "summary").textContent = `${rating.memberName} · ${ratingLabel}`;
    bind(item, "review").textContent = rating.review || "No review yet.";
    return item;
  });
}

function renderCurrentScreening(screening) {
  if (!screening) {
    window.filmCrew.setMutedMessage(currentScreeningTarget, "No screenings yet. Add one below if you are the admin.");
    ratingForm.classList.add("hidden");
    return;
  }

  const card = cloneTemplate("current-screening-tpl");
  bind(card, "weekKey").textContent = screening.weekKey;
  bind(card, "title").textContent = screening.film.title;
  bind(card, "chooserLine").textContent = screening.watchDate
    ? `Chosen by ${screening.chooser.name} on ${screening.watchDate}`
    : `Chosen by ${screening.chooser.name}`;
  bind(card, "plot").textContent = screening.film.plot || "No plot stored yet.";
  bind(card, "score").textContent = window.filmCrew.formatAverage(screening.averageScore);
  bind(card, "ratingCount").textContent = ` · ${screening.ratingCount} ratings`;
  bind(card, "ratings").replaceChildren(...renderRatings(screening.ratings));

  currentScreeningTarget.replaceChildren(card);
  ratingForm.classList.remove("hidden");
  const existing = screening.ratings.find((rating) => rating.memberName === currentMember.displayName);
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
    const loginLink = window.filmCrew.createEl("a", {
      className: "text-link",
      text: "Go to login page",
      attrs: { href: "/login/" }
    });
    dashboardUser.replaceChildren(document.createTextNode("You are not authenticated. "), loginLink, document.createTextNode("."));
    window.filmCrew.replaceChildren(currentScreeningTarget, []);
    ratingForm.classList.add("hidden");
  }
}

async function populateMemberOptions() {
  const select = createScreeningForm.elements.chooserDisplayName;
  const { members } = await window.filmCrew.fetchJson("/api/members");
  const options = members.map((member) => {
    const option = window.filmCrew.createEl("option", {
      text: member.displayName,
      attrs: { value: member.displayName }
    });
    return option;
  });
  select.replaceChildren(...options);
}

ratingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentScreening) {
    return;
  }

  ratingMessage.textContent = "Saving…";
  try {
    const payload = await window.filmCrew.fetchJson(`/api/screenings/${currentScreening.weekKey}/ratings`, {
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

  window.filmCrew.setMutedMessage(filmSearchResults, "Searching...");

  try {
    const { results } = await window.filmCrew.fetchJson(`/api/admin/film-search?q=${encodeURIComponent(query)}`);

    if (!results.length) {
      window.filmCrew.setMutedMessage(filmSearchResults, "No OMDb results matched that search.");
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
      bind(card, "year").textContent = film.year || "Unknown year";
      const btn = bind(card, "select");
      btn.dataset.imdbId = film.imdbId;
      btn.dataset.filmTitle = film.title;
      return card;
    });

    window.filmCrew.replaceChildren(filmSearchResults, cards);
  } catch (error) {
    window.filmCrew.setMutedMessage(filmSearchResults, error.message);
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
        chooserDisplayName: createScreeningForm.elements.chooserDisplayName.value,
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