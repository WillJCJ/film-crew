const setupForm = document.querySelector("#setup-form");
const setupMessage = document.querySelector("#setup-message");

async function loadSetupStatus() {
  try {
    const { needsSetup } = await window.filmCrew.fetchJson("/api/setup-status");
    if (!needsSetup) {
      setupMessage.textContent = "Setup is already complete. Log in instead.";
      setupForm?.classList.add("hidden");
    }
  } catch (error) {
    setupMessage.textContent = error.message;
  }
}

setupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(setupForm);
  const adminSlot = formData.get("adminSlot");
  const members = [];

  for (let slot = 1; slot <= 4; slot += 1) {
    members.push({
      displayName: formData.get(`displayName${slot}`),
      username: formData.get(`username${slot}`),
      password: formData.get(`password${slot}`),
      role: String(slot) === String(adminSlot) ? "admin" : "member"
    });
  }

  setupMessage.textContent = "Creating accounts…";

  try {
    await window.filmCrew.fetchJson("/api/setup", {
      method: "POST",
      body: JSON.stringify({ members })
    });
    setupMessage.textContent = "Accounts created. You can log in now.";
    window.location.href = "/login/";
  } catch (error) {
    setupMessage.textContent = error.message;
  }
});

loadSetupStatus();