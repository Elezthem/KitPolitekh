const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const WISH_RETENTION_MS = 10 * 60 * 60 * 1000;
const PUBLIC_DIR = path.join(__dirname, "public");
const IMAGE_DIR = path.join(__dirname, "img");
const DEFAULT_DATA_DIR = path.join(__dirname, "data");
const DEFAULT_BLOCKED_WORDS = [
  "блять",
  "блядь",
  "бля",
  "сука",
  "хуй",
  "нахуй",
  "пизда",
  "пізда",
  "пиздец",
  "пиздець",
  "єбать",
  "ебать",
  "йоб",
  "ебл",
  "fuck",
  "shit",
  "bitch"
];

const clients = new Set();
const resolvedDataPaths = resolveDataPaths();
const DATA_DIR = resolvedDataPaths.dataDir;
const DATA_FILE = resolvedDataPaths.dataFile;
const BACKUP_DIR = resolvedDataPaths.backupDir;
const LATEST_BACKUP_FILE = path.join(BACKUP_DIR, "submissions-latest.json");

ensureDataFile();

function resolveDataPaths() {
  const requestedDir = path.resolve(process.env.DATA_DIR || DEFAULT_DATA_DIR);
  const fallbackDir = path.resolve(DEFAULT_DATA_DIR);

  const candidates = requestedDir === fallbackDir ? [requestedDir] : [requestedDir, fallbackDir];

  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      fs.accessSync(candidate, fs.constants.R_OK | fs.constants.W_OK);
      const backupDir = path.join(candidate, "backups");
      fs.mkdirSync(backupDir, { recursive: true });
      fs.accessSync(backupDir, fs.constants.R_OK | fs.constants.W_OK);

      if (candidate !== requestedDir) {
        console.warn(
          `[storage] DATA_DIR "${requestedDir}" is not writable. Falling back to "${candidate}".`
        );
      }

      return {
        dataDir: candidate,
        dataFile: path.join(candidate, "submissions.json"),
        backupDir
      };
    } catch (error) {
      if (candidate === fallbackDir) {
        throw error;
      }
    }
  }

  throw new Error("Unable to initialize a writable data directory.");
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    if (restoreDataFileFromBackup()) {
      return;
    }

    const initialPayload = JSON.stringify(createEmptyStore(), null, 2);
    fs.writeFileSync(DATA_FILE, initialPayload, "utf8");
    writeBackupSnapshot(initialPayload);
  }
}

function readStore() {
  ensureDataFile();

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return normalizeStore(parsed);
  } catch (error) {
    if (restoreDataFileFromBackup()) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      return normalizeStore(parsed);
    }

    throw error;
  }
}

function writeStore(store, options = {}) {
  const nextStore = normalizeStore(store);
  const payload = JSON.stringify(nextStore, null, 2);
  const tempFile = `${DATA_FILE}.tmp`;

  fs.writeFileSync(tempFile, payload, "utf8");
  fs.renameSync(tempFile, DATA_FILE);
  writeBackupSnapshot(payload);

  if (options.telegramReason) {
    queueTelegramBackup(nextStore, options.telegramReason);
  }
}

function normalizeStore(store) {
  const submissions = Array.isArray(store?.submissions) ? store.submissions : [];
  const blockedWords = Array.isArray(store?.blockedWords)
    ? store.blockedWords.map((word) => sanitizeBlockedWord(word)).filter(Boolean)
    : [...DEFAULT_BLOCKED_WORDS];

  return {
    submissions,
    blockedWords: [...new Set(blockedWords)],
    currentSessionId: store?.currentSessionId || submissions[0]?.sessionId || null,
    sessionStartedAt: store?.sessionStartedAt || submissions[0]?.createdAt || null,
    sessionExportedAt: store?.sessionExportedAt || null,
    sessionAutoArchivedAt: store?.sessionAutoArchivedAt || null,
    lastSubmissionAt: store?.lastSubmissionAt || submissions.at(-1)?.createdAt || null,
    updatedAt: store?.updatedAt || new Date().toISOString()
  };
}

function writeBackupSnapshot(payload) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const timestampStamp = formatSessionStamp(new Date().toISOString());
  const backupFile = path.join(BACKUP_DIR, `submissions-${dateStamp}.json`);
  const historyBackupFile = path.join(BACKUP_DIR, `submissions-${timestampStamp}.json`);
  fs.writeFileSync(backupFile, payload, "utf8");
  fs.writeFileSync(LATEST_BACKUP_FILE, payload, "utf8");
  fs.writeFileSync(historyBackupFile, payload, "utf8");
}

function canSendTelegramBackup() {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

async function sendTelegramBackup(store, reason) {
  if (!canSendTelegramBackup()) {
    return;
  }

  const exportedAt = new Date().toISOString();
  const filename = `participants-backup-${formatSessionStamp(exportedAt)}.json`;
  const caption = [
    `Backup reason: ${reason}`,
    `Exported at: ${exportedAt}`,
    `Submissions: ${store.submissions.length}`
  ].join("\n");

  const formData = new FormData();
  formData.append("chat_id", TELEGRAM_CHAT_ID);
  formData.append("caption", caption);
  formData.append(
    "document",
    new Blob([JSON.stringify(store, null, 2)], { type: "application/json" }),
    filename
  );

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Telegram backup failed: ${response.status} ${responseText}`);
  }
}

function queueTelegramBackup(store, reason) {
  sendTelegramBackup(store, reason).catch((error) => {
    console.error("[telegram-backup]", error.message);
  });
}

function createEmptyStore() {
  return {
    submissions: [],
    blockedWords: DEFAULT_BLOCKED_WORDS,
    currentSessionId: null,
    sessionStartedAt: null,
    sessionExportedAt: null,
    sessionAutoArchivedAt: null,
    lastSubmissionAt: null,
    updatedAt: new Date().toISOString()
  };
}

function getBackupCandidates() {
  const backupFiles = fs
    .readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith("submissions-") && entry.name.endsWith(".json"))
    .map((entry) => ({
      filePath: path.join(BACKUP_DIR, entry.name),
      mtimeMs: fs.statSync(path.join(BACKUP_DIR, entry.name)).mtimeMs
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const ordered = [];

  if (fs.existsSync(LATEST_BACKUP_FILE)) {
    ordered.push(LATEST_BACKUP_FILE);
  }

  for (const entry of backupFiles) {
    if (!ordered.includes(entry.filePath)) {
      ordered.push(entry.filePath);
    }
  }

  return ordered;
}

function restoreDataFileFromBackup() {
  for (const backupFile of getBackupCandidates()) {
    try {
      const raw = fs.readFileSync(backupFile, "utf8");
      const parsed = JSON.parse(raw);
      const normalized = normalizeStore(parsed);
      fs.writeFileSync(DATA_FILE, JSON.stringify(normalized, null, 2), "utf8");
      return true;
    } catch (error) {
      continue;
    }
  }

  return false;
}

function formatSessionStamp(timestamp) {
  return String(timestamp || "")
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
}

function getSessionMeta(store) {
  const sessionStartedAt = store.sessionStartedAt || null;
  if (!sessionStartedAt) {
    return {
      startedAt: null,
      endsAt: null,
      isExpired: false,
      hasSubmissions: false,
      exportDownloadedAt: store.sessionExportedAt || null,
      autoArchivedAt: store.sessionAutoArchivedAt || null
    };
  }

  const endsAt = new Date(new Date(sessionStartedAt).getTime() + WISH_RETENTION_MS).toISOString();
  return {
    startedAt: sessionStartedAt,
    endsAt,
    isExpired: Date.now() >= new Date(endsAt).getTime(),
    hasSubmissions: store.submissions.length > 0,
    exportDownloadedAt: store.sessionExportedAt || null,
    autoArchivedAt: store.sessionAutoArchivedAt || null
  };
}

function getCurrentSessionSubmissions(store) {
  if (!store.currentSessionId) {
    return store.sessionStartedAt ? store.submissions : [];
  }

  return store.submissions.filter((submission) => submission.sessionId === store.currentSessionId);
}

function buildSessionExportPayload(store) {
  const session = getSessionMeta(store);
  return {
    sessionId: store.currentSessionId || null,
    sessionStartedAt: session.startedAt,
    sessionEndsAt: session.endsAt,
    exportedAt: new Date().toISOString(),
    submissions: getCurrentSessionSubmissions(store)
  };
}

function buildSessionFilename(store) {
  const session = getSessionMeta(store);
  const startedStamp = formatSessionStamp(session.startedAt || new Date().toISOString());
  const endsStamp = formatSessionStamp(session.endsAt || new Date().toISOString());
  return `session-submissions-${startedStamp}-to-${endsStamp}.json`;
}

function writeSessionArchiveFile(store) {
  if (!getCurrentSessionSubmissions(store).length) {
    return null;
  }

  const filename = buildSessionFilename(store);
  const filePath = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(buildSessionExportPayload(store), null, 2), "utf8");
  return filename;
}

function maybeAutoArchiveExpiredSession(store) {
  const session = getSessionMeta(store);
  if (!session.startedAt || !session.hasSubmissions || !session.isExpired || session.exportDownloadedAt) {
    return store;
  }

  if (session.autoArchivedAt) {
    return store;
  }

  writeSessionArchiveFile(store);
  store.sessionAutoArchivedAt = new Date().toISOString();
  store.updatedAt = new Date().toISOString();
  writeStore(store, { telegramReason: "session auto archive" });
  return store;
}

function resetSessionTracking(store, startedAt) {
  store.currentSessionId = startedAt ? crypto.randomUUID() : null;
  store.sessionStartedAt = startedAt || null;
  store.sessionExportedAt = null;
  store.sessionAutoArchivedAt = null;
}

function rotateExpiredSessionIfNeeded(store) {
  const session = getSessionMeta(store);
  if (!session.startedAt || !session.isExpired) {
    return store;
  }

  const beforeArchiveFlag = store.sessionAutoArchivedAt;
  maybeAutoArchiveExpiredSession(store);
  if (store.sessionAutoArchivedAt !== beforeArchiveFlag) {
    pushResetEvent(store);
  }
  return store;
}

function getWishExpiryMeta(store) {
  const currentSessionSubmissions = getCurrentSessionSubmissions(store);
  const lastSubmissionAt =
    currentSessionSubmissions.at(-1)?.createdAt || store.lastSubmissionAt || null;
  if (!lastSubmissionAt) {
    return { isExpired: false, expiresAt: null };
  }

  const expiresAt = new Date(new Date(lastSubmissionAt).getTime() + WISH_RETENTION_MS).toISOString();
  return {
    isExpired: Date.now() >= new Date(expiresAt).getTime(),
    expiresAt
  };
}

function getVisibleWishes(store) {
  store = rotateExpiredSessionIfNeeded(store);
  const { isExpired, expiresAt } = getWishExpiryMeta(store);
  return {
    wishes: isExpired
      ? []
      : getCurrentSessionSubmissions(store).map((item) => ({
          id: item.id,
          name: item.name,
          wish: item.wish,
          createdAt: item.createdAt
        })),
    expiresAt: isExpired ? null : expiresAt
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(text);
}

function sendDownload(res, filename, content) {
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${filename}"`
  });
  res.end(content);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function sanitizePhone(value) {
  return String(value || "")
    .trim()
    .replace(/[^\d+]/g, "")
    .slice(0, 13);
}

function isValidName(value) {
  return /^[A-Za-zА-Яа-яІіЇїЄєҐґ' -]{2,30}$/.test(value);
}

function isValidPhone(value) {
  return /^\+380\d{9}$/.test(value);
}

function isValidTelegram(value) {
  return /^@?[A-Za-z0-9_]{5,32}$/.test(value);
}

function isValidWish(value) {
  return /^.{2,25}$/.test(value);
}

function sanitizeBlockedWord(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .slice(0, 40);
}

function parseBlockedWordsInput(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => sanitizeBlockedWord(item)).filter(Boolean))];
  }

  return [...new Set(
    String(value || "")
      .split(/[\n,;]+/)
      .map((item) => sanitizeBlockedWord(item))
      .filter(Boolean)
  )];
}

function containsBlockedWord(text, blockedWords) {
  const normalizedText = String(text || "").toLowerCase();
  return blockedWords.find((word) => word && normalizedText.includes(word)) || "";
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon"
  };
  return types[ext] || "application/octet-stream";
}

function serveStatic(reqPath, res) {
  const safePath = reqPath === "/" ? "/index.html" : reqPath;
  const normalized = path.normalize(safePath).replace(/^(\.\.[/\\])+/, "");
  const relativePath = normalized.replace(/^[/\\]/, "");
  const filePath = path.join(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": getMimeType(filePath),
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

function serveImage(reqPath, res) {
  const imageName = decodeURIComponent(reqPath.replace(/^\/img\//, ""));
  const safeName = path.basename(imageName);
  const filePath = path.join(IMAGE_DIR, safeName);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": getMimeType(filePath),
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

function isAuthorized(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Basic ")) {
    return false;
  }

  const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);
  return user === ADMIN_USER && password === ADMIN_PASSWORD;
}

function requireAuth(req, res) {
  if (isAuthorized(req)) {
    return true;
  }

  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Developer access"',
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify({ error: "Unauthorized" }));
  return false;
}

function pushWishEvent(submission) {
  const payload = `data: ${JSON.stringify({
    id: submission.id,
    name: submission.name,
    wish: submission.wish,
    createdAt: submission.createdAt,
    expiresAt: new Date(Date.now() + WISH_RETENTION_MS).toISOString()
  })}\n\n`;

  for (const client of clients) {
    client.write(payload);
  }
}

function pushResetEvent(store) {
  const visible = getVisibleWishes(store);
  const payload = `data: ${JSON.stringify({
    type: "bootstrap",
    wishes: visible.wishes,
    expiresAt: visible.expiresAt
  })}\n\n`;

  for (const client of clients) {
    client.write(payload);
  }
}

function handleSubmit(req, res) {
  parseBody(req)
    .then((body) => {
      const submission = {
        id: crypto.randomUUID(),
        name: sanitizeText(body.name, 30),
        phone: sanitizePhone(body.phone),
        telegram: sanitizeText(body.telegram, 33),
        wish: sanitizeText(body.wish, 25),
        createdAt: new Date().toISOString()
      };

      if (!submission.name || !submission.phone || !submission.telegram || !submission.wish) {
        sendJson(res, 400, { error: "Fill in all fields." });
        return;
      }

      if (!isValidPhone(submission.phone)) {
        sendJson(res, 400, { error: "Phone must match +380XXXXXXXXX." });
        return;
      }

      if (!isValidName(submission.name)) {
        sendJson(res, 400, { error: "Name must be 2-30 letters without digits." });
        return;
      }

      if (!isValidTelegram(submission.telegram)) {
        sendJson(res, 400, { error: "Telegram username must be 5-32 characters." });
        return;
      }

      if (!isValidWish(submission.wish)) {
        sendJson(res, 400, { error: "Wish must be 2-25 characters." });
        return;
      }

      submission.telegram = submission.telegram.replace(/^@?/, "@");

      const store = readStore();
      rotateExpiredSessionIfNeeded(store);
      if (!store.sessionStartedAt || getSessionMeta(store).isExpired) {
        resetSessionTracking(store, submission.createdAt);
      }
      const blockedWord = containsBlockedWord(submission.wish, store.blockedWords);
      if (blockedWord) {
        sendJson(res, 400, { error: "Wish contains forbidden words." });
        return;
      }

      submission.sessionId = store.currentSessionId;
      store.submissions.push(submission);
      store.lastSubmissionAt = submission.createdAt;
      store.updatedAt = new Date().toISOString();
      writeStore(store, { telegramReason: "new participant submission" });
      pushWishEvent(submission);

      sendJson(res, 201, { ok: true, submissionId: submission.id });
    })
    .catch(() => {
      sendJson(res, 400, { error: "Could not process form." });
    });
}

function handleStream(res) {
  const store = readStore();
  const visible = getVisibleWishes(store);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  res.write(`data: ${JSON.stringify({
    type: "bootstrap",
    wishes: visible.wishes,
    expiresAt: visible.expiresAt
  })}\n\n`);

  clients.add(res);
  res.on("close", () => {
    clients.delete(res);
  });
}

function handleAdminSettingsGet(req, res) {
  if (!requireAuth(req, res)) {
    return;
  }

  const store = maybeAutoArchiveExpiredSession(readStore());
  sendJson(res, 200, { blockedWords: store.blockedWords });
}

function handlePublicBlockedWords(req, res) {
  const store = maybeAutoArchiveExpiredSession(readStore());
  sendJson(res, 200, { blockedWords: store.blockedWords });
}

function handleAdminSessionGet(req, res) {
  if (!requireAuth(req, res)) {
    return;
  }

  const store = maybeAutoArchiveExpiredSession(readStore());
  sendJson(res, 200, {
    session: getSessionMeta(store),
    submissionsCount: getCurrentSessionSubmissions(store).length
  });
}

function handleAdminSettingsUpdate(req, res) {
  if (!requireAuth(req, res)) {
    return;
  }

  parseBody(req)
    .then((body) => {
      const store = readStore();
      store.blockedWords = parseBlockedWordsInput(body.blockedWords);
      store.updatedAt = new Date().toISOString();
      writeStore(store);
      sendJson(res, 200, { ok: true, blockedWords: store.blockedWords });
    })
    .catch(() => {
      sendJson(res, 400, { error: "Could not update settings." });
    });
}

function handleAdminDeleteSubmission(req, res, submissionId) {
  if (!requireAuth(req, res)) {
    return;
  }

  const store = readStore();
  const nextSubmissions = store.submissions.filter((entry) => entry.id !== submissionId);

  if (nextSubmissions.length === store.submissions.length) {
    sendJson(res, 404, { error: "Submission not found." });
    return;
  }

  store.submissions = nextSubmissions;
  if (!nextSubmissions.length) {
    resetSessionTracking(store, null);
  }
  store.lastSubmissionAt = nextSubmissions.at(-1)?.createdAt || null;
  store.updatedAt = new Date().toISOString();
  writeStore(store, { telegramReason: "participant deleted from admin" });
  pushResetEvent(store);

  sendJson(res, 200, { ok: true });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && requestUrl.pathname === "/api/submit") {
    handleSubmit(req, res);
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/wishes-stream") {
    handleStream(res);
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/admin/submissions") {
    if (!requireAuth(req, res)) {
      return;
    }
    sendJson(res, 200, maybeAutoArchiveExpiredSession(readStore()));
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/admin/session") {
    handleAdminSessionGet(req, res);
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/admin/settings") {
    handleAdminSettingsGet(req, res);
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/admin/export") {
    if (!requireAuth(req, res)) {
      return;
    }

    const store = maybeAutoArchiveExpiredSession(readStore());
    const exportPayload = JSON.stringify(buildSessionExportPayload(store), null, 2);
    store.sessionExportedAt = new Date().toISOString();
    store.updatedAt = new Date().toISOString();
    writeStore(store);
    sendDownload(res, buildSessionFilename(store), exportPayload);
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/admin/settings") {
    handleAdminSettingsUpdate(req, res);
    return;
  }

  if (req.method === "DELETE" && requestUrl.pathname.startsWith("/api/admin/submissions/")) {
    const submissionId = decodeURIComponent(requestUrl.pathname.replace("/api/admin/submissions/", ""));
    handleAdminDeleteSubmission(req, res, submissionId);
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/settings/blocked-words") {
    handlePublicBlockedWords(req, res);
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/healthz") {
    sendText(res, 200, "ok");
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/admin") {
    if (!requireAuth(req, res)) {
      return;
    }
    serveStatic("/admin.html", res);
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/img/")) {
    serveImage(requestUrl.pathname, res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(requestUrl.pathname, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Admin page: http://localhost:${PORT}/admin`);
});
