const screens = [...document.querySelectorAll("[data-screen]")];
const nextButton = document.querySelector("[data-next='contact']");
const contactForm = document.querySelector("#contact-form");
const wishForm = document.querySelector("#wish-form");
const statusLine = document.querySelector("#form-status");
const flyzone = document.querySelector("#wish-flyzone");
const wishCloud = document.querySelector("#wish-cloud");
const qrInstagram = document.querySelector("#qr-instagram");
const qrTiktok = document.querySelector("#qr-tiktok");
const qrPlatform = document.querySelector("#qr-platform");

const RETENTION_MS = 10 * 60 * 60 * 1000;

const state = {
  phone: "",
  name: "",
  telegram: ""
};

const blockedWordsState = {
  words: []
};

const noteSlots = [
  { left: "2%", top: "4%" },
  { left: "9%", top: "18%" },
  { left: "4%", top: "31%" },
  { left: "11%", top: "46%" },
  { left: "3%", top: "59%" },
  { left: "10%", top: "74%" },
  { left: "71%", top: "4%" },
  { left: "78%", top: "18%" },
  { left: "73%", top: "33%" },
  { left: "80%", top: "47%" },
  { left: "72%", top: "61%" },
  { left: "79%", top: "75%" }
];

const NOTE_WIDTH = 180;
const NOTE_HEIGHT = 92;
const NOTE_GAP_X = 18;
const NOTE_GAP_Y = 14;

let clearWishTimer = 0;

const order = ["intro", "contact", "wish", "showcase"];

const socials = {
  instagram: "https://www.instagram.com/fkitmr.zpsu/",
  tiktok: "https://www.tiktok.com/@fkitmr.zpsu/"
};

const validators = {
  phone: /^\+380\d{9}$/,
  name: /^[A-Za-zА-Яа-яІіЇїЄєҐґ' -]{2,30}$/,
  telegram: /^@?[A-Za-z0-9_]{5,32}$/
};

function setActiveScreen(name) {
  screens.forEach((screen) => {
    screen.classList.toggle("is-active", screen.dataset.screen === name);
  });
  document.body.classList.toggle("showcase-locked", name === "showcase");
}

function buildScreenUrl(name) {
  return name === "intro" ? "/" : `/#${name}`;
}

function showScreen(name, options = {}) {
  const { push = false } = options;
  setActiveScreen(name);

  if (push) {
    window.history.pushState({ screen: name }, "", buildScreenUrl(name));
    return;
  }

  window.history.replaceState({ screen: name }, "", buildScreenUrl(name));
}

function replaceScreen(name) {
  setActiveScreen(name);
  window.history.replaceState({ screen: name }, "", buildScreenUrl(name));
}

function syncScreenFromLocation() {
  const currentScreen = window.history.state?.screen;
  const target = order.includes(currentScreen) ? currentScreen : "intro";
  replaceScreen(target);
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
  if (!target) {
    return;
  }

  const api = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&qzone=2&data=${encodeURIComponent(url)}`;
  target.innerHTML = `<img class="qr-image" src="${api}" alt="QR code" width="200" height="200" loading="eager" decoding="sync" />`;
}

function buildPlatformUrl() {
  return `${window.location.origin}/#contact`;
}

function clearWishes() {
  wishCloud.dataset.entries = JSON.stringify([]);
  wishCloud.innerHTML = "";
}

function scheduleWishClear(expiresAt) {
  window.clearTimeout(clearWishTimer);

  if (!expiresAt) {
    return;
  }

  const delay = new Date(expiresAt).getTime() - Date.now();
  if (delay <= 0) {
    clearWishes();
    return;
  }

  clearWishTimer = window.setTimeout(clearWishes, delay);
}

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
  if (wish.length < 2) {
    return "Побажання має бути не коротшим за 2 символи.";
  }
  if (wish.length > 25) {
    return "Побажання має містити не більше 25 символів.";
  }

  const normalizedWish = wish.toLowerCase();
  const blockedWord = blockedWordsState.words.find((word) => normalizedWish.includes(word));
  if (blockedWord) {
    return "Побажання містить заборонені слова.";
  }

  return "";
}

async function loadBlockedWords() {
  try {
    const response = await fetch("/api/settings/blocked-words", { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const data = await response.json();
    blockedWordsState.words = Array.isArray(data.blockedWords) ? data.blockedWords : [];
  } catch {
    blockedWordsState.words = [];
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildNoteLayouts(items) {
  const layouts = [];
  const cloudWidth = wishCloud?.clientWidth || 1200;
  const cloudHeight = wishCloud?.clientHeight || 900;
  const maxLeft = Math.max(0, cloudWidth - NOTE_WIDTH);
  const maxTop = Math.max(0, cloudHeight - NOTE_HEIGHT);

  items.forEach((_, index) => {
    const slot = noteSlots[index % noteSlots.length];
    const cycle = Math.floor(index / noteSlots.length);
    const baseLeft = (parseFloat(slot.left) / 100) * cloudWidth;
    const baseTop = (parseFloat(slot.top) / 100) * cloudHeight;
    let left = clamp(
      baseLeft + ((index % 2 === 0 ? -1 : 1) * ((index * 7) % 10)),
      0,
      maxLeft
    );
    let top = clamp(baseTop + cycle * 26 + ((index * 11) % 8), 0, maxTop);
    let tries = 0;

    while (tries < 24) {
      const overlaps = layouts.some((placed) => {
        const horizontalOverlap = Math.abs(left - placed.left) < NOTE_WIDTH - NOTE_GAP_X;
        const verticalOverlap = Math.abs(top - placed.top) < NOTE_HEIGHT - NOTE_GAP_Y;
        return horizontalOverlap && verticalOverlap;
      });

      if (!overlaps) {
        break;
      }

      top = clamp(top + NOTE_HEIGHT * 0.55, 0, maxTop);
      if (top >= maxTop - 4) {
        top = clamp(baseTop + (tries % 4) * 12, 0, maxTop);
        left = clamp(left + (index % 2 === 0 ? -1 : 1) * 16, 0, maxLeft);
      }
      tries += 1;
    }

    layouts.push({
      left,
      top,
      angle: ((index * 5) % 10) - 5
    });
  });

  return layouts;
}

function renderWishCloud(entries, highlightNewest = false) {
  const items = entries.slice().reverse();
  const layouts = buildNoteLayouts(items);
  wishCloud.innerHTML = items
    .map((entry, index) => {
      const layout = layouts[index];

      return `
        <div
          class="wish-note${highlightNewest && index === 0 ? " wish-note--new" : ""}"
          style="
            left: ${layout.left}px;
            top: ${layout.top}px;
            --note-rotate: ${layout.angle}deg;
          "
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
  const nextEntries = [entry, ...getWishEntries()];
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

    if (data.type === "bootstrap") {
      const nextEntries = data.wishes || [];
      wishCloud.dataset.entries = JSON.stringify(nextEntries);
      renderWishCloud(nextEntries, false);
      scheduleWishClear(data.expiresAt);
      return;
    }

    if (data.wish) {
      showWishOnBoard(data);
      scheduleWishClear(data.expiresAt || new Date(Date.now() + RETENTION_MS).toISOString());
    }
  };
}

nextButton?.addEventListener("click", () => showScreen("contact"));

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
    replaceScreen("showcase");
  } catch (error) {
    statusLine.textContent = error.message || "Не вдалося відправити побажання.";
  }
});

renderQr(qrInstagram, socials.instagram);
renderQr(qrTiktok, socials.tiktok);
renderQr(qrPlatform, buildPlatformUrl());
loadBlockedWords();
bootstrapStream();

window.addEventListener("popstate", syncScreenFromLocation);
window.history.replaceState({ screen: "intro" }, "", window.location.hash || "/");
syncScreenFromLocation();
