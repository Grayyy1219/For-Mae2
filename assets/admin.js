import { database, ref, set } from "./firebase.js";

(() => {
  let stateApi = null;
  let downloadUrl = null;
  let ignoreResetFeedback = false;

  const parseList = (value) =>
    (value || "")
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

  const getBaseState = () =>
    stateApi && typeof stateApi.getState === "function"
      ? stateApi.getState()
      : null;

  const updateNextIdDisplay = () => {
    const badge = document.getElementById("nextCapsuleId");
    if (!badge) return;
    const baseState = getBaseState() || {};
    const months = Array.isArray(baseState?.months) ? baseState.months : [];
    const nextId =
      months.reduce((acc, month) => {
        const id = Number(month?.id);
        return Number.isFinite(id) ? Math.max(acc, id) : acc;
      }, 0) + 1;
    badge.textContent = `#${nextId}`;
    badge.title = months.length
      ? `${months.length} capsule${months.length === 1 ? "" : "s"} stored`
      : "No capsules yet";
  };

  const hideFeedback = () => {
    const box = document.getElementById("contribFeedback");
    if (box) {
      box.classList.add("hidden");
      box.classList.remove("success");
      box.textContent = "";
    }
  };

  const showSuccess = (message) => {
    const box = document.getElementById("contribFeedback");
    if (!box) return;
    box.textContent = message;
    box.classList.add("success");
    box.classList.remove("hidden");
  };

  const renderErrors = (errors) => {
    const node = document.getElementById("contribErrors");
    if (!node) return;
    if (!errors || !errors.length) {
      node.classList.add("hidden");
      node.innerHTML = "";
      return;
    }
    const listItems = errors.map((msg) => `<li>${msg}</li>`).join("");
    node.innerHTML = `<ul>${listItems}</ul>`;
    node.classList.remove("hidden");
  };

  const clearFieldErrors = (form) => {
    if (!form) return;
    form
      .querySelectorAll(".input-error")
      .forEach((el) => el.classList.remove("input-error"));
  };

  const markError = (el) => {
    if (el) {
      el.classList.add("input-error");
    }
  };

  const resetDownloadLink = () => {
    const link = document.getElementById("downloadUpdatedJson");
    if (!link) return;
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      downloadUrl = null;
    }
    link.classList.add("hidden");
    link.removeAttribute("href");
    link.removeAttribute("download");
  };

  const setFirebaseFeedback = (message, tone = "info") => {
    const node = document.getElementById("firebaseUploadStatus");
    if (!node) return;
    node.textContent = message;
    node.classList.remove("hidden", "success", "feedback-error");
    if (tone === "success") {
      node.classList.add("success");
    } else if (tone === "error") {
      node.classList.add("feedback-error");
    }
  };

  const attachFirebaseUpload = () => {
    const button = document.getElementById("uploadFirebase");
    const status = document.getElementById("firebaseUploadStatus");
    if (!button || button.dataset.bound === "true") return;
    button.dataset.bound = "true";

    if (status) {
      status.classList.add("hidden");
      status.textContent = "";
    }

    button.addEventListener("click", async () => {
      if (!stateApi || typeof stateApi.getState !== "function") {
        setFirebaseFeedback(
          "Capsule data is not ready yet. Load the data before uploading.",
          "error"
        );
        return;
      }

      const currentState = stateApi.getState();
      if (!currentState) {
        setFirebaseFeedback("No capsule data found to upload.", "error");
        return;
      }

      const confirmed = window.confirm(
        "This will overwrite the Firebase database root with the current capsule data and patch notes. Continue?"
      );
      if (!confirmed) return;

      setFirebaseFeedback("Uploading data to Firebase…");
      let patchNotes = null;

      try {
        const res = await fetch("data/patch-notes.json", { cache: "no-store" });
        if (res.ok) {
          patchNotes = await res.json();
        }
      } catch {
        patchNotes = null;
      }

      try {
        await set(ref(database), {
          capsules: currentState,
          patchNotes: patchNotes || { notes: [] },
          updatedAt: new Date().toISOString(),
        });
        setFirebaseFeedback(
          "Upload complete! Firebase now has the latest capsules and patch notes.",
          "success"
        );
      } catch (err) {
        setFirebaseFeedback(
          `Upload failed: ${err?.message || "Unknown error"}`,
          "error"
        );
      }
    });
  };

  const setDownloadLink = (blob, nextId) => {
    const link = document.getElementById("downloadUpdatedJson");
    if (!link) return;
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }
    downloadUrl = URL.createObjectURL(blob);
    link.href = downloadUrl;
    link.download = `capsules-${nextId}.json`;
    link.textContent = `Download updated JSON (#${nextId})`;
    link.classList.remove("hidden");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const form = event.target;
    if (!form || form.id !== "capsuleContributionForm") return;

    if (!stateApi || typeof stateApi.getState !== "function") {
      renderErrors([
        "Capsule data is not ready yet. Fetch the current data before adding a new entry.",
      ]);
      return;
    }
    if (typeof stateApi.updateState !== "function") {
      renderErrors([
        "Unable to update the capsule data. Reload the page and try again.",
      ]);
      return;
    }

    hideFeedback();
    renderErrors([]);
    clearFieldErrors(form);

    const titleInput = document.getElementById("contribTitle");
    const dateInput = document.getElementById("contribUnlockDate");
    const descInput = document.getElementById("contribDescription");
    const mediaInput = document.getElementById("contribMedia");
    const surpriseInput = document.getElementById("contribSurprise");
    const voiceInput = document.getElementById("contribVoice");
    const songsInput = document.getElementById("contribSongs");
    const placesInput = document.getElementById("contribPlaces");

    const errors = [];

    const title = titleInput?.value.trim() || "";
    if (!title) {
      errors.push("Please add a capsule title.");
      markError(titleInput);
    }

    const unlockValue = dateInput?.value || "";
    let unlockISO = "";
    if (!unlockValue) {
      errors.push("Choose an unlock date and time.");
      markError(dateInput);
    } else {
      const unlock = new Date(unlockValue);
      if (Number.isNaN(unlock.getTime())) {
        errors.push("The unlock date could not be understood. Please pick a valid date.");
        markError(dateInput);
      } else {
        unlockISO = unlock.toISOString();
      }
    }

    const descriptionRaw = (descInput?.value || "").trim();
    if (!descriptionRaw) {
      errors.push("Share a description or letter for the capsule.");
      markError(descInput);
    }
    const description = descriptionRaw.replace(/\r\n/g, "\n");

    const mediaList = parseList(mediaInput?.value || "");
    if (!mediaList.length) {
      errors.push("Add at least one media URL or file path.");
      markError(mediaInput);
    }

    const songsList = parseList(songsInput?.value || "");
    const placesList = parseList(placesInput?.value || "");
    const voiceNote = voiceInput?.value.trim() || "";
    const surprise = surpriseInput?.value.trim() || "";

    if (errors.length) {
      renderErrors(errors);
      return;
    }

    const baseState = getBaseState() || {};
    const months = Array.isArray(baseState?.months)
      ? baseState.months.slice()
      : [];
    const maxId = months.reduce((acc, month) => {
      const id = Number(month?.id);
      return Number.isFinite(id) ? Math.max(acc, id) : acc;
    }, 0);
    const nextId = maxId + 1 || 1;

    const newCapsule = {
      id: nextId,
      title,
      unlockDate: unlockISO,
      letter: description,
      photos: mediaList,
      surprise,
      voiceNote,
      songsAdded: songsList,
      placesVisited: placesList,
    };

    const updated = {
      ...baseState,
      months: [...months, newCapsule],
    };

    stateApi.updateState(
      updated,
      `Added capsule #${nextId} from the contribution form.`
    );

    const blob = new Blob([JSON.stringify(updated, null, 2)], {
      type: "application/json",
    });
    setDownloadLink(blob, nextId);
    showSuccess(
      `Capsule #${nextId} is ready! Download the updated JSON and share it with the maintainer.`
    );

    ignoreResetFeedback = true;
    form.reset();
    ignoreResetFeedback = false;
    updateNextIdDisplay();

    const downloadLink = document.getElementById("downloadUpdatedJson");
    if (downloadLink) {
      downloadLink.focus();
    }
  };

  const handleInput = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.classList.contains("input-error")) {
      target.classList.remove("input-error");
    }
    if (target.id && target.id.startsWith("contrib")) {
      hideFeedback();
      renderErrors([]);
    }
  };

  const handleReset = (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    clearFieldErrors(form);
    if (ignoreResetFeedback) {
      updateNextIdDisplay();
      return;
    }
    hideFeedback();
    renderErrors([]);
    resetDownloadLink();
    updateNextIdDisplay();
  };

  const attachForm = () => {
    const form = document.getElementById("capsuleContributionForm");
    if (!form || form.dataset.bound === "true") {
      updateNextIdDisplay();
      return;
    }
    form.dataset.bound = "true";
    form.addEventListener("submit", handleSubmit);
    form.addEventListener("input", handleInput);
    form.addEventListener("reset", handleReset);
    updateNextIdDisplay();
  };

  window.__setupCapsuleContribution = (api) => {
    stateApi = api;
    attachForm();
    updateNextIdDisplay();
    return {
      emitStateChange: updateNextIdDisplay,
    };
  };

  document.addEventListener("admin:rendered", () => {
    attachForm();
    attachFirebaseUpload();
  });
})();
