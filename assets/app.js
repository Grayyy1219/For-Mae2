(() => {
  const PAGE = document.body.getAttribute("data-page") || "home";
  const STORAGE_UNLOCKED = "mtc_unlocked_months";
  const STORAGE_OVERRIDE = "mtc_capsules_override";
  const STORAGE_AUDIO_PREF = "mtc_bg_audio_enabled";
  const STORAGE_USER_ID = "mtc_user_id";
  const STORAGE_LAST_OPEN_MONTH = "mtc_last_open_month";
  const STORAGE_DISPLAY_NAME = "mtc_display_name";
  const STORAGE_AUTH_SESSION = "mtc_auth_session";
  const FIREBASE_DB_URL =
    "https://for-mae-default-rtdb.asia-southeast1.firebasedatabase.app";
  let CURRENT_SETTINGS = null;
  let ACTIVE_PROFILE = null;
  let PROFILE_SYNC_TIMER = null;
  let CURRENT_CAPSULE_MONTH = null;

  const DEFAULT_SETTINGS = {
    siteTitle: "Time-Capsule",
    brandText: "❤️ For Mae",
    favicon: "assets/favicon.svg",
    theme: { accent: "#8b5cf6", accent2: "#c4b5fd", ringFill: "#a78bfa" },
    heartEmoji: "❤️",
    homeHeadline: "Open this month’s capsule",
    homeSubhead:
      "Tara, open this month’s surprise. Mahal kita, today and always.",
    openButtonText: "Open",
    footerText: "Happy Monthsary, Love! • Made with Grayyy",
    capsuleGreeting: "Happy Monthsary, Mi!",
    statusIcons: { unlocked: "❤️", ready: "💌", locked: "🔒" },
    statusText: { unlocked: "Opened", ready: "Ready", locked: "Coming Soon" },
    countdownLabel: "Opens in",
    confettiColors: ["#8b5cf6", "#a78bfa", "#c4b5fd", "#60a5fa", "#f472b6"],
  };

  function mergeSettings(s) {
    s = s || {};
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      theme: { ...DEFAULT_SETTINGS.theme, ...(s.theme || {}) },
      statusIcons: {
        ...DEFAULT_SETTINGS.statusIcons,
        ...(s.statusIcons || {}),
      },
      confettiColors:
        Array.isArray(s.confettiColors) && s.confettiColors.length
          ? s.confettiColors
          : DEFAULT_SETTINGS.confettiColors,
      mediaBackgroundMode:
        s.mediaBackgroundMode === "slideshow" ? "slideshow" : "collage",
    };
  }

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const now = () => new Date();
  const pad2 = (n) => n.toString().padStart(2, "0");
  const parseISO = (s) => new Date(s);
  const addMonths = (date, months) => {
    const d = new Date(date.getTime());
    const targetMonth = d.getMonth() + months;
    const day = d.getDate();
    d.setMonth(targetMonth, 1);
    const lastDayOfTarget = new Date(
      d.getFullYear(),
      d.getMonth() + 1,
      0
    ).getDate();
    d.setDate(Math.min(day, lastDayOfTarget));
    return d;
  };

  let PATCH_NOTES_CACHE = null;

  function escapeHTML(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return map[c] || c;
    });
  }

  const parseList = (value) =>
    (value || "")
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

  const songTitleCache = new Map();

  async function fetchFirebaseJSON(path) {
    if (!FIREBASE_DB_URL) return null;
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
        cache: "no-store",
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function writeFirebaseJSON(path, payload, method = "PUT") {
    if (!FIREBASE_DB_URL) return null;
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function getUserId() {
    try {
      const stored = localStorage.getItem(STORAGE_USER_ID);
      if (stored) return stored;
      const id =
        window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : `user_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(STORAGE_USER_ID, id);
      return id;
    } catch {
      return `user_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  }

  function saveLastOpenMonth(monthId, { sync = true } = {}) {
    try {
      localStorage.setItem(STORAGE_LAST_OPEN_MONTH, String(monthId));
    } catch {}
    if (sync) scheduleProfileSync();
  }

  async function fetchSongTitle(url) {
    if (!url) return "";
    if (songTitleCache.has(url)) return songTitleCache.get(url);

    let title = "";
    try {
      const res = await fetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
      );
      if (res.ok) {
        const data = await res.json();
        title = data.title || "";
      }
    } catch {}

    songTitleCache.set(url, title);
    return title;
  }

  function formatCountdown(ms) {
    if (ms <= 0) return "00:00:00";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  function formatCountdownSmart(ms) {
    const dayMs = 24 * 60 * 60 * 1000;
    if (ms >= dayMs) {
      const d = Math.floor(ms / dayMs);
      return d === 1 ? "1 day" : `${d} days`;
    }
    return formatCountdown(ms);
  }

  function isYearEndDay(date = now()) {
    return date.getMonth() === 11 && date.getDate() === 31;
  }

  function loadUnlocked() {
    try {
      const raw = localStorage.getItem(STORAGE_UNLOCKED);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw));
    } catch {
      return new Set();
    }
  }
  function saveUnlocked(set, { sync = true } = {}) {
    localStorage.setItem(STORAGE_UNLOCKED, JSON.stringify(Array.from(set)));
    if (sync) scheduleProfileSync();
  }
  function loadAudioPreference() {
    try {
      const stored = localStorage.getItem(STORAGE_AUDIO_PREF);
      if (stored === null) return true;
      return stored === "1";
    } catch {
      return true;
    }
  }

  function saveAudioPreference(enabled, { sync = true } = {}) {
    try {
      localStorage.setItem(STORAGE_AUDIO_PREF, enabled ? "1" : "0");
    } catch {}
    if (sync) scheduleProfileSync();
  }

  function normalizeDisplayName(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toFirebaseKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[.#$/\[\]]/g, "_")
      .trim();
  }

  function getStoredDisplayName() {
    try {
      return localStorage.getItem(STORAGE_DISPLAY_NAME);
    } catch {
      return null;
    }
  }

  function storeDisplayName(name) {
    try {
      localStorage.setItem(STORAGE_DISPLAY_NAME, name);
    } catch {}
  }

  function setActiveProfile(displayName, pinHash) {
    ACTIVE_PROFILE = {
      displayName,
      key: toFirebaseKey(displayName),
      pinHash,
    };
  }

  async function hashPin(pin) {
    if (window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(pin);
      const hash = await window.crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    return btoa(pin);
  }

  function buildProfilePayload({ displayName, pinHash } = {}) {
    const name = displayName || ACTIVE_PROFILE?.displayName;
    const hash = pinHash || ACTIVE_PROFILE?.pinHash;
    const unlocked = Array.from(loadUnlocked());
    let lastOpenMonth = null;
    try {
      lastOpenMonth = localStorage.getItem(STORAGE_LAST_OPEN_MONTH);
    } catch {}
    return {
      displayName: name,
      pinHash: hash,
      audioEnabled: loadAudioPreference(),
      capsuleState: {
        unlockedMonths: unlocked,
        lastOpenMonth: lastOpenMonth ? Number(lastOpenMonth) : null,
        currentMonth: CURRENT_CAPSULE_MONTH || null,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  function applyRemoteProfile(profile) {
    if (!profile || typeof profile !== "object") return;
    const unlocked = new Set(profile.capsuleState?.unlockedMonths || []);
    saveUnlocked(unlocked, { sync: false });
    if (profile.capsuleState?.lastOpenMonth) {
      saveLastOpenMonth(profile.capsuleState.lastOpenMonth, { sync: false });
    }
    if (typeof profile.audioEnabled === "boolean") {
      saveAudioPreference(profile.audioEnabled, { sync: false });
    }
    CURRENT_CAPSULE_MONTH = profile.capsuleState?.currentMonth || null;
  }

  function scheduleProfileSync() {
    if (!ACTIVE_PROFILE) return;
    if (PROFILE_SYNC_TIMER) {
      window.clearTimeout(PROFILE_SYNC_TIMER);
    }
    PROFILE_SYNC_TIMER = window.setTimeout(() => {
      syncProfileData();
    }, 400);
  }

  async function syncProfileData() {
    if (!ACTIVE_PROFILE) return;
    const payload = buildProfilePayload();
    await writeFirebaseJSON(
      `userProfiles/${ACTIVE_PROFILE.key}`,
      payload,
      "PUT"
    );
  }

  async function fetchUserProfile(displayName) {
    const key = toFirebaseKey(displayName);
    if (!key) return null;
    return await fetchFirebaseJSON(`userProfiles/${key}`);
  }

  function createAuthModal() {
    let modal = document.getElementById("authModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "auth-modal";
    modal.id = "authModal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="auth-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="authModalTitle" tabindex="-1">
        <header class="auth-modal__header">
          <p class="auth-modal__eyebrow">Welcome</p>
          <h2 class="auth-modal__title" id="authModalTitle">Let’s set up your profile</h2>
          <p class="auth-modal__subtitle" id="authModalSubtitle">Enter a unique display name to begin.</p>
        </header>
        <form class="auth-modal__form">
          <label class="auth-modal__field">
            <span>Display name</span>
            <input type="text" name="displayName" autocomplete="nickname" placeholder="e.g., Mae" required />
          </label>
          <label class="auth-modal__field auth-modal__pin-field is-hidden">
            <span id="authPinLabel">Set a numeric PIN</span>
            <input type="password" name="pin" inputmode="numeric" pattern="[0-9]*" placeholder="4-12 digits" minlength="4" maxlength="12" />
          </label>
          <p class="auth-modal__error" role="alert"></p>
          <button class="btn btn-primary auth-modal__submit" type="submit">Continue</button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  async function ensureUserProfile() {
    const storedName = getStoredDisplayName();
    const sessionOk =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(STORAGE_AUTH_SESSION) === "1";

    if (sessionOk && storedName) {
      const profile = await fetchUserProfile(storedName);
      if (profile?.pinHash) {
        setActiveProfile(storedName, profile.pinHash);
        applyRemoteProfile(profile);
        return;
      }
    }

    return new Promise((resolve) => {
      const modal = createAuthModal();
      const dialog = modal.querySelector(".auth-modal__dialog");
      const form = modal.querySelector(".auth-modal__form");
      const nameInput = form.querySelector('input[name="displayName"]');
      const pinField = form.querySelector(".auth-modal__pin-field");
      const pinInput = form.querySelector('input[name="pin"]');
      const pinLabel = form.querySelector("#authPinLabel");
      const errorEl = form.querySelector(".auth-modal__error");
      const submitBtn = form.querySelector(".auth-modal__submit");
      const subtitle = modal.querySelector("#authModalSubtitle");

      let mode = "identify";
      let loadedProfile = null;

      const setError = (msg) => {
        if (errorEl) errorEl.textContent = msg || "";
      };

      const showPinField = (labelText) => {
        if (pinLabel) pinLabel.textContent = labelText;
        pinField?.classList.remove("is-hidden");
        if (pinInput) {
          pinInput.value = "";
          pinInput.required = true;
        }
      };

      const resetFlow = () => {
        mode = "identify";
        loadedProfile = null;
        submitBtn.textContent = "Continue";
        subtitle.textContent = "Enter a unique display name to begin.";
        setError("");
        pinField?.classList.add("is-hidden");
        if (pinInput) {
          pinInput.value = "";
          pinInput.required = false;
        }
      };

      if (storedName && nameInput) {
        nameInput.value = storedName;
      }

      nameInput?.addEventListener("input", () => {
        resetFlow();
      });

      const showModal = () => {
        modal.classList.add("is-visible");
        modal.setAttribute("aria-hidden", "false");
        document.documentElement.classList.add("auth-locked");
        document.body.classList.add("auth-locked");
        if (dialog && typeof dialog.focus === "function") {
          dialog.focus({ preventScroll: true });
        }
      };

      const hideModal = () => {
        modal.classList.remove("is-visible");
        modal.setAttribute("aria-hidden", "true");
        document.documentElement.classList.remove("auth-locked");
        document.body.classList.remove("auth-locked");
      };

      form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError("");
        const displayName = normalizeDisplayName(nameInput?.value || "");
        if (!displayName) {
          setError("Please enter a display name.");
          return;
        }
        if (mode === "identify") {
          submitBtn.textContent = "Checking…";
          const profile = await fetchUserProfile(displayName);
          if (profile?.pinHash) {
            mode = "verify";
            loadedProfile = profile;
            subtitle.textContent = "Welcome back! Enter your PIN to continue.";
            submitBtn.textContent = "Unlock";
            showPinField("Enter your PIN");
            pinInput?.focus();
          } else {
            mode = "create";
            loadedProfile = null;
            subtitle.textContent = "Set a numeric PIN to secure your profile.";
            submitBtn.textContent = "Create profile";
            showPinField("Set a numeric PIN");
            pinInput?.focus();
          }
          return;
        }

        const pin = String(pinInput?.value || "").trim();
        if (!/^[0-9]{4,12}$/.test(pin)) {
          setError("PIN must be 4–12 digits.");
          submitBtn.textContent =
            mode === "verify" ? "Unlock" : "Create profile";
          return;
        }
        submitBtn.textContent = mode === "verify" ? "Unlocking…" : "Creating…";
        const pinHash = await hashPin(pin);
        if (mode === "verify") {
          if (!loadedProfile || pinHash !== loadedProfile.pinHash) {
            setError("Incorrect PIN. Please try again.");
            submitBtn.textContent = "Unlock";
            return;
          }
          storeDisplayName(displayName);
          setActiveProfile(displayName, loadedProfile.pinHash);
          applyRemoteProfile(loadedProfile);
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(STORAGE_AUTH_SESSION, "1");
          }
          hideModal();
          resolve();
          return;
        }

        const payload = buildProfilePayload({
          displayName,
          pinHash,
        });
        payload.createdAt = new Date().toISOString();
        await writeFirebaseJSON(
          `userProfiles/${toFirebaseKey(displayName)}`,
          payload,
          "PUT"
        );
        storeDisplayName(displayName);
        setActiveProfile(displayName, pinHash);
        applyRemoteProfile(payload);
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(STORAGE_AUTH_SESSION, "1");
        }
        hideModal();
        resolve();
      });

      showModal();
    });
  }

  async function fetchRepliesForMonth(monthId) {
    const data = await fetchFirebaseJSON(`replies/${monthId}`);
    if (!data || typeof data !== "object") return [];
    const replies = [];
    Object.entries(data).forEach(([userId, entries]) => {
      if (!entries || typeof entries !== "object") return;
      Object.entries(entries).forEach(([replyId, reply]) => {
        if (!reply || typeof reply !== "object") return;
        replies.push({ id: replyId, userId, ...reply });
      });
    });
    return replies.sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return aTime - bTime;
    });
  }

  function normalizeReplyImages(reply) {
    if (!reply) return [];
    if (Array.isArray(reply.imageUrls)) {
      return reply.imageUrls.filter(Boolean);
    }
    if (reply.imageUrl) return [reply.imageUrl];
    return [];
  }

  function setupAudioToggle() {
    const toggle = document.getElementById("bgAudioToggle");
    const container = toggle ? toggle.closest(".audio-toggle") : null;
    const audio = document.getElementById("bgAudio");
    if (!toggle || !audio) return;

    audio.volume = 0.4;

    const updateVisual = (enabled) => {
      if (container) container.classList.toggle("is-active", enabled);
    };

    const applyState = (enabled, { persist = true } = {}) => {
      updateVisual(enabled);
      if (persist) saveAudioPreference(enabled);

      if (enabled) {
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {
            toggle.checked = false;
            updateVisual(false);
            saveAudioPreference(false);
          });
        }
      } else {
        audio.pause();
      }
    };

    const initial = loadAudioPreference();
    toggle.checked = initial;
    applyState(initial, { persist: false });

    toggle.addEventListener("change", () => {
      applyState(toggle.checked);
    });
  }
  function softBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 660;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.2);
      setTimeout(() => ctx.close(), 300);
    } catch {}
  }
  function drawHeart(ctx, size, color) {
    const s = size;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -0.25 * s);
    ctx.bezierCurveTo(0, -0.5 * s, -0.5 * s, -0.5 * s, -0.5 * s, -0.1 * s);
    ctx.bezierCurveTo(-0.5 * s, 0.3 * s, 0, 0.55 * s, 0, 0.8 * s);
    ctx.bezierCurveTo(0, 0.55 * s, 0.5 * s, 0.3 * s, 0.5 * s, -0.1 * s);
    ctx.bezierCurveTo(0.5 * s, -0.5 * s, 0, -0.5 * s, 0, -0.25 * s);
    ctx.closePath();
    ctx.fill();
  }

  function confettiBurst() {
    const canvas = $("#confettiCanvas");
    if (!canvas) return;
    +(+canvas.classList.add("is-active"));

    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const { innerWidth: W, innerHeight: H } = window;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.scale(dpr, dpr);

    const colors = (CURRENT_SETTINGS && CURRENT_SETTINGS.confettiColors) || [
      "#8b5cf6",
      "#a78bfa",
      "#c4b5fd",
      "#60a5fa",
      "#f472b6",
    ];

    const initial = 80;
    const parts = Array.from({ length: initial }, () => ({}));
    const emitFor = 180;
    const perFrame = 2;

    let t = 0;
    const maxT = 160;
    const fadeFrames = 80;

    function tick() {
      t++;
      ctx.clearRect(0, 0, W, H);
      if (t < emitFor) {
        for (let k = 0; k < perFrame; k++) {
          parts.push({
            x: Math.random() * W,
            y: -20 + Math.random() * 20,
            vx: -2 + Math.random() * 4,
            vy: 0.6 + Math.random() * 1.6,
            s: 8 + Math.random() * 10,
            rot: Math.random() * Math.PI,
            vr: -0.15 + Math.random() * 0.3,
            col: colors[(Math.random() * colors.length) | 0],
          });
        }
      }

      const alpha = t <= maxT ? 1 : Math.max(0, 1 - (t - maxT) / fadeFrames);
      ctx.globalAlpha = alpha;

      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.115;
        p.vx *= 0.995;
        p.vy *= 0.997;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        drawHeart(ctx, p.s, p.col);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      if (t < maxT + fadeFrames) {
        requestAnimationFrame(tick);
      } else {
        canvas.classList.remove("is-active");
        setTimeout(() => {
          ctx.clearRect(0, 0, W, H);
        }, 400);
      }
    }
    tick();
  }

  async function loadData() {
    try {
      const override = localStorage.getItem(STORAGE_OVERRIDE);
      if (override) return JSON.parse(override);
    } catch {}

    try {
      const firebaseData = await fetchFirebaseJSON("capsules");
      if (firebaseData) return firebaseData;
    } catch {}

    const today = new Date();
    const startDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const months = Array.from({ length: 12 }).map((_, i) => ({
      id: i + 1,
      title: `Month ${i + 1}`,
      letter: `Mi,\n\nHappy month ${
        i + 1
      }! Little note goes here.\n\n– Grayyy ❤️`,
      photos: [],
      voiceNote: "",
      surprise:
        i === 0 ? "Coffee date coupon ☕" : "Tiny surprise coming soon ✨",
      songsAdded: i === 0 ? ["https://open.spotify.com/"] : [],
      placesVisited: i === 0 ? ["Our favorite cafe"] : [],
    }));
    return {
      startDate: startDate.toISOString(),
      months,
      settings: DEFAULT_SETTINGS,
    };
  }

  async function loadPatchNotes() {
    if (PATCH_NOTES_CACHE) return PATCH_NOTES_CACHE;

    try {
      const firebaseNotes = await fetchFirebaseJSON("patchNotes");
      if (firebaseNotes) {
        const notes = Array.isArray(firebaseNotes?.notes)
          ? firebaseNotes.notes
          : Array.isArray(firebaseNotes)
          ? firebaseNotes
          : [];
        PATCH_NOTES_CACHE = notes;
        return notes;
      }
    } catch (err) {
      console.error("Failed to load patch notes from Firebase", err);
    }

    PATCH_NOTES_CACHE = [];
    return PATCH_NOTES_CACHE;
  }

  function ensureUnlockDates(data) {
    const start = data.startDate ? parseISO(data.startDate) : now();
    const anchorDay = start.getDate();
    const baseYear = start.getFullYear();
    data.months = (data.months || []).map((m, i) => {
      if (!m.unlockDate) {
        const lastDay = new Date(baseYear, i + 1, 0).getDate();
        const day = Math.min(anchorDay, lastDay);
        const d = new Date(baseYear, i, day, 0, 0, 1, 0);
        m.unlockDate = d.toISOString();
      }
      return m;
    });
    return data;
  }

  function setRingProgress(unlockedCount) {
    const progress = Math.max(0, Math.min(12, unlockedCount));
    const deg = (progress / 12) * 360;
    const el = $("#ringProgress");
    if (el)
      el.style.background = `conic-gradient(var(--ring-fill) 0deg ${deg}deg, transparent ${deg}deg 360deg)`;
    const txt = $("#progressCount");
    if (txt) txt.textContent = String(progress);
  }

  function applySettings(settings) {
    try {
      document.title = settings.siteTitle || document.title;
    } catch {}

    try {
      const link = document.querySelector('link[rel="icon"]');
      if (link && settings.favicon) link.href = settings.favicon;
    } catch {}

    try {
      const root = document.documentElement;
      if (settings.theme?.accent)
        root.style.setProperty("--accent", settings.theme.accent);
      if (settings.theme?.accent2)
        root.style.setProperty("--accent-2", settings.theme.accent2);
      if (settings.theme?.ringFill)
        root.style.setProperty("--ring-fill", settings.theme.ringFill);
    } catch {}

    const brand = $(".brand");
    if (brand && settings.brandText) brand.textContent = settings.brandText;

    const foot = $(".site-footer small");
    if (foot && settings.footerText) foot.textContent = settings.footerText;
    if (PAGE === "home") {
      const hl = $(".headline");
      if (hl && settings.homeHeadline) hl.textContent = settings.homeHeadline;
      const sh = $(".subhead");
      if (sh && settings.homeSubhead) sh.textContent = settings.homeSubhead;
      const btn = $("#openCurrent");
      if (btn && settings.openButtonText)
        btn.textContent = settings.openButtonText;
      const heart = $(".heart");
      if (heart && settings.heartEmoji) heart.textContent = settings.heartEmoji;
      const cdl = $("#countdownLabel");
      if (cdl) cdl.textContent = settings.countdownLabel || "Opens in";
    }
  }

  const MEDIA_EXT_VIDEO = /\.(mp4|webm|ogg)(\?.*)?$/i;
  const MEDIA_BG_SLIDE_INTERVAL = 7000;
  let mediaBgTimer = null;

  function createBackgroundMedia(src, { autoplay = false } = {}) {
    const isVideo = MEDIA_EXT_VIDEO.test(src);
    const media = document.createElement(isVideo ? "video" : "img");
    media.className = "media-bg__media";
    media.setAttribute("aria-hidden", "true");
    media.addEventListener("error", () => {
      const parent = media.parentElement;
      if (parent) parent.remove();
    });

    if (isVideo) {
      media.src = src;
      media.loop = true;
      media.muted = true;
      media.playsInline = true;
      media.preload = "auto";
      if (autoplay) {
        media.autoplay = true;
        media.addEventListener("loadeddata", () => {
          if (typeof media.play === "function") {
            media.play().catch(() => {});
          }
        });
      }
    } else {
      media.src = src;
      media.loading = "lazy";
      media.decoding = "async";
      media.alt = "";
    }

    return media;
  }
  function normalizeMediaSrc(src) {
    if (typeof src !== "string") return "";
    return src.replace(/\\\\/g, "/").trim();
  }

  function collectMediaSources(data) {
    const seen = new Set();
    if (!data || !Array.isArray(data.months)) return [];
    data.months.forEach((month) => {
      if (!month || !Array.isArray(month.photos)) return;
      month.photos.forEach((raw) => {
        const normalized = normalizeMediaSrc(raw);
        if (!normalized) return;
        if (!seen.has(normalized)) seen.add(normalized);
      });
    });
    return Array.from(seen);
  }

  function initMediaBackground(data) {
    if (!(PAGE === "home" || PAGE === "admin")) return;
    const sources = collectMediaSources(data);
    if (!sources.length) return;
    const settingsForBackground = mergeSettings((data && data.settings) || {});
    const rawMode = (settingsForBackground.mediaBackgroundMode || "collage")
      .toLowerCase()
      .trim();
    const mode = rawMode === "slideshow" ? "slideshow" : "collage";

    let container = document.querySelector(".media-bg");
    if (!container) {
      container = document.createElement("div");
      container.className = "media-bg";

      const grid = document.createElement("div");
      grid.className = "media-bg__grid";
      container.appendChild(grid);

      const slideshow = document.createElement("div");
      slideshow.className = "media-bg__slideshow";
      container.appendChild(slideshow);

      const overlay = document.createElement("div");
      overlay.className = "media-bg__overlay";
      container.appendChild(overlay);

      document.body.prepend(container);
    } else {
      if (!container.querySelector(".media-bg__grid")) {
        const grid = document.createElement("div");
        grid.className = "media-bg__grid";
        container.insertBefore(grid, container.firstChild);
      }
      if (!container.querySelector(".media-bg__slideshow")) {
        const slideshow = document.createElement("div");
        slideshow.className = "media-bg__slideshow";
        const overlay = container.querySelector(".media-bg__overlay");
        if (overlay) container.insertBefore(slideshow, overlay);
        else container.appendChild(slideshow);
      }
      if (!container.querySelector(".media-bg__overlay")) {
        const overlay = document.createElement("div");
        overlay.className = "media-bg__overlay";
        container.appendChild(overlay);
      }
    }

    container.dataset.mode = mode;

    const grid = container.querySelector(".media-bg__grid");
    const slideshow = container.querySelector(".media-bg__slideshow");
    if (grid) grid.innerHTML = "";
    if (slideshow) slideshow.innerHTML = "";

    if (mediaBgTimer) {
      clearInterval(mediaBgTimer);
      mediaBgTimer = null;
    }

    if (mode === "slideshow") {
      if (!slideshow) return;
      const slides = [];
      sources.forEach((src) => {
        const slide = document.createElement("div");
        slide.className = "media-bg__slide";
        const media = createBackgroundMedia(src, { autoplay: false });
        slide.appendChild(media);
        slideshow.appendChild(slide);
        slides.push(slide);
      });

      if (!slides.length) return;

      const activate = (index) => {
        slides.forEach((slide, idx) => {
          const active = idx === index;
          slide.classList.toggle("is-active", active);
          const vid = slide.querySelector("video");
          if (vid) {
            if (active) {
              const playVideo = () => {
                try {
                  vid.currentTime = 0;
                } catch {}
                if (typeof vid.play === "function") {
                  vid.play().catch(() => {});
                }
              };
              if (vid.readyState >= 2) playVideo();
              else
                vid.addEventListener("loadeddata", playVideo, { once: true });
            } else {
              try {
                vid.pause();
              } catch {}
            }
          }
        });
      };

      let current = 0;
      activate(current);

      if (slides.length > 1) {
        mediaBgTimer = window.setInterval(() => {
          current = (current + 1) % slides.length;
          activate(current);
        }, MEDIA_BG_SLIDE_INTERVAL);
      }
    } else {
      if (!grid) return;
      sources.forEach((src) => {
        const item = document.createElement("div");
        item.className = "media-bg__item";
        const media = createBackgroundMedia(src, { autoplay: true });
        item.appendChild(media);
        grid.appendChild(item);
      });
    }
  }

  function iconFor(val) {
    try {
      if (!val) return "";
      if (/^(https?:|data:)/i.test(val)) {
        return `<img class="icon" src="${val}" alt="" />`;
      }
      return String(val);
    } catch {
      return "";
    }
  }

  function statusTextFor(status) {
    try {
      const map =
        (CURRENT_SETTINGS && CURRENT_SETTINGS.statusText) ||
        DEFAULT_SETTINGS.statusText;
      if (status === "Unlocked") return map.unlocked || "Opened";
      if (status === "Ready") return map.ready || "Open";
      return map.locked || "Coming Soon";
    } catch {
      return status;
    }
  }

  function monthCountSince(start, date) {
    let a = start.getFullYear() * 12 + start.getMonth();
    let b = date.getFullYear() * 12 + date.getMonth();
    let diff = b - a;

    if (date.getDate() < start.getDate()) diff -= 1;
    return Math.max(0, diff);
  }

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function displayTitleForMonth(m, data) {
    try {
      const start = data.startDate ? parseISO(data.startDate) : now();
      const unlock = parseISO(m.unlockDate);
      const months = monthCountSince(start, unlock);
      const monthName = unlock.toLocaleDateString(undefined, {
        month: "long",
      });
      const displayOrder = ordinal(months + 1);

      if (months > 0 && months % 12 === 0) {
        const years = Math.floor(months / 12);
        return `${monthName} “${ordinal(years)} Anniversary”`;
      }
      return `${monthName} “${displayOrder}”`;
    } catch {
      return m.title || "Month";
    }
  }

  let activeProgressMarker = null;
  let progressTooltip = null;

  function ensureProgressTooltip() {
    if (!progressTooltip) {
      progressTooltip = document.createElement("div");
      progressTooltip.id = "progressTooltip";
      progressTooltip.className = "progress-tooltip";
      progressTooltip.setAttribute("role", "tooltip");
      progressTooltip.setAttribute("aria-hidden", "true");
      document.body.appendChild(progressTooltip);
    }
    return progressTooltip;
  }

  function hideProgressTooltip() {
    const tooltip = ensureProgressTooltip();
    tooltip.classList.remove("is-visible");
    tooltip.dataset.placement = "";
    tooltip.setAttribute("aria-hidden", "true");
    if (activeProgressMarker) {
      activeProgressMarker.removeAttribute("aria-describedby");
    }
    activeProgressMarker = null;
    document.removeEventListener("pointerdown", handleOutsideTooltip, true);
    document.removeEventListener("scroll", hideProgressTooltip, true);
  }

  function handleOutsideTooltip(event) {
    const tooltip = ensureProgressTooltip();
    if (
      activeProgressMarker &&
      !activeProgressMarker.contains(event.target) &&
      !tooltip.contains(event.target)
    ) {
      hideProgressTooltip();
    }
  }

  function positionProgressTooltip(marker, tooltip) {
    const rect = marker.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    let top = rect.top - tipRect.height - 12;
    let placement = "top";

    if (top < 8) {
      top = rect.bottom + 12;
      placement = "bottom";
    }

    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));

    tooltip.style.left = `${left + window.scrollX}px`;
    tooltip.style.top = `${top + window.scrollY}px`;
    tooltip.dataset.placement = placement;
  }

  function showProgressTooltip(marker) {
    const tooltip = ensureProgressTooltip();
    const title = marker.dataset.title || `Month ${marker.dataset.month || ""}`;
    const status = marker.dataset.statusLabel || marker.dataset.status || "";
    const unlockLabel = marker.dataset.unlockLabel || "";
    const detail =
      marker.dataset.unlocked === "true" ? marker.dataset.detail || "" : "";
    const songLabel = marker.dataset.songLabel || "";

    const safeTitle = escapeHTML(title);
    const safeStatus = escapeHTML(status);
    const safeUnlock = escapeHTML(unlockLabel);
    const safeDetail = escapeHTML(detail);
    const safeSong = escapeHTML(songLabel ? `Song: ${songLabel}` : "");

    tooltip.innerHTML = `
      <div class="progress-tooltip__title">${safeTitle}</div>
      <div class="progress-tooltip__meta">
        <span class="progress-tooltip__badge">${safeStatus}</span>
        ${
          unlockLabel
            ? `<span class="progress-tooltip__separator">•</span> <span>${safeUnlock}</span>`
            : ""
        }
      </div>
      ${
        songLabel ? `<div class="progress-tooltip__song">${safeSong}</div>` : ""
      }
      ${
        detail
          ? `<div class="progress-tooltip__detail">${safeDetail}</div>`
          : ""
      }
    `;

    tooltip.classList.add("is-visible");
    tooltip.setAttribute("aria-hidden", "false");
    activeProgressMarker = marker;
    marker.setAttribute("aria-describedby", tooltip.id);

    requestAnimationFrame(() => positionProgressTooltip(marker, tooltip));

    document.addEventListener("pointerdown", handleOutsideTooltip, true);
    document.addEventListener("scroll", hideProgressTooltip, true);
  }

  let mediaModal = null;
  let mediaModalTimer = null;
  let mediaModalSlides = [];
  let mediaModalIndex = 0;
  const mediaSlidesCache = new Map();

  function buildSlidesFromSources(rawSources) {
    const sources = (rawSources || []).map(normalizeMediaSrc).filter(Boolean);

    const slidesHtml = sources
      .map((src, i) => {
        const safeSrc = escapeHTML(src);
        const isVideo = MEDIA_EXT_VIDEO.test(src);

        if (isVideo) {
          return `
            <div class="media-modal__slide" role="listitem" data-index="${i}">
              <video src="${safeSrc}" preload="metadata" loop muted playsinline controls></video>
            </div>
          `;
        }

        return `
          <div class="media-modal__slide" role="listitem" data-index="${i}">
            <img src="${safeSrc}" alt="Memory preview" loading="lazy" decoding="async" />
          </div>
        `;
      })
      .join("");

    return { slidesHtml, sources };
  }

  function ensureMediaModal() {
    if (mediaModal) return mediaModal;

    const modal = document.createElement("div");
    modal.className = "media-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("tabindex", "-1");
    modal.innerHTML = `
      <div class="media-modal__backdrop"></div>
      <div class="media-modal__dialog">
        <button class="media-modal__close" type="button" aria-label="Close preview">×</button>
        <div class="media-modal__header">
          <div class="media-modal__title">Month preview</div>
          <div class="media-modal__subtitle">Little memories from this capsule</div>
        </div>
        <div class="media-modal__slider">
          <div class="media-modal__slides" role="list"></div>
          <div class="media-modal__loading" aria-live="polite">
            <div class="media-modal__loading-spinner" aria-hidden="true"></div>
            <div class="media-modal__loading-title">Loading memories…</div>
            <div class="media-modal__loading-subtitle">Preparing your capsule.</div>
          </div>
          <button class="media-modal__nav media-modal__nav--prev" type="button" aria-label="Previous memory">‹</button>
          <button class="media-modal__nav media-modal__nav--next" type="button" aria-label="Next memory">›</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => hideMediaModal();
    modal.querySelector(".media-modal__close").addEventListener("click", close);
    modal
      .querySelector(".media-modal__backdrop")
      .addEventListener("click", close);

    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideMediaModal();
      if (e.key === "ArrowRight") stepMediaSlide(1);
      if (e.key === "ArrowLeft") stepMediaSlide(-1);
    });

    modal
      .querySelector(".media-modal__nav--prev")
      .addEventListener("click", () => stepMediaSlide(-1));
    modal
      .querySelector(".media-modal__nav--next")
      .addEventListener("click", () => stepMediaSlide(1));

    mediaModal = modal;
    return mediaModal;
  }

  function stopMediaTimer() {
    if (mediaModalTimer) {
      clearInterval(mediaModalTimer);
      mediaModalTimer = null;
    }
  }

  function primeMediaSource(src) {
    if (!src) return;
    if (MEDIA_EXT_VIDEO.test(src)) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.src = src;
    } else {
      const img = new Image();
      img.decoding = "async";
      img.loading = "lazy";
      img.src = src;
    }
  }

  function getSlidesTemplate(month) {
    if (mediaSlidesCache.has(month.id)) {
      return mediaSlidesCache.get(month.id);
    }

    const cacheEntry = buildSlidesFromSources(month.photos);
    mediaSlidesCache.set(month.id, cacheEntry);

    if (cacheEntry.sources.length) primeMediaSource(cacheEntry.sources[0]);

    return cacheEntry;
  }

  function primeMonthSlides(month) {
    if (!month) return;
    getSlidesTemplate(month);
  }

  function setActiveMediaSlide(idx) {
    if (!mediaModalSlides.length) return;
    mediaModalSlides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === idx);
      slide.setAttribute("aria-hidden", i === idx ? "false" : "true");
      const vid = slide.querySelector("video");
      if (vid) {
        if (i === idx) {
          vid.currentTime = 0;
          vid.play().catch(() => {});
        } else {
          vid.pause();
        }
      }
    });
    mediaModalIndex = idx;
  }

  function stepMediaSlide(delta) {
    if (!mediaModalSlides.length) return;
    const next =
      (mediaModalIndex + delta + mediaModalSlides.length) %
      mediaModalSlides.length;
    setActiveMediaSlide(next);
    stopMediaTimer();
    mediaModalTimer = window.setInterval(() => {
      setActiveMediaSlide((mediaModalIndex + 1) % mediaModalSlides.length);
    }, 2000);
  }

  function hideMediaModal() {
    stopMediaTimer();
    if (mediaModal) {
      mediaModal.classList.remove("is-visible");
      mediaModal.classList.remove("is-loading");
      mediaModal.setAttribute("aria-hidden", "true");
    }
  }

  function setMediaModalLoading(modal, { isLoading, title, subtitle } = {}) {
    if (!modal) return;
    modal.classList.toggle("is-loading", !!isLoading);
    const slider = modal.querySelector(".media-modal__slider");
    if (slider) slider.setAttribute("aria-busy", isLoading ? "true" : "false");

    const loaderTitle = modal.querySelector(".media-modal__loading-title");
    const loaderSubtitle = modal.querySelector(
      ".media-modal__loading-subtitle"
    );
    if (loaderTitle && title) loaderTitle.textContent = title;
    if (loaderSubtitle) {
      loaderSubtitle.textContent = subtitle || "Preparing memories…";
    }

    const cta = modal.querySelector(".media-modal__open");
    if (cta) {
      cta.setAttribute("aria-disabled", isLoading ? "true" : "false");
      cta.tabIndex = isLoading ? -1 : 0;
    }

    modal
      .querySelectorAll(".media-modal__nav")
      .forEach((nav) => (nav.disabled = !!isLoading));
  }

  function setMediaModalCTA(modal, { href, label, hidden } = {}) {
    const controls = modal.querySelector(".media-modal__controls");
    const cta = modal.querySelector(".media-modal__open");
    if (!controls || !cta) return;

    controls.classList.toggle("is-hidden", !!hidden);

    if (hidden) {
      cta.setAttribute("aria-disabled", "true");
      cta.tabIndex = -1;
      return;
    }

    cta.setAttribute("aria-disabled", "false");
    cta.tabIndex = 0;
    cta.textContent = label || "Open this month";
    cta.setAttribute("href", href || "#");
  }

  function showMediaModal(month, data, options = {}) {
    const { deferSlides = false, loadingSubtitle } = options;
    const modal = ensureMediaModal();
    const slidesWrap = modal.querySelector(".media-modal__slides");
    const titleEl = modal.querySelector(".media-modal__title");
    const subtitleEl = modal.querySelector(".media-modal__subtitle");

    let slidesRendered = false;

    stopMediaTimer();

    const title = displayTitleForMonth(month, data);
    const subtitle = loadingSubtitle || "Preparing memories…";
    const unlockHref = `capsule.html?m=${month.id}&auto=open`;

    slidesWrap.innerHTML = "";
    mediaModalSlides = [];
    mediaModalIndex = 0;

    titleEl.textContent = title;
    if (subtitleEl)
      subtitleEl.textContent = "Little memories from this capsule";
    setMediaModalCTA(modal, { href: unlockHref, label: "Open this month" });

    setMediaModalLoading(modal, {
      isLoading: true,
      title,
      subtitle,
    });

    const renderSlides = () => {
      if (slidesRendered) return;
      slidesRendered = true;

      if (!mediaModal || !mediaModal.classList.contains("is-visible")) return;

      mediaModalSlides = [];

      const { slidesHtml, sources } = getSlidesTemplate(month);

      if (!sources.length) {
        slidesWrap.innerHTML = "";
        const empty = document.createElement("div");
        empty.className = "media-modal__empty";
        empty.textContent = "No memories added yet.";
        slidesWrap.appendChild(empty);
      } else {
        slidesWrap.innerHTML = slidesHtml;
        mediaModalSlides = Array.from(
          slidesWrap.querySelectorAll(".media-modal__slide")
        );
      }

      modal.classList.toggle("is-single", mediaModalSlides.length <= 1);

      setMediaModalLoading(modal, { isLoading: false });

      if (mediaModalSlides.length) {
        setActiveMediaSlide(0);
        stopMediaTimer();
        mediaModalTimer = window.setInterval(() => {
          setActiveMediaSlide((mediaModalIndex + 1) % mediaModalSlides.length);
        }, 2000);
      }
    };

    modal.classList.add("is-visible");
    modal.setAttribute("aria-hidden", "false");
    modal.focus({ preventScroll: true });

    if (!deferSlides) {
      requestAnimationFrame(renderSlides);
    }

    return { renderSlides };
  }

  function showInlineMediaPreview({
    title = "Preview",
    subtitle = "Tap or click to explore",
    sources = [],
    startIndex = 0,
  } = {}) {
    const modal = ensureMediaModal();
    const slidesWrap = modal.querySelector(".media-modal__slides");
    const titleEl = modal.querySelector(".media-modal__title");
    const subtitleEl = modal.querySelector(".media-modal__subtitle");

    stopMediaTimer();

    const { slidesHtml, sources: normalized } = buildSlidesFromSources(sources);
    slidesWrap.innerHTML = slidesHtml;
    mediaModalSlides = Array.from(
      slidesWrap.querySelectorAll(".media-modal__slide")
    );
    mediaModalIndex = Math.max(
      0,
      Math.min(startIndex, mediaModalSlides.length - 1)
    );

    if (normalized.length) {
      primeMediaSource(normalized[mediaModalIndex] || normalized[0]);
    }

    if (!mediaModalSlides.length) {
      const empty = document.createElement("div");
      empty.className = "media-modal__empty";
      empty.textContent = "No media to preview just yet.";
      slidesWrap.appendChild(empty);
    }

    setMediaModalLoading(modal, { isLoading: false, title, subtitle });
    setMediaModalCTA(modal, { hidden: true });

    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;

    modal.classList.add("is-visible");
    modal.classList.toggle("is-single", mediaModalSlides.length <= 1);
    modal.setAttribute("aria-hidden", "false");
    modal.focus({ preventScroll: true });

    if (mediaModalSlides.length) {
      setActiveMediaSlide(mediaModalIndex);
    }
  }

  function flashMarkerLoading(marker) {
    if (!marker || marker.classList.contains("is-loading")) return;
    marker.classList.add("is-loading");
    marker.setAttribute("aria-busy", "true");
    window.setTimeout(() => {
      marker.classList.remove("is-loading");
      marker.removeAttribute("aria-busy");
    }, 850);
  }

  function attachMarkerInteractions(
    marker,
    month,
    data,
    { isOpenable, unlockMs }
  ) {
    const show = () => {
      primeMonthSlides(month);
      showProgressTooltip(marker);
    };
    const hide = () => hideProgressTooltip();

    marker.addEventListener("pointerenter", show);
    marker.addEventListener("pointerleave", hide);
    marker.addEventListener("focus", show);
    marker.addEventListener("blur", hide);
    marker.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hide();
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!isOpenable) {
          flashMarkerLoading(marker);
          const modalState = showMediaModal(month, data, {
            deferSlides: true,
            loadingSubtitle: marker.dataset.unlockLabel,
          });
          const waitMs = Math.max(0, unlockMs - now().getTime());
          window.setTimeout(() => modalState.renderSlides(), waitMs || 0);
          return;
        }
        const modalState = showMediaModal(month, data, {
          loadingSubtitle: "Preparing your memories…",
        });
        modalState.renderSlides();
      }
    });
    marker.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") {
        show();
      }
    });
    marker.addEventListener("click", () => {
      show();
      if (!isOpenable) {
        flashMarkerLoading(marker);
        const modalState = showMediaModal(month, data, {
          deferSlides: true,
          loadingSubtitle: marker.dataset.unlockLabel,
        });
        const waitMs = Math.max(0, unlockMs - now().getTime());
        window.setTimeout(() => modalState.renderSlides(), waitMs || 0);
        return;
      }
      const modalState = showMediaModal(month, data, {
        loadingSubtitle: "Preparing your memories…",
      });
      modalState.renderSlides();
    });
  }

  function hydrateMarkerSongLabel(marker, month) {
    const songs = (month.songsAdded || []).filter(Boolean);
    if (!songs.length) return;

    Promise.all(songs.map((song) => fetchSongTitle(song))).then((titles) => {
      const cleaned = titles.filter(Boolean);
      if (!cleaned.length) return;
      marker.dataset.songLabel = cleaned.join(", ");
      if (activeProgressMarker === marker) {
        showProgressTooltip(marker);
      }
    });
  }

  function renderProgressMarkers(monthStates, data) {
    const container = $("#progressMarkers");
    if (!container || !monthStates.length) return;
    hideProgressTooltip();
    container.innerHTML = "";

    const angleStep = 360 / monthStates.length;

    monthStates.forEach(
      (
        {
          month,
          status,
          unlockDate,
          unlockMs,
          isOpenable,
          prereqsMet,
          isTimeUnlocked,
          isUnlocked,
        },
        index
      ) => {
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = `progress-marker is-${status.toLowerCase()}`;
        marker.style.setProperty("--angle", `${index * angleStep - 90}deg`);
        const statusKey = status.toLowerCase();
        const symbol =
          iconFor((CURRENT_SETTINGS.statusIcons || {})[statusKey]) || "✦";
        marker.innerHTML = `
        <span class="progress-marker__glow" aria-hidden="true"></span>
        <span class="progress-marker__icon" aria-hidden="true">${symbol}</span>
        <span class="progress-marker__spinner" aria-hidden="true"></span>
      `;

        let unlockLabel = "Ready to open";
        if (!isOpenable) {
          if (!prereqsMet && isTimeUnlocked) {
            unlockLabel = "Open previous months first";
          } else {
            unlockLabel = `Opens ${unlockDate.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}`;
          }
        }

        const detailSource = month.surprise || month.letter || "";
        const detail =
          detailSource.length > 140
            ? detailSource.slice(0, 137) + "…"
            : detailSource;
        marker.dataset.title = displayTitleForMonth(month, data);
        marker.dataset.status = status;
        marker.dataset.statusLabel = statusTextFor(status);
        marker.dataset.unlockLabel = unlockLabel;
        marker.dataset.month = String(index + 1);
        marker.dataset.unlocked = String(isUnlocked);
        marker.dataset.ready = String(isOpenable);
        marker.dataset.unlockMs = String(unlockMs);
        if (isUnlocked && detail) marker.dataset.detail = detail;

        marker.setAttribute(
          "aria-label",
          `${marker.dataset.title}: ${marker.dataset.statusLabel}. ${unlockLabel}`
        );

        attachMarkerInteractions(marker, month, data, { isOpenable, unlockMs });
        hydrateMarkerSongLabel(marker, month);
        container.appendChild(marker);
      }
    );
  }

  let yearbookState = {
    modal: null,
    book: null,
    timers: [],
  };

  const YEARBOOK_MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  function normalizeYearbookList(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === "string") {
      return value
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  function listSummary(list, fallback) {
    if (!list.length) return fallback;
    return list.join(" • ");
  }

  function formatYearbookDate(unlockDate, monthIndex) {
    const date = unlockDate ? parseISO(unlockDate) : null;
    const safeDate =
      date && !Number.isNaN(date.getTime())
        ? date
        : new Date(now().getFullYear(), monthIndex, 1);
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(safeDate);
  }

  function createYearbookContentBlock({ label, icon, heading, body, list }) {
    const content = document.createElement("div");
    content.className = "workeduc-content";

    const span = document.createElement("span");
    span.className = "year";
    const iconEl = document.createElement("i");
    iconEl.className = `bx ${icon}`;
    span.append(iconEl, document.createTextNode(` ${label}`));
    content.append(span);

    if (heading) {
      const h3 = document.createElement("h3");
      h3.textContent = heading;
      content.append(h3);
    }

    if (body || list) {
      const p = document.createElement("p");
      if (list) {
        p.textContent = list;
      } else {
        p.textContent = body;
      }
      content.append(p);
    }

    return content;
  }

  function createYearbookMediaBlock({ label, icon, summary, sources }) {
    const content = document.createElement("div");
    content.className = "workeduc-content";

    const span = document.createElement("span");
    span.className = "year";
    const iconEl = document.createElement("i");
    iconEl.className = `bx ${icon}`;
    span.append(iconEl, document.createTextNode(` ${label}`));
    content.append(span);

    if (summary) {
      const p = document.createElement("p");
      p.textContent = summary;
      content.append(p);
    }

    const normalizedSources = Array.isArray(sources)
      ? sources.map((source) => String(source || "").trim()).filter(Boolean)
      : [];

    if (!normalizedSources.length) return content;

    const grid = document.createElement("div");
    grid.className = "yearbook-media-grid";

    normalizedSources.forEach((source) => {
      if (MEDIA_EXT_VIDEO.test(source)) {
        const video = document.createElement("video");
        video.className = "yearbook-media";
        video.src = source;
        video.controls = true;
        video.preload = "metadata";
        video.playsInline = true;
        video.muted = true;
        grid.append(video);
      } else {
        const img = document.createElement("img");
        img.className = "yearbook-media";
        img.src = source;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        grid.append(img);
      }
    });

    content.append(grid);
    return content;
  }

  function collectYearbookMediaSources(data) {
    const months = Array.isArray(data?.months) ? data.months : [];
    const sources = [];
    months.forEach((month) => {
      const photos = normalizeYearbookList(month?.photos);
      const memories = normalizeYearbookList(month?.memories);
      photos.forEach((src) => sources.push(src));
      memories.forEach((src) => sources.push(src));
    });
    return sources.filter(Boolean);
  }

  function preloadYearbookAssets(data) {
    const sources = collectYearbookMediaSources(data);
    if (!sources.length) return Promise.resolve();
    const tasks = sources.map((source) => {
      if (MEDIA_EXT_VIDEO.test(source)) {
        return new Promise((resolve) => {
          const video = document.createElement("video");
          const done = () => resolve();
          video.addEventListener("loadedmetadata", done, { once: true });
          video.addEventListener("error", done, { once: true });
          video.preload = "metadata";
          video.src = source;
          video.load();
        });
      }
      return new Promise((resolve) => {
        const img = new Image();
        const done = () => resolve();
        img.onload = done;
        img.onerror = done;
        img.src = source;
      });
    });
    return Promise.allSettled(tasks);
  }

  function getSpotifyTrackId(url) {
    if (!url) return null;
    const match = String(url).match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }

  function createYearbookSoundtrackBlock(soundtrackList) {
    const content = document.createElement("div");
    content.className = "workeduc-content";

    const span = document.createElement("span");
    span.className = "year";
    const iconEl = document.createElement("i");
    iconEl.className = "bx bxs-music";
    span.append(iconEl, document.createTextNode(" Soundtrack"));
    content.append(span);

    const trackId = soundtrackList
      .map((track) => getSpotifyTrackId(track))
      .find(Boolean);

    if (trackId) {
      const iframe = document.createElement("iframe");
      iframe.className = "yearbook-spotify-embed";
      iframe.src = `https://open.spotify.com/embed/track/${trackId}`;
      iframe.width = "100%";
      iframe.height = "152";
      iframe.loading = "lazy";
      iframe.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
      iframe.title = "Spotify track";
      content.append(iframe);
    } else {
      const summary = listSummary(
        soundtrackList,
        "Add the songs that defined the month."
      );
      const p = document.createElement("p");
      p.textContent = summary;
      content.append(p);
    }

    return content;
  }

  function createYearbookLetterBlock(letter) {
    const content = document.createElement("div");
    content.className = "workeduc-content";
    const span = document.createElement("span");
    span.className = "year";
    const iconEl = document.createElement("i");
    iconEl.className = "bx bxs-envelope";
    span.append(iconEl, document.createTextNode(" Monthly Letter"));
    content.append(span);

    const p = document.createElement("p");
    p.className = "yearbook-letter";
    p.textContent = letter;
    content.append(p);
    return content;
  }

  function createYearbookMainEntry(month, index) {
    const monthName = YEARBOOK_MONTHS[index] || `Month ${index + 1}`;
    const title = month?.title || `${monthName} Highlights`;
    const letter = month?.letter || "Add your monthly letter here.";
    const highlightsList = normalizeYearbookList(month?.highlights);
    const memoriesList = normalizeYearbookList(month?.memories);
    const placesList = normalizeYearbookList(month?.placesVisited);
    const photosList = normalizeYearbookList(month?.photos);

    const highlightSummary = listSummary(
      highlightsList.length ? highlightsList : placesList,
      month?.surprise || "Add highlights from the month."
    );

    const memoriesSummary = memoriesList.length
      ? listSummary(memoriesList, "Capture favorite photos and notes.")
      : "";

    const box = document.createElement("div");
    box.className = "workeduc-box";
    box.append(
      createYearbookLetterBlock(letter),
      createYearbookContentBlock({
        label: "Title",
        icon: "bxs-bookmark",
        heading: title,
        body: "",
      }),
      createYearbookContentBlock({
        label: "Highlights",
        icon: "bxs-star",
        list: highlightSummary,
      }),
      createYearbookMediaBlock({
        label: "Memories",
        icon: "bxs-photo-album",
        summary: memoriesSummary,
        sources: photosList,
      })
    );

    return box;
  }

  function renderYearbookBook(modal, data) {
    if (!modal) return;
    const book = modal.querySelector(".yearbook-book");
    if (!book) return;

    book.querySelectorAll(".book-page.page-right").forEach((page) =>
      page.remove()
    );

    const leftPage = book.querySelector(".book-page.page-left");
    if (leftPage) {
      leftPage.innerHTML = "";
    }

    const wrapper = modal.querySelector(".yearbook-book-wrapper");
    if (wrapper) delete wrapper.dataset.bookInitialized;

    const months = Array.isArray(data?.months) ? data.months.slice(0, 12) : [];
    const fragment = document.createDocumentFragment();

    const firstMonth = months[0];
    if (leftPage && firstMonth) {
      const leftTitle = document.createElement("h1");
      leftTitle.className = "title";
      leftTitle.textContent = `Month 1 — ${YEARBOOK_MONTHS[0] || "January"}`;
      leftPage.append(leftTitle, createYearbookMainEntry(firstMonth, 0));

      const leftNumber = document.createElement("span");
      leftNumber.className = "number-page";
      leftNumber.textContent = "1";
      leftPage.append(leftNumber);
    }

    months.forEach((month, index) => {
      const monthName = YEARBOOK_MONTHS[index] || `Month ${index + 1}`;
      const pageId = `turn-${index + 1}`;
      const pageNumberFront = index * 2 + 2;
      const pageNumberBack = pageNumberFront + 1;
      const soundtrackList = normalizeYearbookList(month?.songsAdded);
      const supportingList = normalizeYearbookList(month?.supportingMoments);
      const placesList = normalizeYearbookList(month?.placesVisited);

      const supportingSummary = listSummary(
        supportingList.length ? supportingList : placesList,
        "List the moments that supported you."
      );

      const page = document.createElement("div");
      page.className = "book-page page-right turn";
      page.id = pageId;

      const front = document.createElement("div");
      front.className = "page-front";
      const frontTitle = document.createElement("h1");
      frontTitle.className = "title";
      frontTitle.textContent = `${monthName} Details & Reflections`;
      front.append(frontTitle);

      const frontBox = document.createElement("div");
      frontBox.className = "workeduc-box";
      frontBox.append(
        createYearbookContentBlock({
          label: "Date Info",
          icon: "bxs-calendar",
          body: formatYearbookDate(month?.unlockDate, index),
        }),
        createYearbookSoundtrackBlock(soundtrackList),
        createYearbookContentBlock({
          label: "Supporting Moments",
          icon: "bxs-heart",
          list: supportingSummary,
        })
      );
      front.append(frontBox);

      const frontNumber = document.createElement("span");
      frontNumber.className = "number-page";
      frontNumber.textContent = String(pageNumberFront);
      front.append(frontNumber);

      const frontNav = document.createElement("span");
      frontNav.className = "nextprev-btn";
      frontNav.dataset.page = pageId;
      const frontIcon = document.createElement("i");
      frontIcon.className = "bx bx-chevron-right";
      frontNav.append(frontIcon);
      front.append(frontNav);

      const back = document.createElement("div");
      back.className = "page-back";
      const backTitle = document.createElement("h1");
      backTitle.className = "title";
      const nextMonthIndex = index + 1;
      if (nextMonthIndex < months.length) {
        const nextMonthName =
          YEARBOOK_MONTHS[nextMonthIndex] || `Month ${nextMonthIndex + 1}`;
        backTitle.textContent = `Month ${nextMonthIndex + 1} — ${nextMonthName}`;
      } else {
        backTitle.textContent = "Year Wrap-Up";
      }
      back.append(backTitle);

      if (nextMonthIndex < months.length) {
        back.append(createYearbookMainEntry(months[nextMonthIndex], nextMonthIndex));
      } else {
        const wrapBox = document.createElement("div");
        wrapBox.className = "workeduc-box";
        wrapBox.append(
          createYearbookContentBlock({
            label: "Thank You",
            icon: "bxs-heart",
            body: `It’s the last day of the year, and honestly, I’m still here still choosing us, still fighting for this love, kahit hindi laging madali. This year wasn’t perfect. Madalas tayo mag-away, madalas tayong sabaw, may times na hindi ko rin alam kung tama ba yung ginagawa ko. Pero kahit ganun, I still stayed. I still chose you. Always.

Every month with you taught me something about patience, about understanding, about how even on days na magulo ang lahat, having you around makes things lighter. Hindi naman araw-araw okay, pero it’s good enough, and it’s still us trying, figuring things out month by month.

As this year ends, I just want you to know na I’m hoping. Hoping that tomorrow, and the days after, bring something better for us more calm days, more laughs, more moments na tahimik lang pero safe. I don’t have everything figured out, but one thing’s clear: I still want to be here with you as we step into the new year, together.`,
          })
        );
        back.append(wrapBox);
      }

      const backNumber = document.createElement("span");
      backNumber.className = "number-page";
      backNumber.textContent = String(pageNumberBack);
      back.append(backNumber);

      const backNav = document.createElement("span");
      backNav.className = "nextprev-btn back";
      backNav.dataset.page = pageId;
      const backIcon = document.createElement("i");
      backIcon.className = "bx bx-chevron-left";
      backNav.append(backIcon);
      back.append(backNav);

      page.append(front, back);
      fragment.append(page);
    });

    book.append(fragment);
  }

  function clearYearbookTimers() {
    yearbookState.timers.forEach((timer) => window.clearTimeout(timer));
    yearbookState.timers = [];
  }

  function scheduleYearbookTimer(callback, delay) {
    const timer = window.setTimeout(callback, delay);
    yearbookState.timers.push(timer);
  }

  function buildYearbookBookState(modal) {
    const wrapper = modal.querySelector(".yearbook-book-wrapper");
    if (!wrapper) return null;
    const coverRight = wrapper.querySelector(".cover.cover-right");
    const pages = Array.from(wrapper.querySelectorAll(".book-page.page-right"));
    return {
      wrapper,
      coverRight,
      pages,
      totalPages: pages.length,
      pageNumber: 0,
    };
  }

  function reverseBookIndex(state) {
    if (!state.totalPages) return;
    state.pageNumber -= 1;
    if (state.pageNumber < 0) {
      state.pageNumber = state.totalPages - 1;
    }
  }

  function syncYearbookPageStack(state) {
    if (!state?.pages?.length) return;
    state.pages.forEach((page, index) => {
      const base = 20;
      page.style.zIndex = page.classList.contains("turn")
        ? String(base + index)
        : String(base - index);
    });
  }

  function resetYearbookBook(state) {
    if (!state) return;
    clearYearbookTimers();
    state.pageNumber = 0;
    if (!state.totalPages) return;
    if (state.coverRight) {
      state.coverRight.classList.remove("turn");
      state.coverRight.style.zIndex = "";
    }

    state.pages.forEach((page) => {
      page.classList.add("turn");
      page.style.zIndex = "";
      page.style.transitionDelay = "";
      page.style.transitionDuration = "";
    });
    syncYearbookPageStack(state);
  }

  function openYearbookCover(state) {
    if (!state || !state.totalPages || state.coverRight?.classList.contains("turn")) {
      return;
    }
    clearYearbookTimers();
    state.coverRight.classList.add("turn");
    scheduleYearbookTimer(() => {
      if (state.coverRight) state.coverRight.style.zIndex = "-1";
    }, 900);

    const pagesInOrder = [...state.pages].reverse();
    pagesInOrder.forEach((page, index) => {
      page.style.transitionDuration = "3s";
      page.style.transitionDelay = `${(index + 1) * 120}ms`;
      page.style.zIndex = String(10 + index);
    });

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        pagesInOrder.forEach((page) => page.classList.remove("turn"));
      });
    });

    const totalDelay = (pagesInOrder.length + 1) * 120 + 900;
    scheduleYearbookTimer(() => {
      pagesInOrder.forEach((page) => {
        page.style.transitionDelay = "";
        page.style.transitionDuration = "";
      });
    }, totalDelay);
  }

  function setupYearbookBookInteractions(state) {
    if (!state || state.wrapper.dataset.bookInitialized === "true") return;
    state.wrapper.dataset.bookInitialized = "true";

    if (state.coverRight) {
      state.coverRight.addEventListener("click", () => {
        openYearbookCover(state);
      });
    }

    const pageTurnBtns = state.wrapper.querySelectorAll(".nextprev-btn");
    pageTurnBtns.forEach((el) => {
      el.addEventListener("click", (event) => {
        event.preventDefault();
        const pageTurnId = el.getAttribute("data-page");
        if (!pageTurnId) return;
        const pageTurn = state.wrapper.querySelector(`#${pageTurnId}`);
        if (!pageTurn) return;
        const transitionDuration = parseFloat(
          window.getComputedStyle(pageTurn).transitionDuration
        );
        const transitionMs = Number.isNaN(transitionDuration)
          ? 1000
          : transitionDuration * 1000;

        if (pageTurn.classList.contains("turn")) {
          pageTurn.classList.remove("turn");
        } else {
          pageTurn.classList.add("turn");
        }
        window.setTimeout(() => {
          syncYearbookPageStack(state);
        }, transitionMs);
      });
    });

    const contactMeBtn = state.wrapper.querySelector(".btn.contact-me");
    if (contactMeBtn) {
      contactMeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        state.pages.forEach((page, index) => {
          window.setTimeout(() => {
            page.classList.add("turn");
            window.setTimeout(() => {
              page.style.zIndex = String(20 + index);
            }, 500);
          }, (index + 1) * 200 + 100);
        });
      });
    }

    const backProfileBtn = state.wrapper.querySelector(".back-profile");
    if (backProfileBtn) {
      backProfileBtn.addEventListener("click", (event) => {
        event.preventDefault();
        state.pages.forEach((_, index) => {
          window.setTimeout(() => {
            reverseBookIndex(state);
            const page = state.pages[state.pageNumber];
            if (page) page.classList.remove("turn");
            window.setTimeout(() => {
              reverseBookIndex(state);
              const targetPage = state.pages[state.pageNumber];
              if (targetPage) targetPage.style.zIndex = String(10 + index);
            }, 500);
          }, (index + 1) * 200 + 100);
        });
      });
    }
  }

  function hideYearbook(modal) {
    if (!modal) return;
    clearYearbookTimers();
    modal.classList.remove("is-visible");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("yearbook-open");
  }

  function ensureYearbookModal(data) {
    if (yearbookState.modal) return yearbookState.modal;
    const modal = $("#yearEndModal");
    if (!modal) return null;

    const close = () => hideYearbook(modal);
    modal
      .querySelector(".yearbook-modal__close")
      .addEventListener("click", close);
    modal
      .querySelector(".yearbook-modal__backdrop")
      .addEventListener("click", close);

    modal.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideYearbook(modal);
    });

    yearbookState.modal = modal;

    return modal;
  }

  async function showYearbook(data) {
    const modal = ensureYearbookModal(data);
    if (!modal) return;
    await preloadYearbookAssets(data);
    renderYearbookBook(modal, data);
    yearbookState.book = buildYearbookBookState(modal);
    setupYearbookBookInteractions(yearbookState.book);
    resetYearbookBook(yearbookState.book);

    modal.classList.add("is-visible");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("yearbook-open");
    modal.focus({ preventScroll: true });
  }

  function renderHome(data) {
    const unlocked = loadUnlocked();
    setRingProgress(unlocked.size);

    const monthsGrid = $("#monthsGrid");
    monthsGrid.innerHTML = "";
    let nextUnlockMs = Infinity;
    let currentOpenable = null;
    const nowMs = now().getTime();

    const monthStates = data.months.map((m, idx) => {
      const unlockDate = parseISO(m.unlockDate);
      const unlockMs = unlockDate.getTime();
      const isUnlocked = unlocked.has(m.id);
      const prereqsMet = data.months
        .slice(0, idx)
        .every((prev) => unlocked.has(prev.id));
      const isTimeUnlocked = nowMs >= unlockMs;
      const isOpenable = prereqsMet && isTimeUnlocked;
      const status = isUnlocked ? "Unlocked" : isOpenable ? "Ready" : "Locked";
      return {
        month: m,
        unlockDate,
        unlockMs,
        isUnlocked,
        isOpenable,
        status,
        prereqsMet,
        isTimeUnlocked,
      };
    });

    monthStates.forEach(
      ({
        month,
        unlockMs,
        isUnlocked,
        isOpenable,
        prereqsMet,
        isTimeUnlocked,
      }) => {
        if (!isUnlocked && isOpenable && currentOpenable === null)
          currentOpenable = month;
        if (!isOpenable && unlockMs > nowMs)
          nextUnlockMs = Math.min(nextUnlockMs, unlockMs - nowMs);
        if (!isOpenable && isTimeUnlocked && !prereqsMet) return;
      }
    );

    const renderMonthsGrid = () => {
      monthsGrid.innerHTML = "";
      monthStates.forEach(({ month, isOpenable, status }) => {
        const card = document.createElement("div");
        card.className = "month-card" + (isOpenable ? "" : " locked");
        const title = displayTitleForMonth(month, data);
        card.innerHTML = `
          <div class="month-title">${title}</div>
          <div class="pill">${
            status === "Unlocked"
              ? iconFor(CURRENT_SETTINGS.statusIcons.unlocked)
              : status === "Ready"
              ? iconFor(CURRENT_SETTINGS.statusIcons.ready)
              : iconFor(CURRENT_SETTINGS.statusIcons.locked)
          } ${statusTextFor(status)}</div>
          <div class="month-actions">
            <button class="btn btn-secondary" data-open="${month.id}" ${
          isOpenable ? "" : "disabled"
        }>Open</button>
            <a class="btn view" href="capsule.html?m=${month.id}" ${
          isOpenable ? "" : 'tabindex="-1" aria-disabled="true"'
        }>View</a>
          </div>
        `;
        monthsGrid.appendChild(card);
      });
    };

    const attachOpenHandlers = () => {
      $$("button[data-open]").forEach((b) => {
        const id = Number(b.getAttribute("data-open"));
        const state = monthStates.find((m) => m.month.id === id);
        b.addEventListener("click", () => {
          if (!state || !state.isOpenable) return;
          unlocked.add(id);
          saveUnlocked(unlocked);
          confettiBurst();
          softBeep();
          window.location.href = `capsule.html?m=${id}&auto=open`;
        });
      });
    };

    let showAllMonths = false;
    const toggleAllMonths = $("#toggleAllMonths");
    const updateAllMonthsToggle = () => {
      if (!toggleAllMonths) return;
      toggleAllMonths.setAttribute("aria-pressed", String(showAllMonths));
      toggleAllMonths.textContent = showAllMonths
        ? "Hide locked months"
        : "View all months";
      monthsGrid.classList.toggle("show-locked", showAllMonths);
    };
    if (toggleAllMonths) {
      toggleAllMonths.addEventListener("click", () => {
        showAllMonths = !showAllMonths;
        updateAllMonthsToggle();
      });
    }
    renderMonthsGrid();
    attachOpenHandlers();
    updateAllMonthsToggle();

    renderProgressMarkers(monthStates, data);

    if (currentOpenable) {
      primeMonthSlides(currentOpenable);
    }

    const btn = $("#openCurrent");
    const allMonthsUnlocked = monthStates.every((state) => state.isUnlocked);
    const yearEndAvailable = isYearEndDay() || allMonthsUnlocked;
    const yearLabel = (() => {
      try {
        return data.startDate
          ? parseISO(data.startDate).getFullYear()
          : now().getFullYear();
      } catch {
        return now().getFullYear();
      }
    })();
    if (btn) {
      if (yearEndAvailable) {
        btn.disabled = false;
        btn.textContent = `Open Wrapped 2025`;
        btn.onclick = () => showYearbook(data);
      } else if (currentOpenable) {
        btn.disabled = false;
        btn.onclick = () => {
          unlocked.add(currentOpenable.id);
          saveUnlocked(unlocked);
          setRingProgress(unlocked.size);
          confettiBurst();
          softBeep();
          setTimeout(() => {
            window.location.href = `capsule.html?m=${currentOpenable.id}&auto=open`;
          }, 250);
        };
      } else {
        btn.disabled = true;
        btn.onclick = null;
      }
    }

    const cd = $("#countdown");
    function updateCountdown() {
      if (nextUnlockMs === Infinity) {
        cd.textContent = "--";
        return;
      }
      cd.textContent = formatCountdownSmart(nextUnlockMs);
      nextUnlockMs -= 1000;
      if (nextUnlockMs < 0) window.location.reload();
    }
    if (yearEndAvailable) {
      const cdl = $("#countdownLabel");
      if (cdl) cdl.textContent = "Year-End Compilation";
      if (cd) cd.textContent = "Unlocked";
    } else {
      updateCountdown();
      setInterval(updateCountdown, 1000);
    }

    const toggleUnlockedSongs = $("#toggleUnlockedSongs");
    const songsModal = $("#unlockedSongsModal");
    const songsTimeline = $("#unlockedSongsTimeline");
    const songsClose = songsModal?.querySelector(
      ".unlocked-songs-modal__close"
    );
    const songsBackdrop = songsModal?.querySelector(
      ".unlocked-songs-modal__backdrop"
    );
    const songsDialog = songsModal?.querySelector(
      ".unlocked-songs-modal__dialog"
    );

    const renderUnlockedSongs = async () => {
      if (!songsTimeline) return;
      const entries = data.months
        .filter((month) => unlocked.has(month.id))
        .flatMap((month) =>
          (month.songsAdded || []).filter(Boolean).map((url) => ({
            url,
            monthLabel: displayTitleForMonth(month, data),
          }))
        );

      if (!entries.length) {
        songsTimeline.innerHTML =
          '<div class="patch-empty">No unlocked songs yet.</div>';
        return;
      }

      const titled = await Promise.all(
        entries.map(async (entry) => ({
          ...entry,
          title: (await fetchSongTitle(entry.url)) || "Spotify track",
        }))
      );

      songsTimeline.innerHTML = titled
        .map(
          (item) => `
            <div class="patch-item unlocked-song-item">
              <div class="patch-item__marker" aria-hidden="true"></div>
              <div>
                <div class="patch-item__meta">
                  <span class="patch-item__version">${escapeHTML(
                    item.monthLabel
                  )}</span>
                  <span>Spotify track</span>
                </div>
                <div class="patch-item__title">${escapeHTML(item.title)}</div>
                <a
                  class="btn btn-secondary unlocked-songs-play"
                  href="${escapeHTML(item.url)}"
                  target="_blank"
                  rel="noopener"
                >
                  Play
                </a>
              </div>
            </div>
          `
        )
        .join("");
    };

    const closeSongsModal = () => {
      if (!songsModal) return;
      songsModal.classList.remove("is-visible");
      songsModal.setAttribute("aria-hidden", "true");
    };

    const openSongsModal = async () => {
      if (!songsModal) return;
      await renderUnlockedSongs();
      songsModal.classList.add("is-visible");
      songsModal.setAttribute("aria-hidden", "false");
      if (songsDialog && typeof songsDialog.focus === "function") {
        songsDialog.focus({ preventScroll: true });
      }
    };

    if (toggleUnlockedSongs) {
      toggleUnlockedSongs.addEventListener("click", (e) => {
        e.preventDefault();
        openSongsModal();
      });
    }

    [songsClose, songsBackdrop].forEach(
      (el) => el && el.addEventListener("click", closeSongsModal)
    );

    songsModal?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSongsModal();
    });
  }

  function typewriter(el, text, speed = 90, onDone) {
    el.textContent = "";
    let i = 0;
    let timeoutId = null;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);
      el.textContent = text;
      if (typeof onDone === "function") onDone();
    };

    const tick = () => {
      if (finished) return;
      el.textContent = text.slice(0, i);
      const prev = text[i - 1] || "";
      i++;

      if (i > text.length) {
        finish();
        return;
      }

      let delay = speed;
      if (prev === "\n") delay = speed * 8;
      else if (".!?".includes(prev)) delay = speed * 6;
      else if (",;:".includes(prev)) delay = speed * 3;

      timeoutId = setTimeout(tick, delay);
    };

    tick();

    return { skip: finish };
  }

  function formatPatchDate(dateStr) {
    if (!dateStr) return "Date TBA";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "Date TBA";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function renderPatchNotesTimeline(notes) {
    const wrap = document.getElementById("patchTimeline");
    if (!wrap) return;

    if (!Array.isArray(notes) || !notes.length) {
      wrap.innerHTML =
        '<div class="patch-empty">Patch notes are on their way.</div>';
      return;
    }

    const orderedNotes = notes.slice().reverse();

    wrap.innerHTML = orderedNotes
      .map((note) => {
        const version = escapeHTML(note.version || "1.0.0");
        const date = formatPatchDate(note.date);
        const title = escapeHTML(note.title || "Update");
        const changes = (note.changes || [])
          .map((item) => `<li>${escapeHTML(item)}</li>`)
          .join("");

        return `
          <div class="patch-item">
            <div class="patch-item__marker" aria-hidden="true"></div>
            <div>
              <div class="patch-item__meta">
                <span class="patch-item__version">v${version}</span>
                <span>${escapeHTML(date)}</span>
              </div>
              <div class="patch-item__title">${title}</div>
              ${
                changes ? `<ul class="patch-item__changes">${changes}</ul>` : ""
              }
            </div>
          </div>
        `;
      })
      .join("");
  }

  function setupPatchNotesModal() {
    const modal = document.getElementById("patchModal");
    const openBtn = document.getElementById("btnPatchNotes");
    if (!modal || !openBtn) return;

    const closeBtn = modal.querySelector(".patch-modal__close");
    const backdrop = modal.querySelector(".patch-modal__backdrop");
    const dialog = modal.querySelector(".patch-modal__dialog");

    const close = () => {
      modal.classList.remove("is-visible");
      modal.setAttribute("aria-hidden", "true");
    };

    const open = async () => {
      const notes = await loadPatchNotes();
      renderPatchNotesTimeline(notes);
      modal.classList.add("is-visible");
      modal.setAttribute("aria-hidden", "false");
      if (dialog && typeof dialog.focus === "function") {
        dialog.focus({ preventScroll: true });
      }
    };

    openBtn.addEventListener("click", (e) => {
      e.preventDefault();
      open();
    });

    [closeBtn, backdrop].forEach(
      (el) => el && el.addEventListener("click", close)
    );

    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  async function renderCapsule(data) {
    const params = new URLSearchParams(location.search);
    const id = Number(params.get("m") || "1");
    const monthIndex = data.months.findIndex((m) => Number(m.id) === id);
    const safeIndex = monthIndex >= 0 ? monthIndex : 0;
    const month = data.months[safeIndex] || data.months[0];
    const userId = getUserId();
    const unlocked = loadUnlocked();

    const prerequisitesMet = data.months
      .slice(0, safeIndex)
      .every((m) => unlocked.has(m.id));
    if (!prerequisitesMet && safeIndex > 0) {
      alert("Please open earlier months first.");
      window.location.replace("index.html");
      return;
    }

    const unlockTime = parseISO(month.unlockDate).getTime();
    const canOpen = now().getTime() >= unlockTime;
    const header = $("#capTitle");
    const dynTitle = displayTitleForMonth(month, data);
    const greet =
      (CURRENT_SETTINGS && CURRENT_SETTINGS.capsuleGreeting) ||
      "Happy Monthsary!";
    header.textContent = `${greet} (${dynTitle})`;

    CURRENT_CAPSULE_MONTH = month.id;
    saveLastOpenMonth(month.id);
    writeFirebaseJSON(`userCapsuleState/${userId}`, {
      currentMonth: month.id,
      updatedAt: new Date().toISOString(),
    });

    if (!unlocked.has(month.id) && canOpen) {
      unlocked.add(month.id);
      saveUnlocked(unlocked);
      confettiBurst();
      softBeep();
    }

    const letterText = month.letter || "";
    const letterEl = $("#letter");
    const overlay = document.getElementById("letterOverlay");
    const letterFull = document.getElementById("letterFull");
    const closeOverlay = document.getElementById("closeOverlay");
    const autoplayHint = document.getElementById("autoplayHint");
    const shouldShowOverlay = params.get("auto") === "open";
    const skipOverlay = document.getElementById("skipOverlay");

    const highlightSongsStat = () => {
      const statCard = document.getElementById("footerSpotifyCard");
      if (!statCard) return;

      statCard.classList.remove("stat-highlight");
      // Force reflow so the animation can restart if triggered repeatedly.
      void statCard.offsetWidth;

      statCard.classList.add("stat-highlight");
      statCard.scrollIntoView({ behavior: "smooth", block: "center" });

      statCard.addEventListener(
        "animationend",
        () => statCard.classList.remove("stat-highlight"),
        { once: true }
      );
    };

    const animateSpotifyFlyout = () => {
      const statCard = document.getElementById("footerSpotifyCard");
      if (!statCard || statCard.classList.contains("hidden")) {
        return 0;
      }
      return 0;
    };

    if (overlay) {
      overlay.classList.toggle("hidden", !shouldShowOverlay);
    }

    if (skipOverlay) {
      skipOverlay.classList.toggle("hidden", !shouldShowOverlay);
    }

    if (letterEl) {
      letterEl.textContent = letterText;
    }

    const finishOverlay = () => {
      if (!shouldShowOverlay) return;
      if (closeOverlay) closeOverlay.classList.remove("hidden");
      if (skipOverlay) skipOverlay.classList.add("hidden");
    };

    let startedTyping = false;
    let controller = null;
    const startTyping = () => {
      if (startedTyping) return;
      startedTyping = true;
      if (overlay && letterFull) {
        if (closeOverlay) {
          closeOverlay.onclick = () => {
            const flyDuration = animateSpotifyFlyout();
            overlay.classList.add("hidden");
            finishOverlay();
            const delay = flyDuration ? flyDuration + 150 : 200;
            setTimeout(highlightSongsStat, delay);
          };
        }

        if (shouldShowOverlay) {
          if (closeOverlay) closeOverlay.classList.add("hidden");

          controller = typewriter(letterFull, letterText, 90, finishOverlay);
        } else {
          letterFull.textContent = letterText;
          finishOverlay();
        }
      } else {
        typewriter(letterEl, letterText);
        finishOverlay();
      }
    };

    if (skipOverlay) {
      skipOverlay.onclick = () => {
        if (!startedTyping) startTyping();
        if (controller && typeof controller.skip === "function") {
          controller.skip();
        } else if (letterFull) {
          letterFull.textContent = letterText;
        }
        finishOverlay();
      };
    }

    const replayButton = document.getElementById("replayLetter");
    if (replayButton && letterEl) {
      replayButton.onclick = () => {
        typewriter(letterEl, letterText, 70);
      };
    }

    const replies = await fetchRepliesForMonth(month.id);

    const strip = $("#photos");
    strip.innerHTML = "";

    const replyImages = replies.flatMap((reply) => normalizeReplyImages(reply));
    const combinedPhotos = Array.from(
      new Set([...(month.photos || []), ...replyImages])
    );
    const photoSources = buildSlidesFromSources(combinedPhotos).sources;

    const appendMedia = (src) => {
      const isVideo = MEDIA_EXT_VIDEO.test(src);

      if (isVideo) {
        const v = document.createElement("video");
        v.src = src;
        v.loop = true;
        v.autoplay = true;
        v.muted = true;
        v.playsInline = true;
        v.preload = "metadata";

        v.className = "media media-clickable";
        v.dataset.source = src;
        strip.appendChild(v);
      } else {
        const img = document.createElement("img");
        img.loading = "lazy";
        img.decoding = "async";
        img.src = src;
        img.alt = "Photo";
        img.className = "media media-clickable";
        img.dataset.source = src;
        strip.appendChild(img);
      }
    };

    photoSources.forEach((src) => {
      appendMedia(src);
    });
    const addReplyPhotos = (urls) => {
      urls.forEach((src) => {
        if (!src || photoSources.includes(src)) return;
        photoSources.push(src);
        appendMedia(src);
      });
    };
    strip.addEventListener("click", (e) => {
      const media = e.target.closest(".media");
      if (!media) return;

      const clickedSrc = normalizeMediaSrc(
        media.dataset.source || media.currentSrc || media.src || ""
      );
      const startIndex = Math.max(
        0,
        photoSources.findIndex((src) => src === clickedSrc)
      );

      showInlineMediaPreview({
        title: `${dynTitle} memories`,
        subtitle: "Swipe or click through full-size memories.",
        sources: photoSources,
        startIndex,
      });
    });

    const audio = $("#voice");
    if (month.voiceNote) {
      audio.src = month.voiceNote;
      audio.style.display = "block";
    } else {
      audio.style.display = "none";
    }

    const repliesSection = $("#repliesSection");
    const repliesList = $("#repliesList");
    const replyVoicesSection = $("#replyVoicesSection");
    const replyVoices = $("#replyVoices");

    const renderRepliesUI = (items) => {
      if (repliesSection && repliesList) {
        if (items.length) {
          repliesSection.classList.remove("hidden");
          repliesList.innerHTML = items
            .map((reply) => {
              const name = escapeHTML(reply.name || "Anonymous");
              const replyText = escapeHTML(reply.reply || "");
              const rantText = escapeHTML(reply.rant || "");
              const placeText = escapeHTML(reply.placeVisited || "");
              const createdAt = reply.createdAt
                ? new Date(reply.createdAt).toLocaleString()
                : "Just now";
              const imageCount = normalizeReplyImages(reply).length;
              const voiceUrl = reply.voiceUrl || "";

              return `
                <article class="reply-card">
                  <div class="reply-card__meta">
                    <span>${name}</span>
                    <span>${escapeHTML(createdAt)}</span>
                  </div>
                  ${
                    replyText
                      ? `<div class="reply-card__body">${replyText}</div>`
                      : ""
                  }
                  ${
                    rantText
                      ? `<div>
                      <div class="reply-card__title">Rant</div>
                      <div class="reply-card__body">${rantText}</div>
                    </div>`
                      : ""
                  }
                  ${
                    placeText
                      ? `<div class="reply-card__badge">📍 ${placeText}</div>`
                      : ""
                  }
                  ${
                    imageCount
                      ? `<div class="reply-card__badge">🖼️ ${imageCount} photo${
                          imageCount > 1 ? "s" : ""
                        }</div>`
                      : ""
                  }
                  ${
                    voiceUrl
                      ? `<div class="reply-card__badge">🎙️ Voice mail</div>`
                      : ""
                  }
                </article>
              `;
            })
            .join("");
        } else {
          repliesSection.classList.add("hidden");
          repliesList.innerHTML = "";
        }
      }

      if (replyVoicesSection && replyVoices) {
        const voiceUrls = items.map((reply) => reply.voiceUrl).filter(Boolean);
        if (voiceUrls.length) {
          replyVoicesSection.classList.remove("hidden");
          replyVoices.innerHTML = voiceUrls
            .map((url) => `<audio controls src="${escapeHTML(url)}"></audio>`)
            .join("");
        } else {
          replyVoicesSection.classList.add("hidden");
          replyVoices.innerHTML = "";
        }
      }
    };

    renderRepliesUI(replies);

    $("#surprise").textContent = month.surprise || "";

    const start = data.startDate ? parseISO(data.startDate) : now();
    const daysTogether = Math.max(
      0,
      Math.floor((now().getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    );

    const songs = month.songsAdded || [];
    const musicEmbed = document.getElementById("musicEmbed");
    const mount = document.getElementById("spotifyMount");
    const footerSpotifyCard = document.getElementById("footerSpotifyCard");

    const parsedSongs = songs.map((url) => {
      const match = url.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
      return {
        url,
        trackId: match ? match[1] : null,
      };
    });

    const validTracks = parsedSongs.filter((song) => !!song.trackId);

    const sp = validTracks.length ? validTracks[0].url : null;
    let trackId = null;
    if (sp) {
      const m = sp.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
      trackId = m && m[1];
    }

    let spotifyController = null;
    const hideAutoplayHint = () => {
      if (autoplayHint) autoplayHint.classList.add("hidden");
    };
    const attemptSpotifyPlay = () => {
      if (
        !spotifyController ||
        !overlay ||
        overlay.classList.contains("hidden")
      ) {
        return;
      }
      try {
        spotifyController.play();
      } catch (err) {
        console.error("Failed to start Spotify playback", err);
      }
    };

    if (overlay) {
      const triggerPlay = () => {
        attemptSpotifyPlay();
      };

      overlay.addEventListener("touchstart", triggerPlay, { passive: true });

      const watchOverlayState = () => {
        if (!overlay.classList.contains("hidden")) {
          attemptSpotifyPlay();
        }
      };

      if (typeof MutationObserver !== "undefined") {
        const observer = new MutationObserver(watchOverlayState);
        observer.observe(overlay, {
          attributes: true,
          attributeFilter: ["class"],
        });
      }

      watchOverlayState();
    }

    if (footerSpotifyCard) {
      footerSpotifyCard.classList.toggle("hidden", !validTracks.length);
    }

    if (!validTracks.length && musicEmbed) {
      musicEmbed.classList.add("hidden");
    }

    if (trackId && mount) {
      mount.innerHTML = "";
      if (musicEmbed) musicEmbed.classList.remove("hidden");

      window.__initSpotifyEmbed = (IFrameAPI) => {
        IFrameAPI.createController(
          mount,
          { uri: `spotify:track:${trackId}`, width: "100%", height: 152 },
          (EmbedController) => {
            spotifyController = EmbedController;
            attemptSpotifyPlay();
            EmbedController.addListener("playback_started", () => {
              hideAutoplayHint();
              startTyping();
            });
            EmbedController.addListener("playback_update", (e) => {
              if (!e.data.isPaused) {
                hideAutoplayHint();
                startTyping();
              }
            });
          }
        );
      };

      if (window.__SpotifyIFrameAPI) {
        window.__initSpotifyEmbed(window.__SpotifyIFrameAPI);
      }
    } else {
      hideAutoplayHint();
      startTyping();
    }

    const places = data.months.reduce(
      (acc, m) => acc + (m.placesVisited || []).length,
      0
    );
    $("#statDays").textContent = String(daysTogether);
    $("#statPlaces").textContent = String(places);

    const replyModal = document.getElementById("replyModal");
    const openReplyModal = document.getElementById("openReplyModal");
    const replyForm = document.getElementById("replyForm");
    const replyStatus = document.getElementById("replyStatus");

    const closeReplyModal = () => {
      if (!replyModal) return;
      replyModal.classList.remove("is-visible");
      replyModal.setAttribute("aria-hidden", "true");
    };

    const openReplyModalFn = () => {
      if (!replyModal) return;
      replyModal.classList.add("is-visible");
      replyModal.setAttribute("aria-hidden", "false");
      const messageInput = document.getElementById("replyMessage");
      if (messageInput) messageInput.focus();
    };

    if (openReplyModal) {
      openReplyModal.addEventListener("click", openReplyModalFn);
    }

    if (replyModal) {
      replyModal.addEventListener("click", (e) => {
        if (e.target && e.target.dataset.close === "true") {
          closeReplyModal();
        }
      });
      replyModal.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeReplyModal();
      });
    }

    if (replyForm) {
      replyForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (replyStatus) replyStatus.textContent = "Saving...";

        const nameInput = document.getElementById("replyName");
        const messageInput = document.getElementById("replyMessage");
        const rantInput = document.getElementById("replyRant");
        const placeInput = document.getElementById("replyPlace");
        const imagesInput = document.getElementById("replyImages");
        const voiceInput = document.getElementById("replyVoice");

        const replyText = messageInput?.value.trim() || "";
        if (!replyText) {
          if (replyStatus) replyStatus.textContent = "Please add a reply.";
          return;
        }

        const payload = {
          name: nameInput?.value.trim() || "",
          reply: replyText,
          rant: rantInput?.value.trim() || "",
          placeVisited: placeInput?.value.trim() || "",
          imageUrls: parseList(imagesInput?.value || ""),
          voiceUrl: voiceInput?.value.trim() || "",
          createdAt: new Date().toISOString(),
        };

        const res = await writeFirebaseJSON(
          `replies/${month.id}/${userId}`,
          payload,
          "POST"
        );

        if (!res) {
          if (replyStatus)
            replyStatus.textContent = "Failed to save. Try again.";
          return;
        }

        replies.push(payload);
        replies.sort((a, b) => {
          const aTime = new Date(a.createdAt || 0).getTime();
          const bTime = new Date(b.createdAt || 0).getTime();
          return aTime - bTime;
        });
        renderRepliesUI(replies);
        addReplyPhotos(payload.imageUrls || []);

        if (replyForm) replyForm.reset();
        if (replyStatus) replyStatus.textContent = "Saved!";
        setTimeout(() => {
          if (replyStatus) replyStatus.textContent = "";
        }, 2000);
        closeReplyModal();
      });
    }

    const configureNavButton = (button, targetIndex, label) => {
      if (!button) return;
      if (targetIndex < 0 || targetIndex >= data.months.length) {
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
        return;
      }

      const targetMonth = data.months[targetIndex];
      const targetTitle = displayTitleForMonth(targetMonth, data);
      const prereqsReady = data.months
        .slice(0, targetIndex)
        .every((m) => unlocked.has(m.id));

      button.textContent = label;
      button.title = prereqsReady
        ? `Go to ${targetTitle}`
        : "Open previous months first";
      button.setAttribute("aria-label", `${label} ${targetTitle}`);
      button.disabled = !prereqsReady;
      button.setAttribute("aria-disabled", String(!prereqsReady));

      if (prereqsReady) {
        button.onclick = () => {
          window.location.href = `capsule.html?m=${targetMonth.id}`;
        };
      } else {
        button.onclick = null;
      }
    };

    configureNavButton(
      document.getElementById("prevMonth"),
      safeIndex - 1,
      "⟵ Prev"
    );
    configureNavButton(
      document.getElementById("nextMonth"),
      safeIndex + 1,
      "Next ⟶"
    );

    $("#backHome").addEventListener(
      "click",
      () => (window.location.href = "index.html")
    );
  }

  (async function init() {
    await ensureUserProfile();
    const data = ensureUnlockDates(await loadData());
    CURRENT_SETTINGS = mergeSettings(data.settings);
    applySettings(CURRENT_SETTINGS);
    setupAudioToggle();

    if (PAGE === "home" || PAGE === "admin") {
      initMediaBackground(data);
    }
    if (PAGE === "home") {
      renderHome(data);
      setupPatchNotesModal();
    }
    if (PAGE === "capsule") await renderCapsule(data);
    if (PAGE === "qr") {
      const qrImage = document.getElementById("qr");
      const qrLabel = document.getElementById("lbl");
      if (qrImage) {
        qrImage.classList.add("media-clickable");
        qrImage.addEventListener("click", () => {
          const src = qrImage.currentSrc || qrImage.src;
          if (!src) return;

          showInlineMediaPreview({
            title: "QR Code",
            subtitle: qrLabel?.textContent || "Scan-ready preview",
            sources: [src],
          });
        });
      }
    }

    $$('a[href$="admin.html"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        gateAdmin(true);
      });
    });
  })();
  if (typeof window !== "undefined") {
    window.__initMediaBackground = initMediaBackground;
    window.__showInlineMediaPreview = showInlineMediaPreview;
    window.__showYearbook = showYearbook;
  }
})();
async function resetAppStorage() {
  try {
    try {
      localStorage.clear();
    } catch {}
    try {
      sessionStorage.clear();
    } catch {}

    const cookies = document.cookie.split(";").map((c) => c.trim());
    const pathsToTry = [location.pathname, "/"];
    const past = "Thu, 01 Jan 1970 00:00:00 GMT";
    for (const c of cookies) {
      const eq = c.indexOf("=");
      const name = eq > -1 ? c.substring(0, eq) : c;
      for (const p of pathsToTry) {
        document.cookie = `${name}=; expires=${past}; path=${p}`;
        document.cookie = `${name}=; expires=${past}; path=${p}; SameSite=Lax`;
      }
    }

    if (window.caches && caches.keys) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }

    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }

    location.reload();
  } catch (e) {
    alert("Reset failed. Please try again.");
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnReset");
  if (btn) {
    btn.addEventListener("click", () => {
      if (confirm("Clear cookies, cache, and storage for this site?")) {
        resetAppStorage();
      }
    });
  }
});
