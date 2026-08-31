const stats = document.querySelector("#admin-stats");
const sessionBox = document.querySelector("#admin-session");
const table = document.querySelector("#admin-table");
const settingsForm = document.querySelector("#admin-settings");
const blockedWordsField = document.querySelector("#blocked-words");
const settingsStatus = document.querySelector("#admin-settings-status");
const exportButton = document.querySelector("#admin-export-button");

let autoDownloadTriggered = false;

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("uk-UA");
}

function renderTable(submissions) {
  table.innerHTML = submissions
    .slice()
    .reverse()
    .map(
      (entry) => `
        <tr>
          <td>${formatDateTime(entry.createdAt)}</td>
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

function renderSession(session, submissionsCount) {
  if (!sessionBox) {
    return;
  }

  if (!session?.startedAt) {
    sessionBox.innerHTML = `
      <strong>Сесія ще не стартувала.</strong>
      <span>Нова 10-годинна сесія почнеться після першої заявки.</span>
    `;
    return;
  }

  const status = session.isExpired ? "Сесія завершена" : "Сесія активна";
  const exportState = session.exportDownloadedAt
    ? `Скачано адміністратором: ${formatDateTime(session.exportDownloadedAt)}`
    : session.autoArchivedAt
      ? `Автоархів збережено: ${formatDateTime(session.autoArchivedAt)}`
      : "Файл ще не скачували";

  sessionBox.innerHTML = `
    <strong>${status}</strong>
    <span>Початок: ${formatDateTime(session.startedAt)}</span>
    <span>Кінець: ${formatDateTime(session.endsAt)}</span>
    <span>Заявок у сесії: ${submissionsCount}</span>
    <span>${exportState}</span>
  `;
}

async function loadSubmissions() {
  const response = await fetch("/api/admin/submissions", { cache: "no-store" });
  const data = await response.json();

  stats.textContent = `Усього заявок: ${data.submissions.length}. Оновлено: ${formatDateTime(data.updatedAt)}`;
  renderTable(data.submissions);
}

async function loadSession() {
  const response = await fetch("/api/admin/session", { cache: "no-store" });
  const data = await response.json();
  renderSession(data.session, data.submissionsCount);

  if (
    data.session?.isExpired &&
    data.submissionsCount > 0 &&
    !data.session.exportDownloadedAt &&
    !autoDownloadTriggered
  ) {
    autoDownloadTriggered = true;
    settingsStatus.textContent = "10 годин минуло. Запускаємо автоскачування сесії...";
    window.location.href = "/api/admin/export";
  }
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

exportButton?.addEventListener("click", async () => {
  settingsStatus.textContent = "Готуємо JSON сесії...";
  window.location.href = "/api/admin/export";
  window.setTimeout(async () => {
    settingsStatus.textContent = "JSON сесії завантажується.";
    await loadSession();
  }, 250);
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

    await Promise.all([loadSubmissions(), loadSession()]);
    settingsStatus.textContent = "Побажання видалено.";
  } catch (error) {
    button.disabled = false;
    button.textContent = "Видалити";
    settingsStatus.textContent = error.message || "Не вдалося видалити побажання.";
  }
});

Promise.all([loadSubmissions(), loadSettings(), loadSession()]).catch(() => {
  stats.textContent = "Не вдалося завантажити адмін-панель.";
});
