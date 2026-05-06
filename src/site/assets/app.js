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

function getPathname() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

function isActivePath(href, pathname) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href.replace(/\/+$/, "");
}

function navLink(href, label, pathname) {
  const active = isActivePath(href, pathname) ? ' aria-current="page"' : "";
  return `<a href="${href}"${active}>${label}</a>`;
}

function setSignedOutNav(navEl, pathname) {
  navEl.innerHTML = [
    navLink("/", "Home", pathname),
    navLink("/login/", "Login", pathname)
  ].join("\n");
}

function setSignedInNav(navEl, pathname) {
  navEl.innerHTML = [
    navLink("/", "Home", pathname),
    navLink("/archive/", "Archive", pathname),
    navLink("/dashboard/", "Dashboard", pathname),
    '<a href="/cdn-cgi/access/logout?redirect_url=%2Flogin%2F">Logout</a>'
  ].join("\n");
}

async function initNavigation() {
  const navEl = document.getElementById("site-nav");
  if (!navEl) {
    return;
  }

  const pathname = getPathname();
  setSignedOutNav(navEl, pathname);

  try {
    await fetchJson("/api/me");
    setSignedInNav(navEl, pathname);
  } catch {
    setSignedOutNav(navEl, pathname);
  }
}

function formatAverage(value) {
  return value === null || value === undefined ? "No ratings yet" : `${Number(value).toFixed(1)}/10 average`;
}

function renderScreeningCard(screening) {
  const poster = screening.film.posterUrl
    ? `<img class="poster" src="${screening.film.posterUrl}" alt="${screening.film.title} poster">`
    : "";
  const score = formatAverage(screening.averageScore);

  return `
    <article class="card">
      ${poster}
      <p class="eyebrow">${screening.weekKey}</p>
      <h3>${screening.film.title} <span class="muted">(${screening.film.year || "Unknown year"})</span></h3>
      <p class="muted">Chosen by ${screening.chooser.name} on ${screening.watchDate}</p>
      <p>${screening.film.plot || "No plot stored yet."}</p>
      <p><strong>${score}</strong> · ${screening.ratingCount} ratings</p>
    </article>
  `;
}

window.filmCrew = {
  fetchJson,
  formatAverage,
  renderScreeningCard
};

document.addEventListener("DOMContentLoaded", initNavigation);