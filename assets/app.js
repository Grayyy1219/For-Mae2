(() => {
  const PAGE = document.body.getAttribute("data-page") || "home";
  const STORAGE_UNLOCKED = "mtc_unlocked_months";
  const STORAGE_OVERRIDE = "mtc_capsules_override";
  let CURRENT_SETTINGS = null;

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
    footerText: "Happy Monthsary, Love! • Made with 💖",
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

  function loadUnlocked() {
    try {
      const raw = localStorage.getItem(STORAGE_UNLOCKED);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw));
    } catch {
      return new Set();
    }
  }
  function saveUnlocked(set) {
    localStorage.setItem(STORAGE_UNLOCKED, JSON.stringify(Array.from(set)));
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

  function confettiBurst() {
    const canvas = $("#confettiCanvas");
    if (!canvas) return;
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
    const N = 140;
    const parts = Array.from({ length: N }).map(() => ({
      x: Math.random() * W,
      y: -20 - Math.random() * 40,
      vx: -1 + Math.random() * 2,
      vy: 2 + Math.random() * 3,
      s: 6 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: -0.2 + Math.random() * 0.4,
      col: colors[(Math.random() * colors.length) | 0],
    }));
    let t = 0;
    const maxT = 80;
    function tick() {
      t++;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.col;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      }
      if (t < maxT) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    }
    tick();
  }

  async function loadData() {
    try {
      const override = localStorage.getItem(STORAGE_OVERRIDE);
      if (override) return JSON.parse(override);
    } catch {}

    try {
      const res = await fetch("data/capsules.json", { cache: "no-store" });
      if (res.ok) return await res.json();
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

  function ensureUnlockDates(data) {
    const start = data.startDate ? parseISO(data.startDate) : now();
    const anchorDay = start.getDate();
    const today = now();
    const year = today.getFullYear();
    data.months = (data.months || []).map((m, i) => {
      if (!m.unlockDate) {
        const lastDay = new Date(year, i + 1, 0).getDate();
        const day = Math.min(anchorDay, lastDay);
        const d = new Date(year, i, day, 12, 0, 0, 0);
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
      if (months > 0 && months % 12 === 0) {
        const years = Math.floor(months / 12);
        return `${ordinal(years)} Anniversary`;
      }
      return `${ordinal(months)} month`;
    } catch {
      return m.title || "Month";
    }
  }

  function renderHome(data) {
    const unlocked = loadUnlocked();
    setRingProgress(unlocked.size);

    const monthsGrid = $("#monthsGrid");
    monthsGrid.innerHTML = "";
    const n = data.months.length;
    let nextUnlockMs = Infinity;
    let currentOpenable = null;
    const nowMs = now().getTime();

    data.months.forEach((m) => {
      const unlockMs = parseISO(m.unlockDate).getTime();
      const isUnlocked = unlocked.has(m.id);
      const isOpenable = nowMs >= unlockMs;
      const status = isUnlocked ? "Unlocked" : isOpenable ? "Ready" : "Locked";
      if (!isUnlocked && isOpenable && currentOpenable === null)
        currentOpenable = m;
      if (!isOpenable) nextUnlockMs = Math.min(nextUnlockMs, unlockMs - nowMs);

      const card = document.createElement("div");
      card.className = "month-card" + (isOpenable ? "" : " locked");
      const title = displayTitleForMonth(m, data);
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
          <button class="btn btn-secondary" data-open="${m.id}" ${
        isOpenable ? "" : "disabled"
      }>Open</button>
          <a class="btn view" href="capsule.html?m=${m.id}" ${
        isOpenable ? "" : 'tabindex="-1" aria-disabled="true"'
      }>View</a>
        </div>
      `;
      monthsGrid.appendChild(card);
    });

    const btn = $("#openCurrent");
    if (btn) {
      if (currentOpenable) {
        btn.disabled = false;
        btn.onclick = () => {
          unlocked.add(currentOpenable.id);
          saveUnlocked(unlocked);
          setRingProgress(unlocked.size);
          confettiBurst();
          softBeep();
          setTimeout(() => {
            window.location.href = `capsule.html?m=${currentOpenable.id}`;
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
    updateCountdown();
    setInterval(updateCountdown, 1000);

    $$("button[data-open]").forEach((b) => {
      const id = Number(b.getAttribute("data-open"));
      b.addEventListener("click", () => {
        unlocked.add(id);
        saveUnlocked(unlocked);
        confettiBurst();
        softBeep();
        window.location.href = `capsule.html?m=${id}`;
      });
    });
  }

  function typewriter(el, text, speed = 14) {
    el.textContent = "";
    let i = 0;
    const tick = () => {
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        i++;
        setTimeout(tick, text[i - 1] === "\n" ? speed * 4 : speed);
      }
    };
    tick();
  }

  function renderCapsule(data) {
    const params = new URLSearchParams(location.search);
    const id = Number(params.get("m") || "1");
    const month =
      data.months.find((m) => Number(m.id) === id) || data.months[0];
    const unlocked = loadUnlocked();

    const unlockTime = parseISO(month.unlockDate).getTime();
    const canOpen = now().getTime() >= unlockTime;
    const header = $("#capTitle");
    const dynTitle = displayTitleForMonth(month, data);
    const greet =
      (CURRENT_SETTINGS && CURRENT_SETTINGS.capsuleGreeting) ||
      "Happy Monthsary!";
    header.textContent = `${greet} (${dynTitle})`;

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

    if (overlay && letterFull) {
      typewriter(letterFull, letterText, 12);

      letterEl.textContent = letterText;
      if (closeOverlay) {
        closeOverlay.onclick = () => {
          overlay.classList.add("hidden");
        };
      }
    } else {
      typewriter(letterEl, letterText);
    }

    const strip = $("#photos");
    strip.innerHTML = "";
    (month.photos || []).forEach((src) => {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.src = src;
      img.alt = "Photo";
      strip.appendChild(img);
    });

    const audio = $("#voice");
    if (month.voiceNote) {
      audio.src = month.voiceNote;
      audio.style.display = "block";
    } else {
      audio.style.display = "none";
    }

    $("#surprise").textContent = month.surprise || "";

    const start = data.startDate ? parseISO(data.startDate) : now();
    const daysTogether = Math.max(
      0,
      Math.floor((now().getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    );
    const songs = data.months.reduce(
      (acc, m) => acc + (m.songsAdded || []).length,
      0
    );
    const places = data.months.reduce(
      (acc, m) => acc + (m.placesVisited || []).length,
      0
    );
    $("#statDays").textContent = String(daysTogether);
    $("#statSongs").textContent = String(songs);
    $("#statPlaces").textContent = String(places);

    $("#backHome").addEventListener(
      "click",
      () => (window.location.href = "index.html")
    );
  }

  (async function init() {
    const data = ensureUnlockDates(await loadData());
    CURRENT_SETTINGS = mergeSettings(data.settings);
    applySettings(CURRENT_SETTINGS);
    if (PAGE === "home") renderHome(data);
    if (PAGE === "capsule") renderCapsule(data);

    $$('a[href$="admin.html"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        gateAdmin(true);
      });
    });
  })();
})();
