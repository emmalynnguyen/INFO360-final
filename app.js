/* SmartLearn interactive prototype (vanilla JS, single-file router) */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const LS_KEY = "smartlearn.v1";

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function nowIso() {
  return new Date().toISOString();
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function loadState() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function defaultState() {
  return {
    user: null,
    session: { isAuthed: false },
    profile: {
      school: "School / University of Washington",
      major: "Major: Informatics",
      year: "Year: Sophomore",
    },
    study: {
      continue: [
        { id: "c5", title: "Chapter 5: Derivatives", course: "Calculus I", updatedAt: nowIso(), progress: 0.42 },
        { id: "ohm", title: "Ohm’s Law", course: "Physics I", updatedAt: nowIso(), progress: 0.18 },
      ],
      history: [
        { id: "c3", title: "Chapter 3: Vector Spaces", course: "Linear Algebra", updatedAt: nowIso(), score: 78 },
        { id: "we", title: "Work and Energy", course: "Physics I", updatedAt: nowIso(), score: 84 },
        { id: "nl", title: "Newton’s Law", course: "Physics I", updatedAt: nowIso(), score: 71 },
      ],
    },
    library: {
      docs: [],
    },
    generator: {
      lastPrompt: "",
      lastPlan: null,
    },
    resources: {
      selected: null,
      quiz: null,
      flashcards: null,
    },
    discussion: {
      threads: [
        {
          id: "t1",
          title: "Can someone explain chain rule?",
          messages: [
            { id: uid(), author: "You", body: "I’m stuck on how to set up the inner function.", at: nowIso() },
            { id: uid(), author: "StudyBuddy", body: "Try identifying the 'inside' first, then differentiate outside * inside'.", at: nowIso() },
          ],
        },
      ],
    },
    ui: {
      route: { name: "auth.login", params: {} },
      nav: [],
    },
  };
}

const state = loadState() ?? defaultState();
saveState(state);

const content = $("#content");
const titleEl = $("#title");
const crumbEl = $("#crumb");
const btnBack = $("#btnBack");
const topbarEl = $("#topbar");
const tabbar = $("#tabbar");
const toast = $("#toast");
const sheet = $("#sheet");
const sheetTitle = $("#sheetTitle");
const sheetBody = $("#sheetBody");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function setRoute(name, params = {}, { replace = false } = {}) {
  const prev = state.ui.route;
  const next = { name, params };
  if (!replace && prev) state.ui.nav.push(prev);
  state.ui.route = next;
  saveState(state);
  render();
}

function canGoBack() {
  return state.ui.nav.length > 0;
}

function goBack() {
  const prev = state.ui.nav.pop();
  if (!prev) return;
  state.ui.route = prev;
  saveState(state);
  render();
}

function openSheet(title, html) {
  sheetTitle.textContent = title;
  sheetBody.innerHTML = html;
  sheet.showModal();
}

function closeSheet() {
  try {
    sheet.close();
  } catch {
    // ignore
  }
}

function requireAuth() {
  if (!state.session.isAuthed) {
    state.ui.nav = [];
    state.ui.route = { name: "auth.login", params: {} };
    saveState(state);
  }
}

function setTopbar({ title, crumb, backEnabled }) {
  titleEl.textContent = title;
  crumbEl.textContent = crumb ?? "";
  btnBack.disabled = !backEnabled;
}

function setTabbarVisible(visible) {
  tabbar.classList.toggle("hidden", !visible);
}

function setActiveTab(tab) {
  $$(".tab", tabbar).forEach((b) => {
    const active = b.dataset.tab === tab;
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
}

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtShortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function scoreColor(score) {
  if (score >= 85) return "var(--aqua)";
  if (score >= 70) return "var(--amber)";
  return "var(--pink)";
}

function seedDemoDoc() {
  if (state.library.docs.length) return;
  state.library.docs.push({
    id: uid(),
    title: "Chapter 5: Derivatives",
    author: "Calculus I",
    text: "I need a study method. Please generate: 1) key passages, 2) a 1-page summary, 3) practice questions, 4) flashcards, 5) common mistakes.",
    createdAt: nowIso(),
  });
  saveState(state);
}

function generateStudyPlan(prompt) {
  const p = prompt.trim();
  const base = p || "Study for upcoming exam using spaced repetition and active recall.";
  const key = [
    "Focus on definitions and theorems you can restate without notes.",
    "Turn headings into questions; answer them from memory.",
    "Do 3 timed mini-sets to practice retrieval under pressure.",
    "Review mistakes list; rework until you can explain the fix.",
  ];

  return {
    prompt: base,
    actions: [
      { id: "scan", label: "Scan Page", detail: "Capture or paste text to extract key concepts." },
      { id: "highlight", label: "Highlight Key Passages", detail: "Auto-pick terms, formulas, and 'why' lines." },
      { id: "summary", label: "AI Summary", detail: "Create a 1-page summary with bullet takeaways." },
      { id: "practice", label: "Practice Questions", detail: "Generate mixed difficulty questions + solutions." },
      { id: "review", label: "Review mistakes", detail: "Track errors and schedule quick re-tests." },
    ],
    tips: key,
  };
}

function buildQuizFromDoc(docTitle) {
  return {
    id: uid(),
    title: docTitle,
    index: 0,
    correct: 0,
    questions: [
      { q: "Differentiate \(x^2\).", choices: ["2x", "x", "x^3", "2"], a: 0 },
      { q: "Derivative of \u03c3(x)=sin(x) is…", choices: ["cos(x)", "-cos(x)", "sin(x)", "-sin(x)"], a: 0 },
      { q: "Chain rule helps when you have…", choices: ["A sum", "A product", "A composition", "A constant"], a: 2 },
      { q: "Critical points occur when…", choices: ["f(x)=0", "f'(x)=0 or undefined", "f''(x)=0", "x=1"], a: 1 },
      { q: "A common mistake is…", choices: ["Checking units", "Forgetting inner derivative", "Writing steps", "Using scratch work"], a: 1 },
    ],
    answers: [],
  };
}

function buildFlashcardsFromDoc(docTitle) {
  return {
    id: uid(),
    title: docTitle,
    index: 0,
    cards: [
      { front: "Derivative of \(x^n\)", back: "\(n x^{n-1}\)" },
      { front: "Chain rule", back: "If \(y=f(g(x))\), then \(y' = f'(g(x))\\cdot g'(x)\)." },
      { front: "Product rule", back: "\((uv)' = u'v + uv'\)" },
      { front: "Quotient rule", back: "\((u/v)' = (u'v - uv')/v^2\)" },
      { front: "Critical point", back: "Where \(f'(x)=0\) or undefined (and \(f\) exists)." },
    ],
  };
}

function routeMeta(route) {
  const n = route.name;
  if (n.startsWith("auth.")) return { tabbar: false, tab: null };
  if (n.startsWith("tab.home")) return { tabbar: true, tab: "home" };
  if (n.startsWith("tab.scan")) return { tabbar: true, tab: "scan" };
  if (n.startsWith("tab.add")) return { tabbar: true, tab: "add" };
  if (n.startsWith("tab.resources")) return { tabbar: true, tab: "resources" };
  if (n.startsWith("tab.profile")) return { tabbar: true, tab: "profile" };
  return { tabbar: true, tab: "home" };
}

function render() {
  const route = state.ui.route;
  const meta = routeMeta(route);
  setTabbarVisible(meta.tabbar);
  if (meta.tab) setActiveTab(meta.tab);

  // auth gate
  if (!route.name.startsWith("auth.") && !state.session.isAuthed) {
    requireAuth();
    return render();
  }

  const view = views[route.name] ?? views["notfound"];
  const out = view(route.params || {});

  topbarEl.classList.toggle("hidden", !(out.topbarVisible ?? true));

  setTopbar({
    title: out.title,
    crumb: out.crumb,
    backEnabled: canGoBack() && (out.backEnabled ?? true),
  });

  content.innerHTML = out.html;
  content.focus({ preventScroll: true });

  // wire events after render
  if (typeof out.afterRender === "function") out.afterRender();
}

function authLogin(emailOrUser, password) {
  const u = (emailOrUser || "").trim();
  const p = (password || "").trim();
  if (!u || p.length < 3) return { ok: false, msg: "Enter a username/email and a password." };
  state.user = { name: "Emma L.", email: u.includes("@") ? u : `${u}@example.com` };
  state.session.isAuthed = true;
  state.ui.nav = [];
  saveState(state);
  seedDemoDoc();
  return { ok: true };
}

function authSignup(name, email, password) {
  const n = (name || "").trim();
  const e = (email || "").trim();
  const p = (password || "").trim();
  if (!n || !e.includes("@") || p.length < 6) {
    return { ok: false, msg: "Use a real email, and a password (6+ chars)." };
  }
  state.user = { name: n, email: e };
  state.session.isAuthed = true;
  state.ui.nav = [];
  saveState(state);
  seedDemoDoc();
  return { ok: true };
}

function logout() {
  state.session.isAuthed = false;
  state.user = null;
  state.ui.nav = [];
  state.ui.route = { name: "auth.login", params: {} };
  saveState(state);
  showToast("Logged out.");
  render();
}

function renderBrand() {
  return `
    <div class="brand">
      <div class="brand-mark" aria-hidden="true"></div>
      <div>
        <div class="brand-name">SmartLearn</div>
        <div class="brand-bar" aria-hidden="true">
          <span class="b1"></span><span class="b2"></span><span class="b3"></span><span class="b4"></span><span class="b5"></span>
        </div>
      </div>
    </div>
  `;
}

function docSelectOptions(selectedId) {
  const opts = state.library.docs
    .map((d) => `<option value="${esc(d.id)}" ${d.id === selectedId ? "selected" : ""}>${esc(d.title)}</option>`)
    .join("");
  return `<select id="docPicker" aria-label="Choose document">${opts || '<option value="">No docs yet</option>'}</select>`;
}

const views = {
  "auth.login": () => ({
    title: "LOGIN",
    crumb: "",
    backEnabled: false,
    topbarVisible: false,
    html: `
      ${renderBrand()}
      <div class="card stack">
        <div class="field">
          <div class="label">Username or email address</div>
          <input id="loginUser" placeholder="Username or email address" autocomplete="username" />
        </div>
        <div class="field">
          <div class="label">Password</div>
          <input id="loginPass" type="password" placeholder="Password" autocomplete="current-password" />
          <button class="btn ghost sm" id="btnForgot" type="button">Forgot password?</button>
        </div>
        <button class="btn primary" id="btnLogin" type="button">Login</button>
        <div class="divider">or</div>
        <div class="altlist">
          <button class="alt aqua" id="btnAltUser" type="button">Login with username</button>
          <button class="alt teal" id="btnAltCanvas" type="button">Login with Canvas</button>
          <button class="alt pink" id="btnAltGmail" type="button">Login with Gmail</button>
        </div>
        <div class="subtle">
          New here? <button class="btn ghost sm" id="toSignup" type="button">Create an account</button>
        </div>
      </div>
    `,
    afterRender() {
      $("#btnLogin").onclick = () => {
        const r = authLogin($("#loginUser").value, $("#loginPass").value);
        if (!r.ok) return showToast(r.msg);
        showToast("Welcome back.");
        setRoute("tab.home.main", {}, { replace: true });
      };
      $("#toSignup").onclick = () => setRoute("auth.signup");
      $("#btnForgot").onclick = () => openSheet("Password reset", `<p class="subtle">Prototype only — no real reset flow. Use any password (3+ chars).</p>`);
      $("#btnAltUser").onclick = () => showToast("Prototype: same as normal login.");
      $("#btnAltCanvas").onclick = () => showToast("Prototype: Canvas SSO simulated.");
      $("#btnAltGmail").onclick = () => showToast("Prototype: Gmail SSO simulated.");
    },
  }),

  "auth.signup": () => ({
    title: "SIGN UP",
    crumb: "Sign up page",
    topbarVisible: false,
    html: `
      ${renderBrand()}
      <div class="card stack">
        <div class="field">
          <div class="label">Full Name</div>
          <input id="suName" placeholder="Full Name" autocomplete="name" />
        </div>
        <div class="field">
          <div class="label">Email Address</div>
          <input id="suEmail" placeholder="Email Address" autocomplete="email" />
        </div>
        <div class="field">
          <div class="label">Password</div>
          <input id="suPass" type="password" placeholder="Password (6+ characters)" autocomplete="new-password" />
        </div>
        <button class="btn primary" id="btnSignup" type="button">Sign up</button>
        <div class="divider">or</div>
        <button class="btn ghost" id="toLogin" type="button">Back to Login</button>
      </div>
    `,
    afterRender() {
      $("#btnSignup").onclick = () => {
        const r = authSignup($("#suName").value, $("#suEmail").value, $("#suPass").value);
        if (!r.ok) return showToast(r.msg);
        showToast("Account created.");
        setRoute("tab.home.main", {}, { replace: true });
      };
      $("#toLogin").onclick = () => setRoute("auth.login", {}, { replace: true });
    },
  }),

  "tab.home.main": () => {
    const cont = state.study.continue;
    const hist = state.study.history;
    const current = cont[0];
    const pct = Math.round((current?.progress ?? 0) * 100);
    return {
      title: "Home",
      crumb: "",
      html: `
        <div class="card stack">
          <div class="it-title">Continue studying</div>
          ${
            current
              ? `
            <div class="item" id="continueCard" role="button" tabindex="0">
              <div class="ic" aria-hidden="true">▶</div>
              <div class="it-main">
                <div class="it-title">${esc(current.title)}</div>
                <div class="it-sub">${esc(current.course)} · ${fmtShortDate(current.updatedAt)}</div>
                <div class="spacer"></div>
                <div class="progress" aria-label="Progress"><div style="width:${clamp(pct, 2, 100)}%"></div></div>
              </div>
              <div class="chev" aria-hidden="true">›</div>
            </div>`
              : `<div class="subtle">Nothing yet. Add content to start a study set.</div>`
          }
          <div class="divider">Study history</div>
          <div class="list">
            ${hist
              .slice(0, 3)
              .map(
                (h) => `
              <div class="item studyRow" data-id="${esc(h.id)}">
                <div class="ic" aria-hidden="true">📄</div>
                <div class="it-main">
                  <div class="it-title">${esc(h.title)}</div>
                  <div class="it-sub">${esc(h.course)} · ${fmtShortDate(h.updatedAt)}</div>
                </div>
                <div class="chev" aria-hidden="true" style="color:${scoreColor(h.score)}">${h.score}%</div>
              </div>`
              )
              .join("")}
          </div>
          <div class="row">
            <button class="btn ghost" id="btnAllHistory" type="button">View all</button>
            <button class="btn primary" id="btnBuild" type="button">Build study method</button>
          </div>
        </div>
      `,
      afterRender() {
        $("#btnBuild").onclick = () => setRoute("tab.home.generator");
        $("#btnAllHistory").onclick = () => setRoute("tab.home.history");
        const c = $("#continueCard");
        if (c) {
          c.onclick = () => setRoute("tab.home.continue");
          c.onkeydown = (e) => e.key === "Enter" && c.click();
        }
        $$(".studyRow").forEach((r) => {
          r.onclick = () => setRoute("tab.home.history");
        });
      },
    };
  },

  "tab.home.continue": () => ({
    title: "Continue studying",
    crumb: "Home",
    html: `
      <div class="card stack">
        <div class="it-title">Continue studying</div>
        <div class="list">
          ${state.study.continue
            .map((c) => {
              const pct = Math.round((c.progress ?? 0) * 100);
              return `
                <div class="item contRow" data-id="${esc(c.id)}">
                  <div class="ic" aria-hidden="true">▶</div>
                  <div class="it-main">
                    <div class="it-title">${esc(c.title)}</div>
                    <div class="it-sub">${esc(c.course)} · ${fmtShortDate(c.updatedAt)}</div>
                    <div class="spacer"></div>
                    <div class="progress"><div style="width:${clamp(pct, 2, 100)}%"></div></div>
                  </div>
                  <div class="chev" aria-hidden="true">›</div>
                </div>
              `;
            })
            .join("")}
        </div>
        <button class="btn primary" id="btnOpenResources" type="button">Open resources</button>
      </div>
    `,
    afterRender() {
      $("#btnOpenResources").onclick = () => setRoute("tab.resources.main");
      $$(".contRow").forEach((r) => (r.onclick = () => setRoute("tab.resources.main")));
    },
  }),

  "tab.home.history": () => ({
    title: "Study history",
    crumb: "Home",
    html: `
      <div class="card stack">
        <div class="it-title">Study history</div>
        <div class="list">
          ${state.study.history
            .map(
              (h) => `
              <div class="item histRow" data-id="${esc(h.id)}">
                <div class="ic" aria-hidden="true">🗂</div>
                <div class="it-main">
                  <div class="it-title">${esc(h.title)}</div>
                  <div class="it-sub">${esc(h.course)} · ${fmtShortDate(h.updatedAt)}</div>
                </div>
                <div class="chev" aria-hidden="true" style="color:${scoreColor(h.score)}">${h.score}%</div>
              </div>`
            )
            .join("")}
        </div>
        <button class="btn primary" id="btnBackHome" type="button">Back to home</button>
      </div>
    `,
    afterRender() {
      $("#btnBackHome").onclick = () => setRoute("tab.home.main");
      $$(".histRow").forEach((r) => (r.onclick = () => openSheet("Session details", `<p class="subtle">Prototype details only. Add analytics later if needed.</p>`)));
    },
  }),

  "tab.home.generator": () => {
    const last = state.generator.lastPlan;
    return {
      title: "Build Study Method",
      crumb: "Data Analysis page",
      html: `
        <div class="card stack">
          <div class="field">
            <div class="label">Describe how you want to study…</div>
            <textarea id="genPrompt" placeholder="I want a study method where I write a 1 page summary, then do flashcards, then practice questions...">${esc(
              state.generator.lastPrompt || ""
            )}</textarea>
          </div>
          <div class="row">
            <button class="btn pill" id="btnRun" type="button">Run</button>
            <button class="btn primary pill" id="btnGenerate" type="button">GENERATE <span aria-hidden="true">›</span></button>
          </div>
        </div>
        ${
          last
            ? `
          <div class="spacer"></div>
          <div class="card stack">
            <div class="it-title">Suggested actions</div>
            <div class="list">
              ${last.actions
                .map(
                  (a) => `
                <div class="item genAction" data-action="${esc(a.id)}">
                  <div class="ic" aria-hidden="true">⚙</div>
                  <div class="it-main">
                    <div class="it-title">${esc(a.label)}</div>
                    <div class="it-sub">${esc(a.detail)}</div>
                  </div>
                  <div class="chev" aria-hidden="true">›</div>
                </div>`
                )
                .join("")}
            </div>
            <button class="btn ghost" id="btnTips" type="button">Review tips</button>
          </div>
        `
            : ""
        }
      `,
      afterRender() {
        $("#btnRun").onclick = () => showToast("Prototype: 'Run' simulated.");
        $("#btnGenerate").onclick = () => {
          const p = $("#genPrompt").value;
          const plan = generateStudyPlan(p);
          state.generator.lastPrompt = p;
          state.generator.lastPlan = plan;
          saveState(state);
          showToast("Study method generated.");
          render();
        };
        const tips = $("#btnTips");
        if (tips) {
          tips.onclick = () => {
            const plan = state.generator.lastPlan;
            openSheet(
              "Review tips",
              `<div class="stack">
                ${(plan?.tips || []).map((t) => `<div class="item"><div class="ic" aria-hidden="true">✓</div><div class="it-main"><div class="it-title">${esc(t)}</div></div></div>`).join("")}
              </div>`
            );
          };
        }
        $$(".genAction").forEach((row) => {
          row.onclick = () => {
            const a = row.dataset.action;
            if (a === "scan") return setRoute("tab.scan.main");
            if (a === "summary") return setRoute("tab.resources.summary");
            if (a === "practice") return setRoute("tab.resources.quiz");
            if (a === "highlight") return openSheet("Highlight Key Passages", `<p class="subtle">Prototype: highlights are inferred from your text later. For now, continue to Resources.</p><button class="btn primary" type="button" id="goRes">Go to Resources</button>`);
            if (a === "review") return openSheet("Review mistakes", `<p class="subtle">Prototype: we’ll store mistakes per quiz attempt. Take a quiz to create mistakes.</p>`);
            showToast("Action opened.");
          };
        });
        const goRes = $("#goRes");
        if (goRes) goRes.onclick = () => setRoute("tab.resources.main");
      },
    };
  },

  "tab.scan.main": () => ({
    title: "Scan your text",
    crumb: "Scanning page",
    html: `
      <div class="card stack">
        <div class="it-title">Scan your text</div>
        <div class="subtle">This is a web prototype — use the text box to simulate a scan.</div>
        <div class="field">
          <div class="label">Paste text from your notes / book / worksheet</div>
          <textarea id="scanText" placeholder="Paste or type text here..."></textarea>
        </div>
        <div class="row">
          <button class="btn ghost" id="btnClearScan" type="button">Clear</button>
          <button class="btn primary" id="btnSaveScan" type="button">Save to My Documents</button>
        </div>
      </div>
    `,
    afterRender() {
      $("#btnClearScan").onclick = () => ($("#scanText").value = "");
      $("#btnSaveScan").onclick = () => {
        const txt = $("#scanText").value.trim();
        if (!txt) return showToast("Paste some text first.");
        const doc = {
          id: uid(),
          title: `Scanned notes (${new Date().toLocaleDateString()})`,
          author: "Unknown",
          text: txt,
          createdAt: nowIso(),
        };
        state.library.docs.unshift(doc);
        saveState(state);
        showToast("Saved to My Documents.");
        setRoute("tab.add.main");
      };
    },
  }),

  "tab.add.main": () => {
    const docs = state.library.docs;
    return {
      title: "Add Content",
      crumb: "Data Input page",
      html: `
        <div class="card stack">
          <div class="it-title">Document Information</div>
          <div class="row">
            <div class="field">
              <div class="label">Document title</div>
              <input id="docTitle" placeholder="e.g., Chapter 5: Derivatives" />
            </div>
            <div class="field">
              <div class="label">Author / course</div>
              <input id="docAuthor" placeholder="e.g., Calculus I" />
            </div>
          </div>
          <div class="field">
            <div class="label">Upload / paste document text</div>
            <textarea id="docText" placeholder="Paste your document text here..."></textarea>
          </div>
          <div class="row">
            <button class="btn ghost" id="btnFromScan" type="button">From Scan</button>
            <button class="btn primary" id="btnSaveDoc" type="button">Generate resource</button>
          </div>
          <div class="divider">My Documents</div>
          <div class="list">
            ${
              docs.length
                ? docs
                    .slice(0, 4)
                    .map(
                      (d) => `
                <div class="item docRow" data-id="${esc(d.id)}">
                  <div class="ic" aria-hidden="true">📎</div>
                  <div class="it-main">
                    <div class="it-title">${esc(d.title)}</div>
                    <div class="it-sub">${esc(d.author || "—")} · ${fmtShortDate(d.createdAt)}</div>
                  </div>
                  <div class="chev" aria-hidden="true">›</div>
                </div>`
                    )
                    .join("")
                : `<div class="subtle">No documents yet. Scan a page or paste text above.</div>`
            }
          </div>
        </div>
      `,
      afterRender() {
        $("#btnFromScan").onclick = () => setRoute("tab.scan.main");
        $("#btnSaveDoc").onclick = () => {
          const title = $("#docTitle").value.trim();
          const author = $("#docAuthor").value.trim();
          const text = $("#docText").value.trim();
          if (!title || !text) return showToast("Add a title and some text.");
          const doc = { id: uid(), title, author, text, createdAt: nowIso() };
          state.library.docs.unshift(doc);
          saveState(state);
          showToast("Saved. Opening Resources…");
          state.resources.selected = doc.id;
          saveState(state);
          setRoute("tab.resources.main");
        };
        $$(".docRow").forEach((r) => {
          r.onclick = () => {
            const id = r.dataset.id;
            state.resources.selected = id;
            saveState(state);
            setRoute("tab.resources.main");
          };
        });
      },
    };
  },

  "tab.profile.main": () => ({
    title: "Profile",
    crumb: "",
    html: `
      <div class="card stack">
        <div class="it-title">Profile</div>
        <div class="subtle">Name: <b>${esc(state.user?.name ?? "—")}</b></div>
        <div class="subtle">Email: <b>${esc(state.user?.email ?? "—")}</b></div>
        <div class="divider">School</div>
        <div class="field">
          <div class="label">School</div>
          <input id="pfSchool" value="${esc(state.profile.school)}" />
        </div>
        <div class="field">
          <div class="label">Major</div>
          <input id="pfMajor" value="${esc(state.profile.major)}" />
        </div>
        <div class="field">
          <div class="label">Year</div>
          <input id="pfYear" value="${esc(state.profile.year)}" />
        </div>
        <div class="row">
          <button class="btn primary" id="btnSaveProfile" type="button">Save</button>
          <button class="btn ghost" id="btnLogout" type="button">Log out</button>
        </div>
        <div class="divider">Connect</div>
        <div class="row">
          <button class="btn" id="btnCanvas" type="button">Connect to Canvas</button>
          <button class="btn" id="btnGoogle" type="button">Connect to Google</button>
        </div>
      </div>
    `,
    afterRender() {
      $("#btnSaveProfile").onclick = () => {
        state.profile.school = $("#pfSchool").value.trim() || state.profile.school;
        state.profile.major = $("#pfMajor").value.trim() || state.profile.major;
        state.profile.year = $("#pfYear").value.trim() || state.profile.year;
        saveState(state);
        showToast("Profile saved.");
      };
      $("#btnLogout").onclick = () => logout();
      $("#btnCanvas").onclick = () => showToast("Prototype: Canvas connected.");
      $("#btnGoogle").onclick = () => showToast("Prototype: Google connected.");
    },
  }),

  "tab.resources.main": () => {
    const selected = state.resources.selected ?? state.library.docs[0]?.id ?? null;
    if (selected && selected !== state.resources.selected) {
      state.resources.selected = selected;
      saveState(state);
    }
    const doc = state.library.docs.find((d) => d.id === selected) ?? null;

    return {
      title: "My Resources",
      crumb: "my resources",
      html: `
        <div class="card stack">
          <div class="row" style="align-items:center">
            <div style="flex:1">
              <div class="it-title">My Resources</div>
              <div class="subtle">Choose a document, then open a resource.</div>
            </div>
            <button class="btn ghost sm" id="btnManageDocs" type="button">Docs</button>
          </div>
          ${doc ? `<div class="field"><div class="label">Selected document</div>${docSelectOptions(selected)}</div>` : `<div class="subtle">No documents. Add content first.</div>`}
          <div class="grid2">
            <button class="tile pink" id="goQuiz" type="button">
              <div class="t-ic" aria-hidden="true">?</div>
              <div class="t-lb">Quiz</div>
            </button>
            <button class="tile teal" id="goVideo" type="button">
              <div class="t-ic" aria-hidden="true">▶</div>
              <div class="t-lb">Video</div>
            </button>
            <button class="tile aqua" id="goSummary" type="button">
              <div class="t-ic" aria-hidden="true">≡</div>
              <div class="t-lb">Summary</div>
            </button>
            <button class="tile amber" id="goFlash" type="button">
              <div class="t-ic" aria-hidden="true">▭</div>
              <div class="t-lb">Flashcards</div>
            </button>
            <button class="tile purple" id="goDiscuss" type="button">
              <div class="t-ic" aria-hidden="true">💬</div>
              <div class="t-lb">Discussion</div>
            </button>
            <button class="tile" id="goGenerator" type="button">
              <div class="t-ic" aria-hidden="true">⚙</div>
              <div class="t-lb">Study method</div>
            </button>
          </div>
        </div>
      `,
      afterRender() {
        const ensureDoc = () => {
          const id = state.resources.selected ?? state.library.docs[0]?.id;
          if (!id) {
            showToast("Add content first.");
            setRoute("tab.add.main");
            return null;
          }
          return id;
        };
        $("#btnManageDocs").onclick = () => {
          const rows = state.library.docs
            .map(
              (d) => `
              <div class="item pickDoc" data-id="${esc(d.id)}">
                <div class="ic" aria-hidden="true">📄</div>
                <div class="it-main">
                  <div class="it-title">${esc(d.title)}</div>
                  <div class="it-sub">${esc(d.author || "—")} · ${fmtShortDate(d.createdAt)}</div>
                </div>
                <div class="chev" aria-hidden="true">›</div>
              </div>
            `
            )
            .join("");
          openSheet(
            "My Documents",
            `<div class="stack">
              ${rows || `<div class="subtle">No docs yet.</div>`}
              <button class="btn primary" id="sheetAdd" type="button">Add content</button>
            </div>`
          );
          const add = $("#sheetAdd");
          if (add) add.onclick = () => (closeSheet(), setRoute("tab.add.main"));
          $$(".pickDoc", sheetBody).forEach((r) => {
            r.onclick = () => {
              state.resources.selected = r.dataset.id;
              saveState(state);
              closeSheet();
              render();
            };
          });
        };

        const picker = $("#docPicker");
        if (picker) {
          picker.onchange = () => {
            state.resources.selected = picker.value;
            saveState(state);
            showToast("Document selected.");
          };
        }

        $("#goQuiz").onclick = () => (ensureDoc() ? setRoute("tab.resources.quiz") : null);
        $("#goVideo").onclick = () => (ensureDoc() ? setRoute("tab.resources.video") : null);
        $("#goSummary").onclick = () => (ensureDoc() ? setRoute("tab.resources.summary") : null);
        $("#goFlash").onclick = () => (ensureDoc() ? setRoute("tab.resources.flashcards") : null);
        $("#goDiscuss").onclick = () => setRoute("tab.resources.discussion");
        $("#goGenerator").onclick = () => setRoute("tab.home.generator");
      },
    };
  },

  "tab.resources.video": () => ({
    title: "Video",
    crumb: "My Resources",
    html: `
      <div class="card stack">
        <div class="it-title">Video</div>
        <div class="subtle">Prototype player (no real video). Use it as a placeholder.</div>
        <div class="card" style="padding:0; overflow:hidden">
          <div style="aspect-ratio: 16/9; background: radial-gradient(300px 180px at 30% 40%, rgba(82,210,255,.18), transparent 60%), rgba(255,255,255,.04); display:grid; place-items:center;">
            <div class="ic" style="width:56px;height:56px;border-radius:18px;font-size:22px">▶</div>
          </div>
          <div style="padding:12px">
            <div class="it-title">Chapter walkthrough</div>
            <div class="it-sub">Auto-generated from your document</div>
            <div class="spacer"></div>
            <div class="row">
              <button class="btn ghost" id="btnVidPrev" type="button">Prev</button>
              <button class="btn primary" id="btnVidNext" type="button">Next</button>
            </div>
          </div>
        </div>
      </div>
    `,
    afterRender() {
      $("#btnVidPrev").onclick = () => showToast("Prototype: previous clip.");
      $("#btnVidNext").onclick = () => showToast("Prototype: next clip.");
    },
  }),

  "tab.resources.summary": () => {
    const id = state.resources.selected ?? state.library.docs[0]?.id ?? null;
    const doc = state.library.docs.find((d) => d.id === id) ?? null;
    const title = doc?.title ?? "Summary";
    return {
      title: "Summary",
      crumb: "My Resources",
      html: `
        <div class="card stack">
          <div class="it-title">1-Page Summary</div>
          <div class="subtle"><b>${esc(title)}</b></div>
          <div class="card" style="background:rgba(255,255,255,.03)">
            <div class="it-title" style="margin-bottom:8px">Important concepts</div>
            <div class="subtle">
              - Differentiate common functions (power, trig).<br/>
              - Use chain rule for compositions.<br/>
              - Practice identifying common mistakes (missing inner derivative).<br/>
              - Track errors and re-test quickly.
            </div>
            <div class="divider">Your notes</div>
            <div class="subtle" style="white-space:pre-wrap">${esc((doc?.text || "").slice(0, 360) + ((doc?.text || "").length > 360 ? "…" : ""))}</div>
          </div>
          <div class="row">
            <button class="btn ghost" id="btnDownloadSummary" type="button">Download</button>
            <button class="btn primary" id="btnNextSummary" type="button">Next</button>
          </div>
        </div>
      `,
      afterRender() {
        $("#btnDownloadSummary").onclick = () => {
          const blob = new Blob([`SmartLearn Summary\n\n${title}\n\n(Prototype)\n`], { type: "text/plain" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "smartlearn-summary.txt";
          a.click();
          URL.revokeObjectURL(a.href);
          showToast("Downloaded.");
        };
        $("#btnNextSummary").onclick = () => setRoute("tab.resources.quiz");
      },
    };
  },

  "tab.resources.quiz": () => {
    const id = state.resources.selected ?? state.library.docs[0]?.id ?? null;
    const doc = state.library.docs.find((d) => d.id === id) ?? null;
    if (!state.resources.quiz || state.resources.quiz.title !== (doc?.title ?? "")) {
      state.resources.quiz = buildQuizFromDoc(doc?.title ?? "Quiz");
      saveState(state);
    }
    const quiz = state.resources.quiz;
    const q = quiz.questions[quiz.index];
    const pct = Math.round(((quiz.index) / quiz.questions.length) * 100);
    return {
      title: "Quiz",
      crumb: "My Resources",
      html: `
        <div class="card stack">
          <div class="it-title">${esc(doc?.title ?? "Quiz")}</div>
          <div class="subtle">Question ${quiz.index + 1} / ${quiz.questions.length}</div>
          <div class="progress" aria-label="Quiz progress"><div style="width:${clamp(pct, 6, 100)}%"></div></div>
          <div class="card" style="background:rgba(255,255,255,.03)">
            <div class="it-title" style="margin-bottom:10px">${esc(q.q)}</div>
            <div class="stack">
              ${q.choices
                .map(
                  (c, i) => `
                <button class="item choice" data-i="${i}" type="button" style="text-align:left">
                  <div class="ic" aria-hidden="true">${String.fromCharCode(65 + i)}</div>
                  <div class="it-main"><div class="it-title">${esc(c)}</div></div>
                </button>`
                )
                .join("")}
            </div>
          </div>
          <div class="row">
            <button class="btn ghost" id="btnQuizHint" type="button">Hint</button>
            <button class="btn primary" id="btnQuizCheck" type="button" disabled>Check</button>
          </div>
        </div>
      `,
      afterRender() {
        let selected = null;
        $$(".choice").forEach((b) => {
          b.onclick = () => {
            $$(".choice").forEach((x) => (x.style.borderColor = "rgba(255,255,255,.10)"));
            b.style.borderColor = "rgba(97,240,207,.35)";
            selected = Number(b.dataset.i);
            $("#btnQuizCheck").disabled = false;
          };
        });
        $("#btnQuizHint").onclick = () => openSheet("Hint", `<p class="subtle">Prototype hint: recall the core definition/rule and apply it to the simplest example.</p>`);
        $("#btnQuizCheck").onclick = () => {
          if (selected == null) return;
          const correct = selected === q.a;
          quiz.answers.push({ at: nowIso(), q: quiz.index, selected, correct });
          if (correct) quiz.correct += 1;
          saveState(state);

          openSheet(
            correct ? "Correct" : "Not quite",
            `<div class="stack">
              <div class="subtle">${correct ? "Nice — keep going." : `Correct answer: <b>${esc(q.choices[q.a])}</b>`}</div>
              <button class="btn primary" id="btnNextQ" type="button">${quiz.index + 1 === quiz.questions.length ? "Finish" : "Next question"}</button>
            </div>`
          );
          const next = $("#btnNextQ");
          if (next) {
            next.onclick = () => {
              closeSheet();
              if (quiz.index + 1 >= quiz.questions.length) {
                const score = Math.round((quiz.correct / quiz.questions.length) * 100);
                state.study.history.unshift({
                  id: uid(),
                  title: doc?.title ?? "Quiz session",
                  course: doc?.author || "—",
                  updatedAt: nowIso(),
                  score,
                });
                state.resources.quiz = null;
                saveState(state);
                showToast(`Finished: ${score}%`);
                setRoute("tab.resources.flashcards");
              } else {
                quiz.index += 1;
                saveState(state);
                render();
              }
            };
          }
        };
      },
    };
  },

  "tab.resources.flashcards": () => {
    const id = state.resources.selected ?? state.library.docs[0]?.id ?? null;
    const doc = state.library.docs.find((d) => d.id === id) ?? null;
    if (!state.resources.flashcards || state.resources.flashcards.title !== (doc?.title ?? "")) {
      state.resources.flashcards = buildFlashcardsFromDoc(doc?.title ?? "Flashcards");
      saveState(state);
    }
    const fc = state.resources.flashcards;
    const card = fc.cards[fc.index];
    return {
      title: "Flashcards",
      crumb: "My Resources",
      html: `
        <div class="card stack">
          <div class="it-title">${esc(doc?.title ?? "Flashcards")}</div>
          <div class="subtle">Card ${fc.index + 1} / ${fc.cards.length}</div>
          <button class="card" id="flipCard" type="button" style="cursor:pointer; text-align:left">
            <div class="subtle">Tap to flip</div>
            <div class="spacer"></div>
            <div class="it-title" id="cardFace">${esc(card.front)}</div>
          </button>
          <div class="row">
            <button class="btn ghost" id="btnPrevCard" type="button">Prev</button>
            <button class="btn primary" id="btnNextCard" type="button">Next</button>
          </div>
        </div>
      `,
      afterRender() {
        let flipped = false;
        const face = $("#cardFace");
        $("#flipCard").onclick = () => {
          flipped = !flipped;
          face.textContent = flipped ? card.back : card.front;
        };
        $("#btnPrevCard").onclick = () => {
          fc.index = (fc.index - 1 + fc.cards.length) % fc.cards.length;
          saveState(state);
          render();
        };
        $("#btnNextCard").onclick = () => {
          fc.index = (fc.index + 1) % fc.cards.length;
          saveState(state);
          render();
        };
      },
    };
  },

  "tab.resources.discussion": () => {
    const t = state.discussion.threads[0];
    return {
      title: "Discussion",
      crumb: "My Resources",
      html: `
        <div class="card stack">
          <div class="it-title">${esc(t.title)}</div>
          <div class="card" style="background:rgba(255,255,255,.03)">
            <div class="stack" id="msgs">
              ${t.messages
                .map(
                  (m) => `
                <div class="item" style="cursor:default">
                  <div class="ic" aria-hidden="true">${m.author === "You" ? "👤" : "🤝"}</div>
                  <div class="it-main">
                    <div class="it-title">${esc(m.author)}</div>
                    <div class="it-sub" style="white-space:pre-wrap">${esc(m.body)}</div>
                  </div>
                </div>`
                )
                .join("")}
            </div>
          </div>
          <div class="field">
            <div class="label">Reply</div>
            <textarea id="reply" placeholder="Type your message..."></textarea>
          </div>
          <div class="row">
            <button class="btn ghost" id="btnSort" type="button">Sort</button>
            <button class="btn primary" id="btnSend" type="button">Send</button>
          </div>
        </div>
      `,
      afterRender() {
        $("#btnSend").onclick = () => {
          const body = $("#reply").value.trim();
          if (!body) return showToast("Write a message first.");
          t.messages.push({ id: uid(), author: "You", body, at: nowIso() });
          $("#reply").value = "";
          saveState(state);
          render();
          setTimeout(() => {
            t.messages.push({
              id: uid(),
              author: "StudyBuddy",
              body: "Good question. Try working a small example step-by-step and explain each step in words.",
              at: nowIso(),
            });
            saveState(state);
            render();
            showToast("New reply.");
          }, 700);
        };
        $("#btnSort").onclick = () => {
          t.messages.reverse();
          saveState(state);
          render();
          showToast("Sorted.");
        };
      },
    };
  },

  "notfound": () => ({
    title: "Not found",
    crumb: "",
    html: `
      <div class="card stack">
        <div class="it-title">Screen not found</div>
        <div class="subtle">This route doesn’t exist in the prototype.</div>
        <button class="btn primary" id="btnGoHome" type="button">Go home</button>
      </div>
    `,
    afterRender() {
      $("#btnGoHome").onclick = () => setRoute("tab.home.main", {}, { replace: true });
    },
  }),
};

// global UI wiring
btnBack.addEventListener("click", () => goBack());

tabbar.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  const tab = btn.dataset.tab;
  if (!state.session.isAuthed) return setRoute("auth.login", {}, { replace: true });
  if (tab === "home") return setRoute("tab.home.main");
  if (tab === "scan") return setRoute("tab.scan.main");
  if (tab === "add") return setRoute("tab.add.main");
  if (tab === "resources") return setRoute("tab.resources.main");
  if (tab === "profile") return setRoute("tab.profile.main");
});

sheet.addEventListener("click", (e) => {
  const rect = sheet.querySelector(".sheet-card")?.getBoundingClientRect();
  if (!rect) return;
  const inCard = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
  if (!inCard) closeSheet();
});

// initial render
render();

