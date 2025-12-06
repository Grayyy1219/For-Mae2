(() => {
  const PAGE = document.body.getAttribute("data-page") || "home";
  const STORAGE_UNLOCKED = "mtc_unlocked_months";
  const STORAGE_OVERRIDE = "mtc_capsules_override";
  const STORAGE_AUDIO_PREF = "mtc_bg_audio_enabled";
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
  function loadAudioPreference() {
    try {
      const stored = localStorage.getItem(STORAGE_AUDIO_PREF);
      if (stored === null) return true;
      return stored === "1";
    } catch {
      return true;
    }
  }

  function saveAudioPreference(enabled) {
    try {
      localStorage.setItem(STORAGE_AUDIO_PREF, enabled ? "1" : "0");
    } catch {}
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
        const d = new Date(year, i, day, 0, 0, 1, 0);
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
              else vid.addEventListener("loadeddata", playVideo, { once: true });
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
      if (months > 0 && months % 12 === 0) {
        const years = Math.floor(months / 12);
        return `${ordinal(years)} Anniversary`;
      }
      return `${ordinal(months)} month`;
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
    const detail = marker.dataset.detail || "";

    const safeTitle = escapeHTML(title);
    const safeStatus = escapeHTML(status);
    const safeUnlock = escapeHTML(unlockLabel);
    const safeDetail = escapeHTML(detail);

    tooltip.innerHTML = `
      <div class="progress-tooltip__title">${safeTitle}</div>
      <div class="progress-tooltip__meta">
        <span class="progress-tooltip__badge">${safeStatus}</span>
        ${unlockLabel ? `<span class="progress-tooltip__separator">•</span> <span>${safeUnlock}</span>` : ""}
      </div>
      ${detail ? `<div class="progress-tooltip__detail">${safeDetail}</div>` : ""}
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
        <div class="media-modal__controls">
          <a class="btn btn-primary media-modal__open" href="#">Open this month</a>
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

    const sources = Array.isArray(month.photos)
      ? month.photos.map(normalizeMediaSrc).filter(Boolean)
      : [];

    const slidesHtml = sources
      .map((src, i) => {
        const safeSrc = escapeHTML(src);
        const isVideo = MEDIA_EXT_VIDEO.test(src);
        if (isVideo) {
          return `
            <div class="media-modal__slide" role="listitem" data-index="${i}">
              <video src="${safeSrc}" preload="metadata" loop muted playsinline></video>
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

    const cacheEntry = { slidesHtml, sources };
    mediaSlidesCache.set(month.id, cacheEntry);

    if (sources.length) primeMediaSource(sources[0]);

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
    const next = (mediaModalIndex + delta + mediaModalSlides.length) %
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
    document.body.classList.remove("has-modal-open");
  }

  function setMediaModalLoading(modal, { isLoading, title, subtitle } = {}) {
    if (!modal) return;
    modal.classList.toggle("is-loading", !!isLoading);
    const slider = modal.querySelector(".media-modal__slider");
    if (slider) slider.setAttribute("aria-busy", isLoading ? "true" : "false");

    const loaderTitle = modal.querySelector(".media-modal__loading-title");
    const loaderSubtitle = modal.querySelector(".media-modal__loading-subtitle");
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

  function showMediaModal(month, data, options = {}) {
    const { deferSlides = false, loadingSubtitle } = options;
    const modal = ensureMediaModal();
    const slidesWrap = modal.querySelector(".media-modal__slides");
    const titleEl = modal.querySelector(".media-modal__title");
    const cta = modal.querySelector(".media-modal__open");
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
    if (subtitleEl) subtitleEl.textContent = "Little memories from this capsule";
    cta.setAttribute("href", unlockHref);

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

      setMediaModalLoading(modal, { isLoading: false });

      if (mediaModalSlides.length) {
        setActiveMediaSlide(0);
        stopMediaTimer();
        mediaModalTimer = window.setInterval(() => {
          setActiveMediaSlide((mediaModalIndex + 1) % mediaModalSlides.length);
        }, 2000);
      }
    };

    document.body.classList.add("has-modal-open");
    modal.classList.add("is-visible");
    modal.setAttribute("aria-hidden", "false");
    modal.focus({ preventScroll: true });

    if (!deferSlides) {
      requestAnimationFrame(renderSlides);
    }

    return { renderSlides };
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

  function attachMarkerInteractions(marker, month, data, { isOpenable, unlockMs }) {
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

  function renderProgressMarkers(monthStates, data) {
    const container = $("#progressMarkers");
    if (!container || !monthStates.length) return;
    hideProgressTooltip();
    container.innerHTML = "";

    const angleStep = 360 / monthStates.length;

    monthStates.forEach(({ month, status, unlockDate, unlockMs, isOpenable }, index) => {
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

      const unlockLabel = isOpenable
        ? "Ready to open"
        : `Opens ${unlockDate.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}`;

      const detailSource = month.surprise || month.letter || "";
      const detail = detailSource.length > 140
        ? detailSource.slice(0, 137) + "…"
        : detailSource;

      marker.dataset.title = displayTitleForMonth(month, data);
      marker.dataset.status = status;
      marker.dataset.statusLabel = statusTextFor(status);
      marker.dataset.unlockLabel = unlockLabel;
      marker.dataset.month = String(index + 1);
      marker.dataset.ready = String(isOpenable);
      marker.dataset.unlockMs = String(unlockMs);
      if (detail) marker.dataset.detail = detail;

      marker.setAttribute(
        "aria-label",
        `${marker.dataset.title}: ${marker.dataset.statusLabel}. ${unlockLabel}`
      );

      attachMarkerInteractions(marker, month, data, { isOpenable, unlockMs });
      container.appendChild(marker);
    });
  }

  function renderHome(data) {
    const unlocked = loadUnlocked();
    setRingProgress(unlocked.size);

    const monthsGrid = $("#monthsGrid");
    monthsGrid.innerHTML = "";
    let nextUnlockMs = Infinity;
    let currentOpenable = null;
    const nowMs = now().getTime();

    const monthStates = data.months.map((m) => {
      const unlockDate = parseISO(m.unlockDate);
      const unlockMs = unlockDate.getTime();
      const isUnlocked = unlocked.has(m.id);
      const isOpenable = nowMs >= unlockMs;
      const status = isUnlocked ? "Unlocked" : isOpenable ? "Ready" : "Locked";
      return { month: m, unlockDate, unlockMs, isUnlocked, isOpenable, status };
    });

    monthStates.forEach(({ month, unlockMs, isUnlocked, isOpenable, status }) => {
      if (!isUnlocked && isOpenable && currentOpenable === null)
        currentOpenable = month;
      if (!isOpenable) nextUnlockMs = Math.min(nextUnlockMs, unlockMs - nowMs);

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

    renderProgressMarkers(monthStates, data);

    if (currentOpenable) {
      primeMonthSlides(currentOpenable);
    }

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
    updateCountdown();
    setInterval(updateCountdown, 1000);

    $$("button[data-open]").forEach((b) => {
      const id = Number(b.getAttribute("data-open"));
      b.addEventListener("click", () => {
        unlocked.add(id);
        saveUnlocked(unlocked);
        confettiBurst();
        softBeep();
        window.location.href = `capsule.html?m=${id}&auto=open`;
      });
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

    const strip = $("#photos");
    strip.innerHTML = "";

    (month.photos || []).forEach((src) => {
      const isVideo = /\.mp4(\?|#|$)/i.test(src);

      if (isVideo) {
        const v = document.createElement("video");
        v.src = src;
        v.loop = true;
        v.autoplay = true;
        v.muted = true;
        v.playsInline = true;
        v.preload = "metadata";

        v.className = "media";
        strip.appendChild(v);
      } else {
        const img = document.createElement("img");
        img.loading = "lazy";
        img.decoding = "async";
        img.src = src;
        img.alt = "Photo";
        img.className = "media";
        strip.appendChild(img);
      }
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

    $("#backHome").addEventListener(
      "click",
      () => (window.location.href = "index.html")
    );
  }

  (async function init() {
    const data = ensureUnlockDates(await loadData());
    CURRENT_SETTINGS = mergeSettings(data.settings);
    applySettings(CURRENT_SETTINGS);
    setupAudioToggle();

    if (PAGE === "home" || PAGE === "admin") {
      initMediaBackground(data);
    }
    if (PAGE === "home") {
      renderHome(data);
    }
    if (PAGE === "capsule") renderCapsule(data);

    $$('a[href$="admin.html"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        gateAdmin(true);
      });
    });
  })();
  if (typeof window !== "undefined") {
    window.__initMediaBackground = initMediaBackground;
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
