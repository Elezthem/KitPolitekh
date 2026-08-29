const screens = [...document.querySelectorAll("[data-screen]")];
const nextButton = document.querySelector("[data-next='contact']");
const contactForm = document.querySelector("#contact-form");
const wishForm = document.querySelector("#wish-form");
const statusLine = document.querySelector("#form-status");
const flyzone = document.querySelector("#wish-flyzone");
const wishCloud = document.querySelector("#wish-cloud");
const qrInstagram = document.querySelector("#qr-instagram");
const qrTiktok = document.querySelector("#qr-tiktok");
const backButtons = [...document.querySelectorAll("[data-back]")];

const state = {
  phone: "",
  name: "",
  telegram: ""
};

const order = ["intro", "contact", "wish", "showcase"];

const socials = {
  instagram: "https://www.instagram.com/fkitmr.zpsu/",
  tiktok: "https://www.tiktok.com/@fkitmr.zpsu"
};

const validators = {
  phone: /^\+380\d{9}$/,
  name: /^[A-Za-zА-Яа-яІіЇїЄєҐґ' -]{2,30}$/,
  telegram: /^@?[A-Za-z0-9_]{5,32}$/
};

function showScreen(name, options = {}) {
  const { push = true } = options;
  screens.forEach((screen) => {
    screen.classList.toggle("is-active", screen.dataset.screen === name);
  });

  if (push) {
    const url = name === "intro" ? "/" : `/#${name}`;
    window.history.pushState({ screen: name }, "", url);
  }
}

function goBackScreen() {
  const hash = window.location.hash.replace("#", "");
  const current = order.includes(hash) ? hash : "intro";
  const currentIndex = order.indexOf(current);

  if (currentIndex > 0) {
    window.history.back();
    return;
  }

  showScreen("intro", { push: false });
  window.history.replaceState({ screen: "intro" }, "", "/");
}

function syncScreenFromLocation() {
  const hash = window.location.hash.replace("#", "");
  const target = order.includes(hash) ? hash : "intro";
  showScreen(target, { push: false });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderQr(target, url) {
  const api = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&qzone=2&data=${encodeURIComponent(url)}`;
  target.innerHTML = `<img class="qr-image" src="${api}" alt="QR code" width="200" height="200" loading="eager" decoding="sync" />`;
}

const cloudSlots = [
  { left: "6%", top: "10%" },
  { left: "19%", top: "26%" },
  { left: "8%", top: "52%" },
  { left: "19%", top: "73%" },
  { left: "73%", top: "9%" },
  { left: "82%", top: "28%" },
  { left: "75%", top: "54%" },
  { left: "84%", top: "74%" }
];

function normalizeTelegram(value) {
  return value.startsWith("@") ? value : `@${value}`;
}

function validateContactForm(payload) {
  if (!validators.phone.test(payload.phone)) {
    return "Введіть номер у форматі +380XXXXXXXXX.";
  }
  if (!validators.name.test(payload.name)) {
    return "Ім'я має бути 2-30 символів без цифр.";
  }
  if (!validators.telegram.test(payload.telegram)) {
    return "Telegram username має бути 5-32 символи: літери, цифри або _.";
  }
  return "";
}

function validateWish(wish) {
  const words = wish.split(/\s+/).filter(Boolean);
  if (wish.length < 2) {
    return "Побажання має бути не коротшим за 2 символи.";
  }
  if (words.length > 255) {
    return "Побажання має містити не більше 255 слів.";
  }
  return "";
}

function renderWishCloud(entries, highlightNewest = false) {
  const items = entries.slice(-8).reverse();
  wishCloud.innerHTML = items
    .map((entry, index) => {
      const slot = cloudSlots[index % cloudSlots.length];
      return `
        <div
          class="wish-note${highlightNewest && index === 0 ? " wish-note--new" : ""}"
          style="left:${slot.left};top:${slot.top};"
        >
          <strong>${escapeHtml(entry.name)}</strong>
          <span>${escapeHtml(entry.wish)}</span>
        </div>
      `;
    })
    .join("");
}

function getWishEntries() {
  return wishCloud.dataset.entries ? JSON.parse(wishCloud.dataset.entries) : [];
}

function showWishOnBoard(entry) {
  const nextEntries = [entry, ...getWishEntries()].slice(0, 8);
  wishCloud.dataset.entries = JSON.stringify(nextEntries);
  renderWishCloud(nextEntries, true);

  const chip = document.createElement("div");
  chip.className = "wish-chip";
  chip.innerHTML = `<strong>${escapeHtml(entry.name)}</strong><br />${escapeHtml(entry.wish)}`;
  flyzone.appendChild(chip);

  window.setTimeout(() => {
    chip.remove();
  }, 5000);
}

function bootstrapStream() {
  const stream = new EventSource("/api/wishes-stream");
  stream.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "bootstrap" && data.wishes?.length) {
      const nextEntries = data.wishes.slice(-8).reverse();
      wishCloud.dataset.entries = JSON.stringify(nextEntries);
      renderWishCloud(nextEntries, false);
      return;
    }
    if (data.wish) {
      showWishOnBoard(data);
    }
  };
}

nextButton?.addEventListener("click", () => showScreen("contact"));

backButtons.forEach((button) => {
  button.addEventListener("click", goBackScreen);
});

contactForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(contactForm);
  const nextState = {
    phone: String(formData.get("phone") || "").trim(),
    name: String(formData.get("name") || "").trim(),
    telegram: String(formData.get("telegram") || "").trim()
  };
  const error = validateContactForm(nextState);
  if (error) {
    window.alert(error);
    return;
  }
  state.phone = nextState.phone;
  state.name = nextState.name;
  state.telegram = normalizeTelegram(nextState.telegram);
  showScreen("wish");
});

wishForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusLine.textContent = "Відправляємо побажання...";

  const formData = new FormData(wishForm);
  const payload = {
    phone: state.phone,
    name: state.name,
    telegram: state.telegram,
    wish: String(formData.get("wish") || "").trim()
  };

  const wishError = validateWish(payload.wish);
  if (wishError) {
    statusLine.textContent = wishError;
    return;
  }

  try {
    const response = await fetch("/api/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Помилка");
    }

    statusLine.textContent = "Побажання відправлено!";
    wishForm.reset();
    showScreen("showcase");
  } catch (error) {
    statusLine.textContent = error.message || "Не вдалося відправити побажання.";
  }
});

renderQr(qrInstagram, socials.instagram);
renderQr(qrTiktok, socials.tiktok);
bootstrapStream();

window.addEventListener("popstate", syncScreenFromLocation);
window.history.replaceState({ screen: "intro" }, "", window.location.hash || "/");
syncScreenFromLocation();
