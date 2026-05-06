const currentTarget = document.querySelector("#current-screening");
const recentTarget = document.querySelector("#recent-screenings");

async function loadHome() {
  try {
    const [{ screening }, { screenings }] = await Promise.all([
      window.filmCrew.fetchJson("/api/screenings/current"),
      window.filmCrew.fetchJson("/api/screenings")
    ]);

    if (screening) {
      const card = window.filmCrew.renderScreeningCard(screening, {
        titleLinkHref: `/archive/${screening.weekKey}`,
        posterLinkHref: `/archive/${screening.weekKey}`
      });
      window.filmCrew.replaceChildren(currentTarget, [card]);
    } else {
      window.filmCrew.setMutedMessage(currentTarget, "No screenings have been added yet.");
    }

    if (screenings.length) {
      window.filmCrew.replaceChildren(
        recentTarget,
        screenings.slice(0, 3).map((item) => window.filmCrew.renderScreeningCard(item, {
          showPlot: false,
          titleLinkHref: `/archive/${item.weekKey}`,
          posterLinkHref: `/archive/${item.weekKey}`
        }))
      );
    } else {
      window.filmCrew.setMutedMessage(recentTarget, "The archive is still empty.");
    }
  } catch (error) {
    window.filmCrew.setMutedMessage(currentTarget, error.message);
    window.filmCrew.setMutedMessage(recentTarget, error.message);
  }
}

loadHome();