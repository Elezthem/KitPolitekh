async function loadSubmissions() {
  const stats = document.querySelector("#admin-stats");
  const table = document.querySelector("#admin-table");

  const response = await fetch("/api/admin/submissions", { cache: "no-store" });
  const data = await response.json();

  stats.textContent = `Усього заявок: ${data.submissions.length}. Оновлено: ${new Date(data.updatedAt).toLocaleString("uk-UA")}`;

  table.innerHTML = data.submissions
    .slice()
    .reverse()
    .map((entry) => `
      <tr>
        <td>${new Date(entry.createdAt).toLocaleString("uk-UA")}</td>
        <td>${entry.name}</td>
        <td>${entry.phone}</td>
        <td>@${entry.telegram}</td>
        <td>${entry.wish}</td>
      </tr>
    `)
    .join("");
}

loadSubmissions().catch(() => {
  document.querySelector("#admin-stats").textContent = "Не вдалося завантажити базу.";
});
