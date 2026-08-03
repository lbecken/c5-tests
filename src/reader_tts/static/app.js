/* reader-tts local interface.
 *
 * No framework and no build step. All text from the server or the user is
 * inserted with textContent, never innerHTML, so a document can never be
 * rendered as markup.
 */
"use strict";

const API = "/api/v1";


const state = {
  languages: [],
  language: "en-us",
  documentId: null,
  sentences: [],
  currentIndex: 0,
  jobId: null,
  polling: null,
  playing: false,
  voice: null,
  speed: 1.0,
  validated: false,
  pronunciationWord: null,
};

const el = (id) => document.getElementById(id);

const dom = {
  health: el("health"),
  language: el("language"),
  languageHint: el("language-hint"),
  title: el("title"),
  text: el("text"),
  counts: el("counts"),
  validate: el("validate"),
  loadSample: el("load-sample"),
  clear: el("clear"),
  validationEmpty: el("validation-empty"),
  validationBody: el("validation-body"),
  validationStats: el("validation-stats"),
  coverageBar: el("coverage-bar"),
  coverageLabel: el("coverage-label"),
  issues: el("issues"),
  voice: el("voice"),
  speed: el("speed"),
  speedValue: el("speed-value"),
  mode: el("mode"),
  generate: el("generate"),
  cancel: el("cancel"),
  progressArea: el("progress-area"),
  progressBar: el("progress-bar"),
  progressLabel: el("progress-label"),
  readerEmpty: el("reader-empty"),
  readerBody: el("reader-body"),
  sentences: el("sentences"),
  previous: el("previous"),
  play: el("play"),
  next: el("next"),
  timeline: el("timeline"),
  time: el("time"),
  regenerate: el("regenerate"),
  editPronunciation: el("edit-pronunciation"),
  export: el("export"),
  exportStatus: el("export-status"),
  player: el("player"),
  preloader: el("preloader"),
  dialog: el("pronunciation-dialog"),
  pronWord: el("pron-word"),
  pronVariants: el("pron-variants"),
  pronArpabet: el("pron-arpabet"),
  pronNotationLabel: el("pron-notation-label"),
  pronSpelling: el("pron-spelling"),
  pronError: el("pron-error"),
  pronSave: el("pron-save"),
  pronCancel: el("pron-cancel"),
};

/* --- HTTP ------------------------------------------------------------- */

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    let message = `request failed (${response.status})`;
    try {
      const payload = await response.json();
      message = payload.error || payload.detail || message;
      if (Array.isArray(payload.detail)) {
        message = payload.detail.map((d) => d.msg).join("; ");
      }
    } catch (error) {
      /* the body was not JSON; keep the status message */
    }
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}

/* --- Startup ------------------------------------------------------------ */

async function boot() {
  wireEvents();
  updateCounts();
  await loadLanguages();
  await Promise.all([loadHealth(), loadVoices()]);
  await restoreState();
}

/* --- Languages ---------------------------------------------------------- */

async function loadLanguages() {
  try {
    const payload = await request("/languages");
    state.languages = payload.languages;
    state.language = payload.default_language;
  } catch (error) {
    state.languages = [];
    return;
  }
  dom.language.replaceChildren();
  for (const language of state.languages) {
    const option = document.createElement("option");
    option.value = language.code;
    option.textContent = language.display_name;
    dom.language.append(option);
  }
  dom.language.value = state.language;
  describeLanguage();
}

function currentLanguage() {
  return state.languages.find((language) => language.code === state.language) || null;
}

function describeLanguage() {
  const language = currentLanguage();
  if (!language) return;
  const voiceCount = language.voices.length;
  dom.languageHint.textContent =
    `${language.dictionary} dictionary, ${language.notation.toUpperCase()} notation · ` +
    `${voiceCount} voice${voiceCount === 1 ? "" : "s"}` +
    (voiceCount === 1 ? ` (${language.voices[0].display_name}, selected automatically)` : "");
  dom.pronNotationLabel.textContent = language.notation === "ipa" ? "IPA" : "ARPAbet";
  dom.pronArpabet.placeholder = language.notation === "ipa" ? "lɔm" : "L EH1 D";
}

async function changeLanguage() {
  state.language = dom.language.value;
  // A document belongs to one language, so switching starts a new one.
  state.documentId = null;
  state.sentences = [];
  state.validated = false;
  dom.generate.disabled = true;
  dom.validationBody.hidden = true;
  dom.validationEmpty.hidden = false;
  dom.readerBody.hidden = true;
  dom.readerEmpty.hidden = false;
  describeLanguage();
  await Promise.all([loadVoices(), loadHealth()]);
  persistState();
}

async function loadHealth() {
  try {
    const health = await request("/health");
    const engine = health.engine;
    if (!engine.ready) {
      dom.health.textContent = `engine unavailable: ${engine.error || "unknown reason"}`;
      dom.health.className = "status degraded";
      return;
    }
    // Report the count for the selected language, not whichever dictionary
    // happens to be loaded first.
    const loaded = (health.dictionaries || []).find(
      (entry) => entry.language === state.language
    );
    const words = loaded ? ` · ${loaded.entries.toLocaleString()} dictionary words` : "";
    dom.health.textContent = `${engine.name} ready${words}`;
    dom.health.className = "status ready";
  } catch (error) {
    dom.health.textContent = `cannot reach the server: ${error.message}`;
    dom.health.className = "status degraded";
  }
}

async function loadVoices() {
  try {
    const payload = await request(`/voices?language=${encodeURIComponent(state.language)}`);
    dom.voice.replaceChildren();
    for (const voice of payload.voices) {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = voice.available
        ? voice.display_name
        : `${voice.display_name} (file not installed)`;
      option.disabled = !voice.available;
      dom.voice.append(option);
    }
    // A language with one voice needs no choice.
    dom.voice.disabled = payload.voices.length <= 1;
    dom.speed.min = payload.min_speed;
    dom.speed.max = payload.max_speed;
    dom.speed.step = payload.speed_step;
  } catch (error) {
    dom.voice.replaceChildren(new Option("no voices available", ""));
  }
}

async function restoreState() {
  let stored;
  try {
    stored = await request("/reading-state");
  } catch (error) {
    return;
  }
  if (stored.language && stored.language !== state.language) {
    state.language = stored.language;
    dom.language.value = stored.language;
    describeLanguage();
    await loadVoices();
  }
  if (stored.voice_id) dom.voice.value = stored.voice_id;
  if (stored.speed) {
    dom.speed.value = stored.speed;
    dom.speedValue.textContent = Number(stored.speed).toFixed(2);
  }
  if (!stored.document_id) return;

  try {
    const document_ = await request(`/documents/${stored.document_id}`);
    dom.title.value = document_.title;
    dom.text.value = document_.text;
    state.documentId = document_.id;
    if (document_.language && document_.language !== state.language) {
      state.language = document_.language;
      dom.language.value = document_.language;
      describeLanguage();
      await loadVoices();
    }
    state.sentences = document_.sentences;
    state.currentIndex = Math.min(stored.sentence_index || 0, document_.sentences.length - 1);
    updateCounts();
    renderSentences();
    if (state.sentences.some((s) => s.status === "complete")) {
      showReader();
      loadCurrentSentence(stored.offset_seconds || 0);
    }
    await runValidation();
  } catch (error) {
    /* the stored document was deleted; start fresh */
  }
}

function persistState() {
  const body = {
    document_id: state.documentId,
    sentence_index: state.currentIndex,
    offset_seconds: dom.player.currentTime || 0,
    voice_id: dom.voice.value || null,
    speed: Number(dom.speed.value),
    language: state.language,
  };
  request("/reading-state", { method: "PUT", body: JSON.stringify(body) }).catch(() => {});
}

/* --- Input -------------------------------------------------------------- */

function updateCounts() {
  const text = dom.text.value;
  const words = (text.match(/[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’-]*/g) || []).length;
  const sentences = (text.match(/[.!?]+(\s|$)/g) || []).length;
  dom.counts.textContent =
    `${text.length.toLocaleString()} characters · ${words.toLocaleString()} words · ` +
    `${Math.max(sentences, text.trim() ? 1 : 0).toLocaleString()} sentences`;
}

/* --- Validation ---------------------------------------------------------- */

async function validateText() {
  const text = dom.text.value.trim();
  if (!text) {
    setIssuesMessage("Enter some text first.");
    return;
  }
  dom.validate.disabled = true;
  try {
    state.documentId = await ensureDocument(text);
    await runValidation();
  } catch (error) {
    setIssuesMessage(error.message);
    dom.generate.disabled = true;
  } finally {
    dom.validate.disabled = false;
  }
}

async function ensureDocument(text) {
  if (state.documentId) {
    const existing = await request(`/documents/${state.documentId}`).catch(() => null);
    if (existing && existing.text === text.replace(/\r\n?/g, "\n")) {
      state.sentences = existing.sentences;
      return existing.id;
    }
  }
  const created = await request("/documents", {
    method: "POST",
    body: JSON.stringify({
      text,
      title: dom.title.value || null,
      language: state.language,
    }),
  });
  state.sentences = created.sentences;
  state.currentIndex = 0;
  return created.id;
}

async function runValidation() {
  const report = await request(`/documents/${state.documentId}/validate`, {
    method: "POST",
    body: JSON.stringify({ mode: dom.mode.value }),
  });
  renderValidation(report);
  state.validated = report.accepted;
  dom.generate.disabled = !report.accepted;
  renderSentences();
  persistState();
  // Validating loads the language's dictionary, so the header can now report
  // its size.
  loadHealth().catch(() => {});
}

function renderValidation(report) {
  dom.validationEmpty.hidden = true;
  dom.validationBody.hidden = false;

  const s = report.statistics;
  dom.validationStats.replaceChildren(
    ...[
      ["Words", s.words],
      ["Sentences", s.sentences],
      ["Paragraphs", s.paragraphs],
      ["Unknown", s.unsupported_words],
      ["Ambiguous", s.ambiguous_words],
    ].map(([name, value]) => {
      const box = document.createElement("div");
      box.className = "stat";
      const number = document.createElement("span");
      number.className = "value";
      number.textContent = value.toLocaleString();
      const caption = document.createElement("span");
      caption.className = "name";
      caption.textContent = name;
      box.append(number, caption);
      return box;
    })
  );

  const percent = s.words ? (s.supported_words / s.words) * 100 : 100;
  dom.coverageBar.style.width = `${percent.toFixed(1)}%`;
  dom.coverageBar.style.background = report.accepted
    ? "var(--ok)"
    : "var(--error)";
  dom.coverageLabel.textContent =
    `${percent.toFixed(1)}% of words are supported (${s.supported_words} of ${s.words}).`;

  dom.issues.replaceChildren();
  if (!report.accepted) {
    const blocked = document.createElement("p");
    blocked.className = "blocked";
    blocked.textContent =
      "Synthesis is blocked: resolve every error below, or rewrite the affected words.";
    dom.issues.append(blocked);
  }
  for (const issue of report.issues.slice(0, 200)) {
    dom.issues.append(renderIssue(issue));
  }
  if (!report.issues.length) {
    const clean = document.createElement("p");
    clean.className = "hint";
    clean.textContent = "No issues were found.";
    dom.issues.append(clean);
  }
}

function renderIssue(issue) {
  const box = document.createElement("div");
  box.className = `issue ${issue.severity}`;

  if (issue.word !== null && issue.start !== null) {
    const locate = document.createElement("button");
    locate.type = "button";
    locate.className = "where";
    locate.textContent = truncate(issue.word, 40);
    locate.title = `Show at character ${issue.start}`;
    locate.addEventListener("click", () => selectSource(issue.start, issue.end));
    box.append(locate, document.createTextNode(" — "));
  }

  box.append(document.createTextNode(issue.message));

  if (issue.alternatives && issue.alternatives.length) {
    const row = document.createElement("div");
    row.className = "alternatives";
    issue.alternatives.forEach((arpabet, index) => {
      const choose = document.createElement("button");
      choose.type = "button";
      choose.textContent = `[${index}] ${arpabet}`;
      choose.title = "Use this pronunciation for this document";
      choose.addEventListener("click", () =>
        chooseVariant(issue.word, index, arpabet)
      );
      row.append(choose);
    });
    box.append(row);
  }
  return box;
}

function setIssuesMessage(message) {
  dom.validationEmpty.hidden = true;
  dom.validationBody.hidden = false;
  dom.issues.replaceChildren();
  const paragraph = document.createElement("p");
  paragraph.className = "blocked";
  paragraph.textContent = message;
  dom.issues.append(paragraph);
}

function selectSource(start, end) {
  dom.text.focus();
  dom.text.setSelectionRange(start, end);
  const ratio = start / Math.max(dom.text.value.length, 1);
  dom.text.scrollTop = ratio * dom.text.scrollHeight;
}

async function chooseVariant(word, index, arpabet) {
  try {
    await request(`/pronunciation-overrides/${encodeURIComponent(word)}`, {
      method: "PUT",
      body: JSON.stringify({
        phonemes: splitPhonemes(arpabet),
        language: state.language,
        document_id: state.documentId,
        note: `dictionary variant ${index}`,
      }),
    });
    await runValidation();
  } catch (error) {
    setIssuesMessage(error.message);
  }
}

/* --- Synthesis ------------------------------------------------------------- */

async function generate() {
  if (!state.documentId) return;
  dom.generate.disabled = true;
  dom.cancel.hidden = false;
  dom.progressArea.hidden = false;
  dom.progressLabel.textContent = "Starting…";

  try {
    const job = await request(`/documents/${state.documentId}/synthesis-jobs`, {
      method: "POST",
      body: JSON.stringify({
        voice_id: dom.voice.value,
        speed: Number(dom.speed.value),
        validation_mode: dom.mode.value,
      }),
    });
    state.jobId = job.id;
    pollJob();
  } catch (error) {
    dom.progressLabel.textContent = error.message;
    dom.generate.disabled = false;
    dom.cancel.hidden = true;
  }
}

function pollJob() {
  clearInterval(state.polling);
  state.polling = setInterval(async () => {
    try {
      const job = await request(`/synthesis-jobs/${state.jobId}`);
      const done = job.completed_units + job.failed_units;
      const percent = job.total_units ? (done / job.total_units) * 100 : 0;
      dom.progressBar.style.width = `${percent.toFixed(1)}%`;
      dom.progressLabel.textContent =
        `${done} of ${job.total_units} units · ${job.cache_hits} from cache · ` +
        `${job.synthesized_units} generated · ${formatTime(job.generated_duration_seconds)} of audio`;

      if (job.current_sentence_index !== null) {
        state.currentIndex = job.current_sentence_index;
      }
      await refreshSentences();

      if (["completed", "failed", "cancelled"].includes(job.status)) {
        clearInterval(state.polling);
        state.polling = null;
        dom.cancel.hidden = true;
        dom.generate.disabled = false;
        dom.progressLabel.textContent =
          job.status === "completed"
            ? `Finished: ${job.total_units} units, ${job.cache_hits} from cache, ` +
              `${formatTime(job.generated_duration_seconds)} of audio.`
            : `Job ${job.status}: ${job.error_message || "no further detail"}`;
        if (job.completed_units) {
          showReader();
          loadCurrentSentence(0);
        }
      }
    } catch (error) {
      clearInterval(state.polling);
      state.polling = null;
      dom.progressLabel.textContent = error.message;
      dom.generate.disabled = false;
      dom.cancel.hidden = true;
    }
  }, 700);
}

async function cancelJob() {
  if (!state.jobId) return;
  try {
    await request(`/synthesis-jobs/${state.jobId}/cancel`, { method: "POST" });
  } catch (error) {
    dom.progressLabel.textContent = error.message;
  }
}

async function refreshSentences() {
  const document_ = await request(`/documents/${state.documentId}`);
  state.sentences = document_.sentences;
  renderSentences();
}

/* --- Reader ----------------------------------------------------------------- */

function showReader() {
  dom.readerEmpty.hidden = true;
  dom.readerBody.hidden = false;
}

function renderSentences() {
  dom.sentences.replaceChildren();
  state.sentences.forEach((sentence, index) => {
    const item = document.createElement("li");
    item.className = index === state.currentIndex ? "current" : "";
    if (index > 0 && sentence.paragraph_index !== state.sentences[index - 1].paragraph_index) {
      item.classList.add("paragraph-start");
    }
    item.addEventListener("click", () => {
      state.currentIndex = index;
      renderSentences();
      loadCurrentSentence(0, true);
    });

    const number = document.createElement("span");
    number.className = "number";
    number.textContent = String(index + 1);

    const body = document.createElement("span");
    body.className = "body";
    body.textContent = sentence.text;

    const status = document.createElement("span");
    status.className = `state ${sentence.status}`;
    status.textContent = sentence.status === "complete" ? "ready" : sentence.status;

    item.append(number, body, status);
    dom.sentences.append(item);
  });

  const current = dom.sentences.children[state.currentIndex];
  if (current) current.scrollIntoView({ block: "nearest" });
}

function currentSentence() {
  return state.sentences[state.currentIndex] || null;
}

function loadCurrentSentence(offsetSeconds = 0, autoplay = false) {
  const sentence = currentSentence();
  if (!sentence || sentence.status !== "complete") return;
  dom.player.src = `${API}/sentences/${sentence.id}/audio`;
  dom.player.load();
  dom.player.currentTime = 0;
  if (offsetSeconds) {
    dom.player.addEventListener(
      "loadedmetadata",
      () => {
        dom.player.currentTime = Math.min(offsetSeconds, dom.player.duration || 0);
      },
      { once: true }
    );
  }
  if (autoplay || state.playing) {
    dom.player.play().catch(() => {});
  }
  preloadNext();
  renderSentences();
  persistState();
}

function preloadNext() {
  const next = state.sentences[state.currentIndex + 1];
  if (next && next.status === "complete") {
    dom.preloader.src = `${API}/sentences/${next.id}/audio`;
    dom.preloader.load();
  }
}

function togglePlay() {
  if (!dom.player.src) {
    loadCurrentSentence(0, true);
    return;
  }
  if (dom.player.paused) {
    state.playing = true;
    dom.player.play().catch(() => {});
  } else {
    state.playing = false;
    dom.player.pause();
  }
  updateTransport();
}

function move(delta) {
  const target = state.currentIndex + delta;
  if (target < 0 || target >= state.sentences.length) return;
  state.currentIndex = target;
  loadCurrentSentence(0, state.playing);
}

function onSentenceEnded() {
  const next = state.currentIndex + 1;
  if (next >= state.sentences.length) {
    state.playing = false;
    updateTransport();
    return;
  }
  state.currentIndex = next;
  loadCurrentSentence(0, true);
}

function updateTransport() {
  dom.play.textContent = dom.player.paused ? "Play" : "Pause";
  dom.previous.disabled = state.currentIndex === 0;
  dom.next.disabled = state.currentIndex >= state.sentences.length - 1;
}

function onTimeUpdate() {
  const duration = dom.player.duration || 0;
  const position = dom.player.currentTime || 0;
  dom.timeline.value = duration ? String((position / duration) * 1000) : "0";
  dom.time.textContent = `${formatTime(position)} / ${formatTime(duration)}`;
}

function seek() {
  const duration = dom.player.duration || 0;
  if (duration) dom.player.currentTime = (Number(dom.timeline.value) / 1000) * duration;
}

async function regenerateCurrent() {
  const sentence = currentSentence();
  if (!sentence) return;
  dom.regenerate.disabled = true;
  try {
    await request(`/sentences/${sentence.id}/regenerate`, {
      method: "POST",
      body: JSON.stringify({
        voice_id: dom.voice.value,
        speed: Number(dom.speed.value),
        bypass_cache: true,
      }),
    });
    await refreshSentences();
    loadCurrentSentence(0);
  } catch (error) {
    dom.progressLabel.textContent = error.message;
    dom.progressArea.hidden = false;
  } finally {
    dom.regenerate.disabled = false;
  }
}

async function exportDocument() {
  if (!state.documentId) return;
  dom.export.disabled = true;
  dom.exportStatus.textContent = "Rendering…";
  try {
    const result = await request(`/documents/${state.documentId}/exports`, {
      method: "POST",
      body: JSON.stringify({
        scope: "document",
        voice_id: dom.voice.value,
        speed: Number(dom.speed.value),
      }),
    });
    dom.exportStatus.replaceChildren();
    const link = document.createElement("a");
    link.href = result.download_url;
    link.download = result.filename;
    link.textContent = `Download ${result.filename} (${formatTime(result.duration_seconds)})`;
    dom.exportStatus.append(link);
  } catch (error) {
    dom.exportStatus.textContent = error.message;
  } finally {
    dom.export.disabled = false;
  }
}

/* --- Pronunciation editor ---------------------------------------------------- */

async function openPronunciationEditor() {
  const selection = dom.text.value
    .slice(dom.text.selectionStart, dom.text.selectionEnd)
    .trim();
  const sentence = currentSentence();
  const fallback = sentence ? (sentence.text.match(/[A-Za-z][A-Za-z'’-]*/) || [""])[0] : "";
  dom.pronWord.value = selection || fallback;
  dom.pronError.hidden = true;
  dom.pronArpabet.value = "";
  dom.pronSpelling.value = "";
  state.pronunciationWord = null;
  dom.pronVariants.replaceChildren();
  dom.dialog.showModal();
  if (dom.pronWord.value) await loadPronunciations(dom.pronWord.value);
}

async function loadPronunciations(word) {
  const normalized = word.trim().toUpperCase();
  if (!normalized) {
    state.pronunciationWord = null;
    dom.pronVariants.replaceChildren();
    return;
  }
  // Reloading an unchanged word would replace the variant buttons. That matters
  // because clicking one blurs the word field, which fires `change`: rebuilding
  // the list here would detach the button between mousedown and mouseup, and the
  // click would never reach its handler.
  if (state.pronunciationWord === normalized) return;
  state.pronunciationWord = normalized;
  dom.pronVariants.replaceChildren();

  try {
    const payload = await request(
      `/dictionary/${encodeURIComponent(normalized)}?language=${encodeURIComponent(state.language)}`
    );
    if (payload.override) dom.pronArpabet.value = payload.override;
    for (const item of payload.pronunciations) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `[${item.variant}] ${item.arpabet}`;
      button.addEventListener("click", () => {
        dom.pronArpabet.value = item.arpabet;
      });
      dom.pronVariants.append(button);
    }
    if (!payload.supported) {
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent =
        "This word is not in the dictionary. Supply an ARPAbet pronunciation to accept it.";
      dom.pronVariants.append(note);
    }
  } catch (error) {
    state.pronunciationWord = null; // allow a retry after a failure
    dom.pronError.textContent = error.message;
    dom.pronError.hidden = false;
  }
}

async function savePronunciation() {
  const word = dom.pronWord.value.trim();
  const arpabet = dom.pronArpabet.value.trim();
  if (!word || !arpabet) {
    dom.pronError.textContent = "A word and an ARPAbet pronunciation are required.";
    dom.pronError.hidden = false;
    return;
  }
  try {
    await request(`/pronunciation-overrides/${encodeURIComponent(word)}`, {
      method: "PUT",
      body: JSON.stringify({
        phonemes: splitPhonemes(arpabet),
        language: state.language,
        synthesis_text: dom.pronSpelling.value.trim() || null,
        document_id: state.documentId,
        note: "set from the reader",
      }),
    });
    dom.dialog.close();
    if (state.documentId) await runValidation();
  } catch (error) {
    dom.pronError.textContent = error.message;
    dom.pronError.hidden = false;
  }
}

/* --- Helpers ------------------------------------------------------------------- */

function splitPhonemes(text) {
  // ARPAbet separates phonemes with spaces; IPA is written as a continuous
  // string, and the server segments it.
  const language = currentLanguage();
  if (language && language.notation === "ipa") return [text.trim()];
  return text.trim().split(/\s+/);
}

function formatTime(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

function truncate(text, limit) {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/* --- Events --------------------------------------------------------------------- */

function wireEvents() {
  dom.text.addEventListener("input", updateCounts);
  dom.validate.addEventListener("click", validateText);
  dom.loadSample.addEventListener("click", () => {
    const language = currentLanguage();
    dom.text.value = language ? language.sample_text : "";
    dom.title.value = dom.title.value || "Sample passage";
    updateCounts();
  });
  dom.language.addEventListener("change", () => {
    changeLanguage().catch(() => {});
  });
  dom.clear.addEventListener("click", () => {
    dom.text.value = "";
    dom.title.value = "";
    state.documentId = null;
    state.sentences = [];
    dom.generate.disabled = true;
    dom.validationBody.hidden = true;
    dom.validationEmpty.hidden = false;
    dom.readerBody.hidden = true;
    dom.readerEmpty.hidden = false;
    updateCounts();
  });

  dom.speed.addEventListener("input", () => {
    dom.speedValue.textContent = Number(dom.speed.value).toFixed(2);
  });
  dom.speed.addEventListener("change", persistState);
  dom.voice.addEventListener("change", persistState);
  dom.mode.addEventListener("change", () => {
    if (state.documentId) runValidation().catch(() => {});
  });

  dom.generate.addEventListener("click", generate);
  dom.cancel.addEventListener("click", cancelJob);

  dom.play.addEventListener("click", togglePlay);
  dom.previous.addEventListener("click", () => move(-1));
  dom.next.addEventListener("click", () => move(1));
  dom.timeline.addEventListener("input", seek);
  dom.player.addEventListener("ended", onSentenceEnded);
  dom.player.addEventListener("timeupdate", onTimeUpdate);
  dom.player.addEventListener("play", updateTransport);
  dom.player.addEventListener("pause", () => {
    updateTransport();
    persistState();
  });

  dom.regenerate.addEventListener("click", regenerateCurrent);
  dom.export.addEventListener("click", exportDocument);
  dom.editPronunciation.addEventListener("click", openPronunciationEditor);
  dom.pronWord.addEventListener("change", () => loadPronunciations(dom.pronWord.value));
  dom.pronSave.addEventListener("click", savePronunciation);
  dom.pronCancel.addEventListener("click", () => dom.dialog.close());

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea, select")) return;
    if (event.code === "Space") {
      event.preventDefault();
      togglePlay();
    } else if (event.code === "ArrowLeft") {
      move(-1);
    } else if (event.code === "ArrowRight") {
      move(1);
    }
  });

  window.addEventListener("beforeunload", persistState);
}

boot();
