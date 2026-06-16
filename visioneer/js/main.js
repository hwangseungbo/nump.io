/* Visioneer — render + 2축 필터(작업×모달리티) + 검색 */
(function () {
  const state = { task: "all", mod: "all", q: "" };
  const grid = document.getElementById("modelsGrid");
  const countEl = document.getElementById("resultCount");

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function card(m, idx) {
    const t = TASKS[m.task] || { label: m.task, icon: "" };
    const mod = MODALITIES[m.modality] || m.modality;
    const tags = (m.tags || []).slice(0, 3).map((x) => `<span class="vt-tag">${esc(x)}</span>`).join("");
    const host = /github\.com/.test(m.link) ? "GitHub" : "Hugging Face";
    const img = m.modality === "multi"
      ? MULTI_IMG[idx % MULTI_IMG.length]
      : (MODALITY_IMG[m.modality] || MULTI_IMG[0]);
    return `<a class="vt-card" href="${esc(m.link)}" target="_blank" rel="noopener"
      data-task="${m.task}" data-mod="${m.modality}"
      data-text="${esc((m.name + " " + m.org + " " + (m.tags || []).join(" ") + " " + t.label + " " + mod).toLowerCase())}">
      <div class="vt-thumb">
        <img class="vt-img" src="${esc(img)}" alt="${esc(mod)} 의료영상" loading="lazy" onerror="this.style.display='none'" />
        <span class="vt-scrim"></span>
        ${OVERLAYS[m.task] || ""}
        <span class="vt-task-badge">${t.icon} ${esc(t.label)}</span>
        <span class="vt-mod-badge">${esc(mod)}</span>
      </div>
      <div class="vt-body">
        <div class="vt-head"><h3>${esc(m.name)}</h3><span class="vt-host">${host} ↗</span></div>
        <div class="vt-org">${esc(m.org)}</div>
        <p class="vt-desc">${esc(m.desc)}</p>
        <div class="vt-tags">${tags}</div>
        <div class="vt-meta"><span>⚙ ${esc(m.params)}</span><span>· ${esc(m.license)}</span></div>
      </div>
    </a>`;
  }

  function apply() {
    const q = state.q.trim().toLowerCase();
    let shown = 0;
    grid.querySelectorAll(".vt-card").forEach((el) => {
      const okTask = state.task === "all" || el.dataset.task === state.task;
      const okMod = state.mod === "all" || el.dataset.mod === state.mod || el.dataset.mod === "multi";
      const okQ = !q || el.dataset.text.includes(q);
      const show = okTask && okMod && okQ;
      el.style.display = show ? "" : "none";
      if (show) shown++;
    });
    if (countEl) countEl.textContent = shown;
    const empty = document.getElementById("emptyState");
    if (empty) empty.style.display = shown ? "none" : "block";
  }

  function setActive(sel, attr, val) {
    document.querySelectorAll(sel).forEach((b) => b.classList.toggle("active", b.dataset[attr] === val));
  }

  function init() {
    grid.innerHTML = MODELS.map(card).join("");

    document.querySelectorAll(".task-card").forEach((b) =>
      b.addEventListener("click", () => {
        state.task = state.task === b.dataset.task ? "all" : b.dataset.task;
        setActive(".task-card", "task", state.task);
        apply();
        document.getElementById("models-section").scrollIntoView({ behavior: "smooth", block: "start" });
      })
    );
    document.querySelectorAll(".mod-chip").forEach((b) =>
      b.addEventListener("click", () => {
        state.mod = b.dataset.mod;
        setActive(".mod-chip", "mod", state.mod);
        apply();
      })
    );
    document.querySelectorAll(".v-search").forEach((inp) =>
      inp.addEventListener("input", (e) => {
        state.q = e.target.value;
        document.querySelectorAll(".v-search").forEach((o) => { if (o !== e.target) o.value = e.target.value; });
        apply();
      })
    );

    // 통계 자동 채움
    const sN = document.getElementById("statModels");
    if (sN) sN.textContent = MODELS.length + "+";
    const tN = document.getElementById("statTasks");
    if (tN) tN.textContent = Object.keys(TASKS).length;
    const mN = document.getElementById("statMods");
    if (mN) mN.textContent = (Object.keys(MODALITIES).length - 1) + "+"; // 'multi' 제외

    // 이미지 출처/라이선스 표기 (CC 저작자 표시)
    const cc = document.getElementById("imgCredits");
    if (cc && typeof IMAGE_CREDITS !== "undefined") {
      cc.innerHTML = IMAGE_CREDITS.map((c) =>
        `<a href="${esc(c.url)}" target="_blank" rel="noopener" class="cred">
           <b>${esc(c.mod)}</b> ${esc(c.title)} — ${esc(c.author)} · ${esc(c.license)}</a>`
      ).join("");
    }

    apply();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
