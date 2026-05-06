async function fetchJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload;
}

function createEl(tagName, options = {}) {
  const el = document.createElement(tagName);
  if (options.className) {
    el.className = options.className;
  }
  if (options.text !== undefined) {
    el.textContent = options.text;
  }
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value !== undefined && value !== null) {
        el.setAttribute(key, String(value));
      }
    }
  }
  return el;
}

function setMutedMessage(target, message) {
  if (!target) {
    return;
  }
  const paragraph = createEl("p", { className: "muted", text: message });
  target.replaceChildren(paragraph);
}

function replaceChildren(target, nodes) {
  if (!target) {
    return;
  }
  target.replaceChildren(...nodes);
}

function formatAverage(value) {
  return value === null || value === undefined ? "No ratings yet" : Number(value).toFixed(1);
}

function getScoreBand(score) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) {
    return "none";
  }

  const value = Number(score);
  if (value < 2) {
    return "deep-red";
  }
  if (value < 4) {
    return "red";
  }
  if (value < 5) {
    return "orange";
  }
  if (value < 6) {
    return "light-orange";
  }
  if (value < 7) {
    return "yellow-green";
  }
  if (value < 8) {
    return "light-green";
  }
  if (value < 9) {
    return "green";
  }
  if (value < 10) {
    return "deep-green";
  }
  return "gold";
}

function applyScoreBandClass(element, score) {
  if (!element) {
    return;
  }

  const allBands = [
    "rating-band-none",
    "rating-band-deep-red",
    "rating-band-red",
    "rating-band-orange",
    "rating-band-light-orange",
    "rating-band-yellow-green",
    "rating-band-light-green",
    "rating-band-green",
    "rating-band-deep-green",
    "rating-band-gold"
  ];

  element.classList.remove(...allBands);
  element.classList.add(`rating-band-${getScoreBand(score)}`);
}

function renderScreeningCard(screening) {
  const tpl = document.getElementById("screening-card-tpl");
  const card = tpl.content.cloneNode(true).firstElementChild;

  const bind = (name) => card.querySelector(`[data-bind="${name}"]`);

  const poster = bind("poster");
  if (screening.film.posterUrl) {
    poster.src = screening.film.posterUrl;
    poster.alt = `${screening.film.title} poster`;
    poster.hidden = false;
  }

  bind("weekKey").textContent = screening.weekKey;
  bind("title").textContent = screening.film.title;
  bind("yearGroup").textContent = `(${screening.film.year || "Unknown year"})`;
  bind("chooserLine").textContent = screening.watchDate
    ? `Chosen by ${screening.chooser.name} on ${screening.watchDate}`
    : `Chosen by ${screening.chooser.name}`;
  bind("plot").textContent = screening.film.plot || "No plot stored yet.";
  const scoreEl = bind("score");
  scoreEl.textContent = formatAverage(screening.averageScore);
  applyScoreBandClass(scoreEl, screening.averageScore);
  bind("ratingCount").textContent = ` · ${screening.ratingCount} ratings`;

  return card;
}

async function initAuthState() {
  try {
    await fetchJson("/api/me");
    document.body.setAttribute("data-authed", "");
  } catch {
    document.body.removeAttribute("data-authed");
  }
}

window.filmCrew = {
  createEl,
  fetchJson,
  formatAverage,
  getScoreBand,
  applyScoreBandClass,
  renderScreeningCard,
  replaceChildren,
  setMutedMessage
};

document.addEventListener("DOMContentLoaded", () => {
  initAuthState();
});