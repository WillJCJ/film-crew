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
  element.dataset.scoreBand = getScoreBand(score);
}

function createMemberIdentity(member) {
  const emoji = member?.profileEmoji || "🏳️‍🌈";
  const name = member?.name || "Guest";
  const color = member?.profileColor || "";

  const identity = createEl("span", { className: "member-identity" });
  if (color) {
    identity.style.color = color;
  }

  const emojiEl = createEl("span", { className: "member-emoji", text: emoji });
  const nameEl = createEl("span", { className: "member-name", text: name });
  identity.replaceChildren(emojiEl, nameEl);
  return identity;
}

function renderChooserLine(target, screening, options = {}) {
  const { useForFutureDate = false } = options;
  if (!target) {
    return;
  }

  const prefix = document.createTextNode("Chosen by ");
  const chooserNode = createMemberIdentity(screening.chooser || {});
  let suffix = document.createTextNode("");
  if (screening.watchDate) {
    let preposition = "on";
    if (useForFutureDate) {
      const today = new Date().toISOString().slice(0, 10);
      if (screening.watchDate > today) {
        preposition = "for";
      }
    }
    suffix = document.createTextNode(` ${preposition} ${screening.watchDate}`);
  }

  target.replaceChildren(prefix, chooserNode, suffix);
}

function renderScreeningCard(screening, options = {}) {
  const { showPlot = true, titleLinkHref = null, posterLinkHref = null } = options;
  const tpl = document.getElementById("screening-card-tpl");
  const card = tpl.content.cloneNode(true).firstElementChild;

  const bind = (name) => card.querySelector(`[data-bind="${name}"]`);

  const poster = bind("poster");
  if (screening.film.posterUrl) {
    poster.src = screening.film.posterUrl;
    poster.alt = `${screening.film.title} poster`;
    poster.hidden = false;

    if (posterLinkHref) {
      const posterLink = createEl("a", {
        attrs: {
          href: posterLinkHref,
          "aria-label": `Open details for ${screening.film.title}`
        }
      });
      posterLink.appendChild(poster);
      card.prepend(posterLink);
    }
  }

  bind("weekKey").textContent = screening.weekKey;
  const titleEl = bind("title");
  if (titleLinkHref) {
    const titleLink = createEl("a", {
      className: "text-link",
      text: screening.film.title,
      attrs: { href: titleLinkHref }
    });
    titleEl.replaceChildren(titleLink);
  } else {
    titleEl.textContent = screening.film.title;
  }
  bind("yearGroup").textContent = `(${screening.film.year || "Unknown year"})`;
  renderChooserLine(bind("chooserLine"), screening);
  const plotEl = bind("plot");
  if (showPlot) {
    plotEl.textContent = screening.film.plot || "No plot stored yet.";
    plotEl.hidden = false;
  } else {
    plotEl.textContent = "";
    plotEl.hidden = true;
  }
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
  createMemberIdentity,
  renderChooserLine,
  renderScreeningCard,
  replaceChildren,
  setMutedMessage
};

document.addEventListener("DOMContentLoaded", () => {
  initAuthState();
});