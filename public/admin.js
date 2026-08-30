const stats = document.querySelector("#admin-stats");
const table = document.querySelector("#admin-table");
const settingsForm = document.querySelector("#admin-settings");
const blockedWordsField = document.querySelector("#blocked-words");
const settingsStatus = document.querySelector("#admin-settings-status");

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTable(submissions) {
  table.innerHTML = submissions
    .slice()
    .reverse()
    .map(
      (entry) => `
        <tr>
          <td>${new Date(entry.createdAt).toLocaleString("uk-UA")}</td>
          <td>${escapeHtml(entry.name)}</td>
          <td>${escapeHtml(entry.phone)}</td>
          <td>${escapeHtml(entry.telegram)}</td>
          <td>${escapeHtml(entry.wish)}</td>
          <td>
            <button class="ghost-button admin-delete-button" type="button" data-delete-id="${entry.id}">
              Видалити
            </button>
          </td>
        </tr>
      `
    )
    .join("");
}

async function loadSubmissions() {
  const response = await fetch("/api/admin/submissions", { cache: "no-store" });
  const data = await response.json();

  stats.textContent = `Усього заявок: ${data.submissions.length}. Оновлено: ${new Date(data.updatedAt).toLocaleString("uk-UA")}`;
  renderTable(data.submissions);
}

async function loadSettings() {
  const response = await fetch("/api/admin/settings", { cache: "no-store" });
  const data = await response.json();
  blockedWordsField.value = (data.blockedWords || []).join("\n");
}

settingsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  settingsStatus.textContent = "Зберігаємо...";

  try {
    const response = await fetch("/api/admin/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        blockedWords: blockedWordsField.value
      })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Помилка збереження.");
    }

    blockedWordsField.value = (result.blockedWords || []).join("\n");
    settingsStatus.textContent = "Фільтр оновлено.";
  } catch (error) {
    settingsStatus.textContent = error.message || "Не вдалося зберегти фільтр.";
  }
});

table?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-id]");
  if (!button) {
    return;
  }

  const submissionId = button.dataset.deleteId;
  const confirmed = window.confirm("Видалити це побажання?");
  if (!confirmed) {
    return;
  }

  button.disabled = true;
  button.textContent = "Видаляємо...";

  try {
    const response = await fetch(`/api/admin/submissions/${encodeURIComponent(submissionId)}`, {
      method: "DELETE"
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Не вдалося видалити побажання.");
    }

    await loadSubmissions();
    settingsStatus.textContent = "Побажання видалено.";
  } catch (error) {
    button.disabled = false;
    button.textContent = "Видалити";
    settingsStatus.textContent = error.message || "Не вдалося видалити побажання.";
  }
});

Promise.all([loadSubmissions(), loadSettings()]).catch(() => {
  stats.textContent = "Не вдалося завантажити адмін-панель.";
});
