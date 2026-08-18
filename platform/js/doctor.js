/* ============================================================
   Basil Nexus — 의사 대시보드 데이터 연동 (P4)
   - GET /api/dashboard/doctor 1회 → 사이드바/일정/서류/통계/최근 환자/배지 렌더
   - GET /api/health → 시스템 상태 4항목
   - GET /api/patients?q= → 레일 검색 → 최근 조회 환자 카드 갱신
   - POST /api/medgemma-chat(SSE) → SageFM 환자 요약 생성 (ai.js 패턴 복제, ai.js 수정 금지)
   - fetch 실패/404 시 정적 목업 그대로 유지 + console.warn (계약 §0)
   ============================================================ */
(function () {
  'use strict';

  var currentPatient = null;  // patientDetail (계약 §4) — AI 요약 대상
  var summarizing = false;

  /* ---------- 유틸 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function renderMd(md) {
    try {
      if (window.marked && window.DOMPurify) return DOMPurify.sanitize(window.marked.parse(md));
    } catch (e) {}
    return esc(md).replace(/\n/g, '<br>');
  }
  // LaTeX 수식 렌더 (KaTeX auto-render) — ai.js typeset 패턴 복제
  function typeset(el) {
    if (!window.renderMathInElement) return;
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false }
        ],
        ignoredTags: ['script', 'style', 'textarea', 'pre', 'code'],
        throwOnError: false
      });
    } catch (e) {}
  }

  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'bnToast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
  }

  function nmLabel(p) { return p.name + ' (' + p.sex + '/' + p.age + ')'; }

  /* ---------- 패널 렌더러 (데이터 수신 성공 후에만 호출) ---------- */

  // 사이드바 "오늘 외래 현황"
  function renderSidebar(sb) {
    if (!sb) return;
    var sns = document.querySelectorAll('#sbStats .sb-stat .sn');
    if (sns[0] && sb.scheduled != null) sns[0].textContent = sb.scheduled + '명';
    if (sns[1] && sb.waiting != null) sns[1].textContent = sb.waiting + '명';
  }

  // "나의 일정" — 기존 .sch-row와 100% 동일한 마크업으로 재생성 (최대 5행)
  function renderSchedule(todayLabel, schedule) {
    var card = document.getElementById('schedCard');
    if (!card || !Array.isArray(schedule)) return;
    var tl = card.querySelector('.tl-t');
    if (tl && todayLabel) tl.textContent = todayLabel;
    var foot = card.querySelector('.docs-foot');
    card.querySelectorAll('.sch-row').forEach(function (el) { el.remove(); });
    var stMap = { now: ['now', '진료 중'], wait: ['wait', '대기'], done: ['done', '완료'] };
    schedule.slice(0, 5).forEach(function (s) {
      var m = stMap[s.status] || stMap.wait;
      var row = document.createElement('div');
      row.className = 'sch-row';
      row.innerHTML =
        '<span class="dot"></span>' +
        '<span class="h">' + esc(s.time) + '</span>' +
        '<span class="nm">' + esc(nmLabel(s)) + '</span>' +
        '<span class="dx">' + esc(s.dx) + '</span>' +
        '<span class="st ' + m[0] + '">' + m[1] + '</span>';
      // P3b: 행 클릭 → 해당 환자 EMR 상세로 (patientId 없으면(구서버) 기존처럼 정적 행)
      if (s.patientId != null) {
        row.classList.add('click');
        row.title = '클릭하면 환자 EMR 상세로 이동합니다';
        row.addEventListener('click', function () { gotoEmr(s.patientId); });
      }
      if (foot) card.insertBefore(row, foot); else card.appendChild(row);
    });
  }

  // P3b: 일정 행 → 환자 검색 뷰로 EMR 딥링크 (bn.docType 패턴과 동일한 1회용 키)
  function gotoEmr(patientId) {
    try { sessionStorage.setItem('bn.emrPid', String(patientId)); } catch (e) {}
    // 이미 같은 뷰에 있으면 hashchange가 안 일어나므로 강제로 재렌더 (알림 딥링크와 동일 패턴)
    if (location.hash === '#view-search') window.dispatchEvent(new Event('hashchange'));
    else location.hash = '#view-search';
  }

  // "나의 서류 요청 현황"
  function renderDocRequests(list) {
    var card = document.getElementById('docReqCard');
    if (!card || !Array.isArray(list)) return;
    card.querySelectorAll('.row-lc').forEach(function (el) { el.remove(); });
    var rows = list.length ? list : [{ type: '대기 중인 서류', count: 0 }];
    rows.forEach(function (d) {
      var row = document.createElement('div');
      row.className = 'row-lc';
      row.innerHTML =
        '<span class="lab">' + esc(d.type + ' 요청') + '</span>' +
        '<span class="c">' + esc(d.count + '건') + '</span>';
      card.appendChild(row);
    });
  }

  // "진료 통계" — 대기/No-Show + 총 진료 수(첫 칸)만. 나머지 3칸은 정적 유지(확정).
  function renderMonthStats(ms) {
    var card = document.getElementById('statsCard');
    if (!card || !ms) return;
    var smns = card.querySelectorAll('.stat-mini .smn');
    if (smns[0] && ms.waiting != null) smns[0].textContent = ms.waiting + '명';
    if (smns[1] && ms.noShow != null) smns[1].textContent = ms.noShow + '명';
    var first = card.querySelector('.stat4 .s4n'); // 첫 칸(총 진료 수)만
    if (first && ms.encounters != null) first.textContent = Number(ms.encounters).toLocaleString() + '건';
  }

  // "시스템 상태" — false면 "점검 필요" + 붉은색
  function renderHealth(h) {
    if (!h) return;
    var svs = document.querySelectorAll('#sysBar .sys-i .sv');
    function setSv(el, val, okLabel) {
      if (!el) return;
      if (val === false) { el.textContent = '점검 필요'; el.classList.add('bad'); }
      else {
        el.textContent = (typeof val === 'string' && val) ? val : okLabel;
        el.classList.remove('bad');
      }
    }
    setSv(svs[0], h.db, '정상');       // On-Premise 연결
    setSv(svs[1], h.llm, '정상');      // 모델 SageFM
    setSv(svs[2], h.backup, '정상');   // 데이터 백업
    setSv(svs[3], h.security, '안전'); // 보안 상태
  }

  // "최근 조회 환자" 카드 (patientDetail) — AI 요약 대상 지정
  function renderRecentPatient(p) {
    var card = document.getElementById('recentCard');
    if (!card || !p) return;
    var pn = card.querySelector('.pt-head .pn');
    if (pn) pn.textContent = nmLabel(p);
    var pid = card.querySelector('.pt-head .pid');
    if (pid) pid.textContent = p.pid || '';
    var vs = card.querySelectorAll('.kv .v'); // 진단 / 처방 / 최근 내원 / 메모
    if (vs[0]) vs[0].textContent = p.dx || '-';
    if (vs[1]) vs[1].textContent = p.rx || '-';
    if (vs[2]) vs[2].textContent = p.lastVisit || '-';
    if (vs[3]) vs[3].textContent = p.memo || '-';
    currentPatient = p;
  }

  // SageFM 카드 정적 불릿 → 안내 문구 (데이터 로드 성공 시에만)
  function setSummaryGuide() {
    var card = document.getElementById('aiSumCard');
    if (!card) return;
    var bullets = card.querySelector('.bullets');
    if (bullets) bullets.innerHTML = '';
    var body = card.querySelector('.ai-summary');
    if (body) body.textContent = 'AI 요약 생성 버튼을 눌러 최신 요약을 만들어 보세요';
  }

  /* ---------- SageFM 환자 요약 (계약 §7) ---------- */
  async function generateSummary() {
    if (summarizing) return;
    if (!currentPatient || !currentPatient.emr) { toast('환자 데이터가 아직 로드되지 않았습니다'); return; }
    var card = document.getElementById('aiSumCard');
    var body = card && card.querySelector('.ai-summary');
    if (!body) return;
    var bullets = card.querySelector('.bullets');
    var btn = document.getElementById('aiSumBtn');

    summarizing = true;
    if (btn) { btn.disabled = true; btn.textContent = '생성 중…'; }
    if (bullets) bullets.innerHTML = '';
    body.textContent = '요약 생성 중…';

    var prompt = '다음 환자의 EMR 데이터를 근거로 주치의용 요약을 한국어 불릿 4~5개로 작성. 수치 변화와 다음 진료 권고 포함.';
    var message = prompt + '\n' + JSON.stringify(currentPatient.emr, null, 2);
    var sessionId = 'bn-sum-' + Math.random().toString(16).slice(2, 10);

    var raw = '';
    try {
      var resp = await fetch('/api/medgemma-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: message })
      });
      if (!resp.ok || !resp.body) throw new Error('서버 응답 오류 (' + resp.status + ')');
      var reader = resp.body.getReader();
      var dec = new TextDecoder();
      var buf = '';
      while (true) {
        var r = await reader.read();
        if (r.done) break;
        buf += dec.decode(r.value, { stream: true });
        var events = buf.split('\n\n');
        buf = events.pop();
        for (var i = 0; i < events.length; i++) {
          var ev = events[i];
          if (ev.indexOf('data: ') !== 0) continue;
          var d;
          try { d = JSON.parse(ev.slice(6)); } catch (e2) { continue; }
          var piece = (d.delta != null) ? d.delta : d.content; // Medgemma=delta, NUMP챗봇=content
          if (piece) { raw += piece; body.innerHTML = renderMd(raw); }
          if (d.error) { body.innerHTML = '<em class="ai-err">⚠️ ' + esc(d.error) + '</em>'; }
        }
      }
      typeset(body); // 스트림 완료 후 수식 렌더
      if (!raw && !body.querySelector('.ai-err')) body.innerHTML = '<em class="ai-err">응답이 없습니다.</em>';
    } catch (e) {
      console.warn('AI 환자 요약 생성 실패:', e);
      body.innerHTML = '<em class="ai-err">⚠️ ' + esc(e.message) + '</em>';
    }
    summarizing = false;
    if (btn) { btn.disabled = false; btn.textContent = 'AI 요약 생성'; }
  }

  /* ---------- 레일 환자 검색 (계약 §4) ---------- */
  async function searchPatient(q) {
    try {
      var r = await fetch('/api/patients?q=' + encodeURIComponent(q));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var d = await r.json();
      var results = (d && d.results) || [];
      if (!results.length) { toast('검색 결과가 없습니다'); return; }
      renderRecentPatient(results[0]); // 첫 결과 → 최근 조회 환자 카드 + AI 요약 대상
      setSummaryGuide();
    } catch (e) {
      console.warn('환자 검색 실패 — 기존 표시 유지:', e);
    }
  }

  /* ---------- M1: 이상 검사치 카드 (최근 7일 H/L — 통계 카드 위) ---------- */
  function renderAbnormalLabs(list) {
    if (!Array.isArray(list)) return; // 구서버(필드 부재) — 카드 자체를 렌더하지 않음
    var card = document.getElementById('abnormalCard');
    if (!card) {
      var stats = document.getElementById('statsCard');
      if (!stats || !stats.parentNode) return;
      card = h('div', 'block card');
      card.id = 'abnormalCard';
      stats.parentNode.insertBefore(card, stats);
    }
    card.innerHTML = '';
    var head = h('div', 'sec-t');
    var t = h('h2', null, '이상 검사치 ');
    var mspan = h('span', 'muted', '(최근 7일)');
    mspan.style.cssText = 'font-weight:600;font-size:13px;';
    t.appendChild(mspan);
    head.appendChild(t);
    card.appendChild(head);
    if (!list.length) { card.appendChild(h('div', 'empty', '최근 7일 이상 수치가 없습니다')); return; }
    list.forEach(function (r) {
      var row = h('div', 'sch-row click');
      row.appendChild(h('span', 'h', (r.date || '').slice(5)));       // 'MM.DD'
      row.appendChild(h('span', 'nm', r.patient || ''));
      row.appendChild(h('span', 'dx', r.test || ''));
      var v = h('span', r.flag === 'L' ? 'flg-l' : 'flg-h', (r.value || '') + ' ' + (r.flag || ''));
      v.style.cssText = 'font-size:12.5px;flex:none;';
      row.appendChild(v);
      var ref = h('span', 'muted', r.ref || '');
      ref.style.cssText = 'font-size:11.5px;flex:none;min-width:70px;text-align:right;';
      row.appendChild(ref);
      row.title = '클릭하면 환자 EMR 상세로 이동합니다';
      row.addEventListener('click', function () { gotoEmr(r.patientId); });
      card.appendChild(row);
    });
  }

  /* ---------- M1: 간호 메모 / 전달 카드 (우측 레일) ---------- */
  function loadNurseMemos() {
    fetch('/api/memos?limit=5').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status); // 구서버 403 등 — 카드 미표시
      return r.json();
    }).then(function (d) {
      var rows = (d && d.rows) || [];
      var rail = document.querySelector('.rail');
      if (!rail) return;
      var card = h('div', 'card');
      card.id = 'nurseMemoCard';
      var head = h('div', 'sec-t');
      head.appendChild(h('h2', null, '간호 메모 / 전달'));
      card.appendChild(head);
      if (!rows.length) card.appendChild(h('div', 'empty', '메모가 없습니다'));
      var today = ymd(new Date()).replace(/-/g, '.'); // 'YYYY.MM.DD'
      rows.forEach(function (m) {
        var row = h('div', null);
        row.style.cssText = 'font-size:12px;padding:7px 0;border-bottom:1px solid var(--line-2);';
        var when = m.time || '';
        if (m.date && m.date !== today) { // 오늘이 아니면 M/D 표기 (P3b 간호사 패턴)
          var p = String(m.date).split('.');
          if (p.length === 3) when = Number(p[1]) + '/' + Number(p[2]) + ' ' + when;
        }
        var ts = h('span', 'muted', when + ' ');
        ts.style.fontWeight = '600';
        row.appendChild(ts);
        row.appendChild(document.createTextNode(m.text || ''));
        row.appendChild(h('span', 'muted', ' — ' + (m.author || '')));
        card.appendChild(row);
      });
      var last = card.lastChild;
      if (last && last.style) last.style.borderBottom = 'none';
      rail.appendChild(card);
    }).catch(function (e) {
      console.warn('간호 메모 조회 실패 — 카드 미표시:', e.message);
    });
  }

  /* ---------- 초기화 ---------- */
  function init() {
    // 대시보드 데이터 1회 수신 (실패 시 정적 목업 유지)
    fetch('/api/dashboard/doctor').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      if (!data) return;
      renderSidebar(data.sidebar);
      renderSchedule(data.todayLabel, data.schedule);
      renderDocRequests(data.docRequests);
      renderMonthStats(data.monthStats);
      if (data.recentPatient) renderRecentPatient(data.recentPatient);
      renderAbnormalLabs(data.abnormalLabs); // M1: 이상 검사치 카드
      var badge = document.getElementById('alertBadge');
      if (badge && data.alertCount != null) badge.textContent = data.alertCount;
      updateBellItems(data);
      setSummaryGuide();
    }).catch(function (e) {
      console.warn('의사 대시보드 데이터 수신 실패 — 정적 목업 유지:', e);
    });

    loadNurseMemos(); // M1: 간호 메모 카드 (실패 시 미표시)

    // 시스템 상태 (별도 호출, 실패 시 정적 유지)
    fetch('/api/health').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (h) {
      renderHealth(h);
    }).catch(function (e) {
      console.warn('시스템 상태 수신 실패 — 정적 표시 유지:', e);
    });

    // 레일 검색: Enter 시 조회
    var search = document.getElementById('patientSearch');
    if (search) {
      search.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var q = search.value.trim();
        if (q) searchPatient(q);
      });
    }

    // AI 요약 생성 버튼
    var btn = document.getElementById('aiSumBtn');
    if (btn) btn.addEventListener('click', generateSummary);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ============================================================
     P5 — 사이드바 내비게이션 실기능화 (계약 §0·§2 의사 표)
     해시 라우팅(#view-…) + #viewHost 뷰 렌더. P4 코드는 위 그대로.
     ============================================================ */

  var viewHost = null;      // #viewHost (main 안에 JS가 생성)
  var dashKids = [];        // 기존 대시보드 자식들 (dashboard 뷰 = 복원)
  var dashDirty = false;    // 쓰기 액션 후 대시보드 복귀 시 재조회 플래그

  /* ---------- P5 유틸 ---------- */
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function viewHead(title, sub) {
    var d = h('div', 'view-head');
    d.appendChild(h('h2', null, title));
    if (sub) d.appendChild(h('div', 'vh-sub', sub));
    return d;
  }
  function emptyBox(msg) { return h('div', 'empty', msg || '데이터를 불러올 수 없습니다'); }
  function loadingBox() { return h('div', 'empty', '불러오는 중…'); }
  async function getJson(url) {
    var r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  // 표 빌더 — thead 컬럼은 고정 문자열, 셀은 전부 textContent(Node 허용)
  function makeTable(cols) {
    var table = h('table', 'vt');
    var thead = document.createElement('thead');
    var trh = document.createElement('tr');
    cols.forEach(function (c) { var th = document.createElement('th'); th.textContent = c; trh.appendChild(th); });
    thead.appendChild(trh);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    table.appendChild(tbody);
    var wrap = h('div', 'vt-wrap');
    wrap.appendChild(table);
    return { wrap: wrap, tbody: tbody };
  }
  function trow(cells) {
    var r = document.createElement('tr');
    cells.forEach(function (c) {
      var td = document.createElement('td');
      if (c instanceof Node) td.appendChild(c);
      else td.textContent = (c == null || c === '') ? '-' : String(c);
      r.appendChild(td);
    });
    return r;
  }
  function bcell(text) { return h('span', 'b', text); }               // 굵은 셀
  function stBadge(cls, label) { return h('span', 'st ' + cls, label); }
  // 페이지네이션 (.pgr): ‹ 이전 | n / 전체 | 다음 ›
  function pager(page, totalPages, onMove) {
    var d = h('div', 'pgr');
    var prev = h('button', null, '‹ 이전'); prev.type = 'button';
    var next = h('button', null, '다음 ›'); next.type = 'button';
    prev.disabled = page <= 1;
    next.disabled = page >= totalPages;
    prev.addEventListener('click', function () { onMove(page - 1); });
    next.addEventListener('click', function () { onMove(page + 1); });
    d.appendChild(prev);
    d.appendChild(h('span', null, page + ' / ' + totalPages));
    d.appendChild(next);
    return d;
  }
  function ghostBtn(label, cls) {
    var b = h('button', 'btn-ghost' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    return b;
  }
  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // 공용 LLM 스트리밍 — P4 generateSummary와 동일한 SSE 패턴(§7), 대상 요소만 일반화
  async function streamChat(message, bodyEl) {
    var sessionId = 'bn-view-' + Math.random().toString(16).slice(2, 10);
    var raw = '';
    try {
      var resp = await fetch('/api/medgemma-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: message })
      });
      if (!resp.ok || !resp.body) throw new Error('서버 응답 오류 (' + resp.status + ')');
      var reader = resp.body.getReader();
      var dec = new TextDecoder();
      var buf = '';
      while (true) {
        var r = await reader.read();
        if (r.done) break;
        buf += dec.decode(r.value, { stream: true });
        var events = buf.split('\n\n');
        buf = events.pop();
        for (var i = 0; i < events.length; i++) {
          var ev = events[i];
          if (ev.indexOf('data: ') !== 0) continue;
          var d;
          try { d = JSON.parse(ev.slice(6)); } catch (e2) { continue; }
          var piece = (d.delta != null) ? d.delta : d.content;
          if (piece) { raw += piece; bodyEl.innerHTML = renderMd(raw); }
          if (d.error) { bodyEl.innerHTML = '<em class="ai-err">⚠️ ' + esc(d.error) + '</em>'; }
        }
      }
      typeset(bodyEl);
      if (!raw && !bodyEl.querySelector('.ai-err')) bodyEl.innerHTML = '<em class="ai-err">응답이 없습니다.</em>';
    } catch (e) {
      console.warn('LLM 스트리밍 실패:', e);
      bodyEl.innerHTML = '<em class="ai-err">⚠️ ' + esc(e.message) + '</em>';
    }
  }

  // 대시보드 재조회(쓰기 액션 후 복귀 시) — P4 init의 수신 블록과 동일, init 미변경 유지
  function refreshDashboard() {
    fetch('/api/dashboard/doctor').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      if (!data) return;
      renderSidebar(data.sidebar);
      renderSchedule(data.todayLabel, data.schedule);
      renderDocRequests(data.docRequests);
      renderMonthStats(data.monthStats);
      if (data.recentPatient) renderRecentPatient(data.recentPatient);
      var badge = document.getElementById('alertBadge');
      if (badge && data.alertCount != null) badge.textContent = data.alertCount;
      updateBellItems(data);
    }).catch(function (e) {
      console.warn('대시보드 갱신 실패 — 기존 표시 유지:', e);
    });
  }

  /* ---------- 공용 컴포넌트: 환자 검색 + 목록 (계약 1-1) ---------- */
  // host에 검색 카드 + 목록 카드를 붙이고, 행 클릭 시 onPick(patientDetail) 호출
  function patientPicker(host, onPick, initialQ, autoPickFirst) {
    var bar = h('div', 'card');
    var sr = h('div', 'v-search');
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = '환자 이름 또는 ID로 검색 (예: 김철수) — 비워 두면 최근 내원 환자 20명';
    if (initialQ) inp.value = initialQ;
    var sbtn = h('button', 'btn-cta', '검색'); sbtn.type = 'button';
    sr.appendChild(inp); sr.appendChild(sbtn);
    bar.appendChild(sr);
    var listCard = h('div', 'card');
    host.appendChild(bar);
    host.appendChild(listCard);

    function load(q) {
      listCard.innerHTML = '';
      listCard.appendChild(loadingBox());
      getJson('/api/patients' + (q ? '?q=' + encodeURIComponent(q) : '')).then(function (d) {
        listCard.innerHTML = '';
        var results = (d && d.results) || [];
        if (!results.length) { listCard.appendChild(h('div', 'empty', '검색 결과가 없습니다')); return; }
        var t = makeTable(['이름', '환자 ID', '성별/나이', '진단', '최근 내원']);
        results.forEach(function (p) {
          var row = trow([bcell(p.name), p.pid, p.sex + ' / ' + p.age + '세', p.dx, p.lastVisit]);
          row.className = 'click';
          row.addEventListener('click', function () { onPick(p); });
          t.tbody.appendChild(row);
        });
        listCard.appendChild(t.wrap);
        // P3b: 일정 클릭스루 — 첫 결과의 EMR 상세를 즉시 펼침 (1회만)
        if (autoPickFirst) { autoPickFirst = false; onPick(results[0]); }
      }).catch(function (e) {
        console.warn('환자 목록 조회 실패:', e);
        listCard.innerHTML = '';
        listCard.appendChild(emptyBox());
      });
    }
    function doSearch() { load(inp.value.trim()); }
    sbtn.addEventListener('click', doSearch);
    inp.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      doSearch();
    });
    load(initialQ || '');
  }

  // 메인 페이지 검색바가 넘긴 검색어 (1회용 — 꺼내면서 지운다)
  function takeHandoffQuery() {
    try {
      var q = sessionStorage.getItem('bn.searchQ') || '';
      if (q) sessionStorage.removeItem('bn.searchQ');
      return q;
    } catch (e) { return ''; }
  }

  // AI 스트리밍 섹션(제목 + 본문 + 버튼) — search/ai-summary/drug 뷰 공용
  function aiSection(card, title, btnLabel, buildMessage) {
    card.appendChild(h('div', 'sub-t', title));
    var body = h('div', 'ai-stream', 'AI 버튼을 눌러 생성해 보세요.');
    card.appendChild(body);
    var foot = h('div', null);
    foot.style.marginTop = '10px';
    var btn = ghostBtn(btnLabel);
    foot.appendChild(btn);
    card.appendChild(foot);
    async function run() {
      if (btn.disabled) return;
      btn.disabled = true;
      var orig = btn.textContent;
      btn.textContent = '생성 중…';
      body.textContent = '생성 중…';
      await streamChat(buildMessage(), body);
      btn.disabled = false;
      btn.textContent = orig;
    }
    btn.addEventListener('click', run);
    return { run: run, body: body, btn: btn };
  }

  /* ---------- 뷰: 환자 검색 (search) ---------- */
  function renderSearchView() {
    viewHost.appendChild(viewHead('환자 검색', '이름 또는 환자 ID로 검색하고, 행을 클릭하면 EMR 상세를 확인할 수 있습니다.'));
    var pickWrap = h('div', null);
    pickWrap.style.display = 'flex';
    pickWrap.style.flexDirection = 'column';
    pickWrap.style.gap = '16px';
    var detail = h('div', null);
    viewHost.appendChild(pickWrap);
    viewHost.appendChild(detail);
    // P3b: 일정 행 클릭스루 — bn.emrPid(1회용)가 있으면 해당 환자를 즉시 검색·펼침
    var emrPid = '';
    try {
      emrPid = sessionStorage.getItem('bn.emrPid') || '';
      if (emrPid) sessionStorage.removeItem('bn.emrPid');
    } catch (e) { emrPid = ''; }
    patientPicker(pickWrap, function (p) {
      renderEmrDetail(detail, p);
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, emrPid || takeHandoffQuery(), !!emrPid);
  }

  // EMR 상세 카드(진단·처방·바이탈·검사 + AI 요약) — search 뷰
  /* ---------- P3a: 인라인 SVG 스파크라인 (외부 라이브러리 금지) ----------
     축·격자·라벨 없이 muted 단색(currentColor) 선 + 마지막 점 강조.
     값이 숫자가 아니거나 2건 미만이면 null 반환(호출부에서 생략). */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function sparkline(series) {
    if (!series || series.length < 2) return null;
    var vals = [];
    for (var i = 0; i < series.length; i++) {
      var v = parseFloat(series[i].value);
      if (!isFinite(v)) return null;
      vals.push(v);
    }
    var W = 68, H = 18, PAD = 2;
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var span = (max - min) || 1;
    var pts = vals.map(function (v, i) {
      var x = PAD + (W - 2 * PAD) * (i / (vals.length - 1));
      var y = H - PAD - (H - 2 * PAD) * ((v - min) / span);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.cssText = 'vertical-align:middle;color:var(--muted);overflow:visible;';
    var pl = document.createElementNS(SVG_NS, 'polyline');
    pl.setAttribute('points', pts.join(' '));
    pl.setAttribute('fill', 'none');
    pl.setAttribute('stroke', 'currentColor');
    pl.setAttribute('stroke-width', '1.5');
    pl.setAttribute('stroke-linejoin', 'round');
    pl.setAttribute('stroke-linecap', 'round');
    svg.appendChild(pl);
    var lastXY = pts[pts.length - 1].split(',');
    var dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', lastXY[0]); dot.setAttribute('cy', lastXY[1]);
    dot.setAttribute('r', '2'); dot.setAttribute('fill', 'currentColor');
    svg.appendChild(dot);
    var title = document.createElementNS(SVG_NS, 'title'); // 날짜·값 나열 (textContent — DB 유래 안전)
    title.textContent = series.map(function (s) { return s.date + ' ' + s.value; }).join(', ');
    svg.appendChild(title);
    return svg;
  }
  function trendArrow(series) { // 직전 대비 방향 ▲▼→ (숫자 아닐 때 null)
    if (!series || series.length < 2) return null;
    var a = parseFloat(series[series.length - 2].value), b = parseFloat(series[series.length - 1].value);
    if (!isFinite(a) || !isFinite(b)) return null;
    var s = h('span', 'muted', b > a ? '▲' : b < a ? '▼' : '→');
    s.style.cssText = 'font-size:10px;margin-left:4px;';
    return s;
  }
  function sparkCell(series) { // 스파크라인+화살표 묶음 셀 (생성 불가 시 null)
    var svg = sparkline(series);
    if (!svg) return null;
    var wrap = h('span', null);
    wrap.style.whiteSpace = 'nowrap';
    wrap.appendChild(svg);
    var ar = trendArrow(series);
    if (ar) wrap.appendChild(ar);
    return wrap;
  }

  function renderEmrDetail(hostEl, p) {
    hostEl.innerHTML = '';
    var card = h('div', 'card');

    var head = h('div', 'pt-head');
    var ava = document.createElement('img');
    ava.className = 'pa';
    ava.src = '../../assets/av-patient.png';
    ava.alt = '';
    head.appendChild(ava);
    var hd = h('div', null);
    hd.appendChild(h('div', 'pn', nmLabel(p)));
    hd.appendChild(h('div', 'pid', p.pid || ''));
    head.appendChild(hd);
    card.appendChild(head);

    var emr = p.emr || {};

    card.appendChild(h('div', 'sub-t', '진단'));
    if (emr.diagnoses && emr.diagnoses.length) {
      var td = makeTable(['진단명', '코드', '진단일']);
      emr.diagnoses.forEach(function (x) { td.tbody.appendChild(trow([bcell(x.name), x.code, x.date])); });
      card.appendChild(td.wrap);
    } else card.appendChild(emptyBox('진단 이력이 없습니다'));

    card.appendChild(h('div', 'sub-t', '처방'));
    if (emr.prescriptions && emr.prescriptions.length) {
      // M1: 기간 컬럼 — start/end 필드가 있을 때만 (구서버 폴백: 기존 3컬럼)
      var hasPeriod = emr.prescriptions[0].start !== undefined;
      var tp = makeTable(hasPeriod ? ['약물', '용법', '기간', '상태'] : ['약물', '용법', '상태']);
      emr.prescriptions.forEach(function (x) {
        var cells = [bcell(x.drug), x.dosage];
        if (hasPeriod) cells.push((x.start || x.end) ? (x.start || '') + ' ~' + (x.end ? ' ' + x.end : '') : '-');
        cells.push(x.active ? stBadge('ok', '복용 중') : stBadge('done', '종료'));
        tp.tbody.appendChild(trow(cells));
      });
      card.appendChild(tp.wrap);
    } else card.appendChild(emptyBox('처방 이력이 없습니다'));

    card.appendChild(h('div', 'sub-t', '바이탈'));
    if (emr.vitals && emr.vitals.length) {
      var tv = makeTable(['측정일', '혈압', '혈당', '체중', 'BMI']);
      emr.vitals.forEach(function (x) {
        tv.tbody.appendChild(trow([x.date,
          (x.systolic != null && x.diastolic != null) ? x.systolic + '/' + x.diastolic + ' mmHg' : '-',
          x.glucose != null ? x.glucose + ' mg/dL' : '-',
          x.weight != null ? x.weight + ' kg' : '-', x.bmi]));
      });
      card.appendChild(tv.wrap);
      // P3a: 수축기/이완기 미니 추이 (vitalSeries 부재(구서버) 시 표만 유지)
      var vs = emr.vitalSeries || [];
      var spS = sparkCell(vs.filter(function (v) { return v.systolic != null; })
        .map(function (v) { return { date: v.date, value: v.systolic }; }));
      var spD = sparkCell(vs.filter(function (v) { return v.diastolic != null; })
        .map(function (v) { return { date: v.date, value: v.diastolic }; }));
      if (spS || spD) {
        var vrow = h('div', 'muted');
        vrow.style.cssText = 'font-size:11.5px;display:flex;gap:16px;align-items:center;margin-top:6px;';
        if (spS) { var w1 = h('span', null); w1.appendChild(spS); w1.appendChild(document.createTextNode(' 수축기')); vrow.appendChild(w1); }
        if (spD) { var w2 = h('span', null); w2.appendChild(spD); w2.appendChild(document.createTextNode(' 이완기')); vrow.appendChild(w2); }
        card.appendChild(vrow);
      }
    } else card.appendChild(emptyBox('바이탈 기록이 없습니다'));

    card.appendChild(h('div', 'sub-t', '검사'));
    if (emr.labs && emr.labs.length) {
      // P3a: labSeries가 오면 '추이' 컬럼 추가 — 부재(구서버) 시 기존 표 그대로 (폴백)
      var hasSeries = !!emr.labSeries;
      var cols = ['검사일', '항목', '결과', '참고치', '판정'];
      if (hasSeries) cols.push('추이');
      var tl = makeTable(cols);
      emr.labs.forEach(function (x) {
        var flag = x.flag === 'L' ? h('span', 'flg-l', 'L') : (x.flag === 'H' ? h('span', 'flg-h', 'H') : '정상');
        var cells = [x.date, x.test, bcell(x.value), x.ref, flag];
        if (hasSeries) cells.push(sparkCell(emr.labSeries[x.test]) || '—');
        tl.tbody.appendChild(trow(cells));
      });
      card.appendChild(tl.wrap);
    } else card.appendChild(emptyBox('검사 결과가 없습니다'));

    aiSection(card, 'SageFM AI 요약', 'AI 요약 생성', function () {
      var prompt = '다음 환자의 EMR 데이터를 근거로 주치의용 요약을 한국어 불릿 4~5개로 작성. 수치 변화와 다음 진료 권고 포함.';
      return prompt + '\n' + JSON.stringify(emr, null, 2);
    });

    hostEl.appendChild(card);
  }

  /* ---------- 뷰: 진료 일정 (schedule, 계약 1-2) ---------- */
  function renderScheduleView() {
    var head = viewHead('진료 일정', '날짜를 선택해 담당 예약을 확인하세요.');
    viewHost.appendChild(head);
    var sub = head.querySelector('.vh-sub');

    var cur = ymd(new Date());
    var card = h('div', 'card');
    var nav = h('div', 'date-nav');
    var prev = ghostBtn('◀');
    var today = ghostBtn('오늘');
    var next = ghostBtn('▶');
    var dateInp = document.createElement('input');
    dateInp.type = 'date';
    dateInp.value = cur;
    nav.appendChild(prev); nav.appendChild(today); nav.appendChild(next); nav.appendChild(dateInp);
    card.appendChild(nav);
    var listWrap = h('div', null);
    listWrap.style.marginTop = '12px';
    card.appendChild(listWrap);
    viewHost.appendChild(card);

    var stCls = { scheduled: 'wait', done: 'done', cancelled: 'cxl', no_show: 'cxl' };
    function load() {
      dateInp.value = cur;
      listWrap.innerHTML = '';
      listWrap.appendChild(loadingBox());
      getJson('/api/appointments?date=' + encodeURIComponent(cur)).then(function (d) {
        listWrap.innerHTML = '';
        if (sub && d.dateLabel) sub.textContent = d.dateLabel + ' 담당 예약';
        var rows = (d && d.rows) || [];
        if (!rows.length) { listWrap.appendChild(h('div', 'empty', '해당 날짜의 예약이 없습니다')); return; }
        // P3b: 진단 컬럼 + 행 클릭 → 환자 EMR (patientId 없으면(구서버) 기존 표만)
        var t = makeTable(['시간', '환자', '진단', '구분', '상태']);
        rows.forEach(function (a) {
          var row = trow([bcell(a.time), nmLabel(a), a.dx || '-', a.kind,
            stBadge(stCls[a.status] || 'wait', a.statusLabel || a.status)]);
          if (a.patientId != null) {
            row.className = 'click';
            row.title = '클릭하면 환자 EMR 상세로 이동합니다';
            row.addEventListener('click', function () { gotoEmr(a.patientId); });
          }
          t.tbody.appendChild(row);
        });
        listWrap.appendChild(t.wrap);
      }).catch(function (e) {
        console.warn('진료 일정 조회 실패:', e);
        listWrap.innerHTML = '';
        listWrap.appendChild(emptyBox());
      });
    }
    function shift(days) {
      var d = new Date(cur + 'T00:00:00');
      d.setDate(d.getDate() + days);
      cur = ymd(d);
      load();
    }
    prev.addEventListener('click', function () { shift(-1); });
    next.addEventListener('click', function () { shift(1); });
    today.addEventListener('click', function () { cur = ymd(new Date()); load(); });
    dateInp.addEventListener('change', function () { if (dateInp.value) { cur = dateInp.value; load(); } });
    load();
  }

  /* ---------- P2: '내 진료만 | 병원 전체' 스코프 토글 (기록·통계 뷰 공용, .vtab 재사용) ---------- */
  function scopeTabs(onChange) {
    var tabs = h('div', 'vtabs');
    var mine = h('button', 'vtab on', '내 진료만'); mine.type = 'button';
    var all = h('button', 'vtab', '병원 전체'); all.type = 'button';
    function set(isAll) {
      mine.classList.toggle('on', !isAll);
      all.classList.toggle('on', isAll);
      onChange(isAll);
    }
    mine.addEventListener('click', function () { set(false); });
    all.addEventListener('click', function () { set(true); });
    tabs.appendChild(mine); tabs.appendChild(all);
    return tabs;
  }

  /* ---------- 뷰: 진료 기록 (records, 계약 1-4) ---------- */
  function renderRecordsView() {
    var head = viewHead('진료 기록', '내 진료 기록 (최신순, 20건씩)');
    viewHost.appendChild(head);
    var sub = head.querySelector('.vh-sub');
    var scopeAll = false; // P2: 기본은 내 진료만
    var pidFilter = null; // M1: 환자 필터 { id, name }
    var card = h('div', 'card');
    viewHost.appendChild(card);
    function updateSub() {
      if (!sub) return;
      sub.textContent = (scopeAll ? '병원 전체' : '내') + ' 진료 기록 (최신순, 20건씩)'
        + (pidFilter ? ' — ' + pidFilter.name + ' 환자' : '');
    }
    var tabs = scopeTabs(function (isAll) {
      scopeAll = isAll;
      updateSub();
      load(1);
    });
    // M1: 환자 필터 — 이름/ID 검색 첫 매칭 환자의 기록만 (API가 이미 patient_id 지원)
    var fInp = document.createElement('input');
    fInp.type = 'text';
    fInp.placeholder = '환자 이름 또는 ID';
    fInp.style.cssText = 'margin-left:auto;font:inherit;font-size:12.5px;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:9px;padding:6px 10px;width:150px;';
    var fBtn = h('button', 'vtab', '필터 적용'); fBtn.type = 'button';
    var cBtn = h('button', 'vtab', '해제'); cBtn.type = 'button';
    cBtn.style.display = 'none';
    function applyFilter() {
      var q = fInp.value.trim();
      if (!q) return;
      getJson('/api/patients?q=' + encodeURIComponent(q)).then(function (d) {
        var results = (d && d.results) || [];
        if (!results.length) { toast('해당 환자를 찾을 수 없습니다'); return; }
        pidFilter = { id: results[0].id, name: results[0].name };
        cBtn.style.display = '';
        updateSub();
        load(1);
      }).catch(function () { toast('해당 환자를 찾을 수 없습니다'); });
    }
    fBtn.addEventListener('click', applyFilter);
    fInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyFilter(); } });
    cBtn.addEventListener('click', function () {
      pidFilter = null;
      fInp.value = '';
      cBtn.style.display = 'none';
      updateSub();
      load(1);
    });
    tabs.appendChild(fInp); tabs.appendChild(fBtn); tabs.appendChild(cBtn);
    card.appendChild(tabs);
    var listWrap = h('div', null);
    listWrap.style.marginTop = '12px';
    card.appendChild(listWrap);
    function load(page) {
      listWrap.innerHTML = '';
      listWrap.appendChild(loadingBox());
      getJson('/api/encounters?page=' + page + (scopeAll ? '&scope=all' : '')
        + (pidFilter ? '&patient_id=' + pidFilter.id : '')).then(function (d) {
        listWrap.innerHTML = '';
        var rows = (d && d.rows) || [];
        if (!rows.length) { listWrap.appendChild(h('div', 'empty', '진료 기록이 없습니다')); return; }
        var t = makeTable(['일시', '환자', '진료과', '진단', '담당의', '메모']);
        rows.forEach(function (r) {
          t.tbody.appendChild(trow([r.date + ' ' + (r.time || ''), bcell(r.patient), r.department, r.dx, r.doctor, r.note]));
        });
        listWrap.appendChild(t.wrap);
        var totalPages = Math.max(1, Math.ceil((d.total || rows.length) / 20));
        if (totalPages > 1) listWrap.appendChild(pager(d.page || page, totalPages, load));
      }).catch(function (e) {
        console.warn('진료 기록 조회 실패:', e);
        listWrap.innerHTML = '';
        listWrap.appendChild(emptyBox());
      });
    }
    load(1);
  }

  /* ---------- 뷰: AI 환자 요약 (ai-summary) ---------- */
  function renderAiSummaryView() {
    viewHost.appendChild(viewHead('AI 환자 요약 (SageFM)', '환자를 선택하면 EMR 기반 요약을 스트리밍으로 생성합니다.'));
    var pickWrap = h('div', null);
    pickWrap.style.display = 'flex';
    pickWrap.style.flexDirection = 'column';
    pickWrap.style.gap = '16px';
    var detail = h('div', null);
    viewHost.appendChild(pickWrap);
    viewHost.appendChild(detail);
    patientPicker(pickWrap, function (p) {
      detail.innerHTML = '';
      var card = h('div', 'card');
      var head = h('div', 'pt-head');
      var ava = document.createElement('img');
      ava.className = 'pa';
      ava.src = '../../assets/av-patient.png';
      ava.alt = '';
      head.appendChild(ava);
      var hd = h('div', null);
      hd.appendChild(h('div', 'pn', nmLabel(p)));
      hd.appendChild(h('div', 'pid', (p.pid || '') + (p.dx ? ' · ' + p.dx : '')));
      head.appendChild(hd);
      card.appendChild(head);
      var sec = aiSection(card, 'SageFM 요약', '다시 생성', function () {
        var prompt = '다음 환자의 EMR 데이터를 근거로 주치의용 요약을 한국어 불릿 4~5개로 작성. 수치 변화와 다음 진료 권고 포함.';
        return prompt + '\n' + JSON.stringify(p.emr || {}, null, 2);
      });
      detail.appendChild(card);
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
      sec.run(); // 선택 즉시 요약 생성
    });
  }

  /* ---------- 뷰: 약물/상호작용 (drug) ---------- */
  function renderDrugView() {
    viewHost.appendChild(viewHead('약물 / 상호작용', '환자를 선택하면 활성 처방을 확인하고 AI 상호작용 검토를 실행할 수 있습니다.'));
    var pickWrap = h('div', null);
    pickWrap.style.display = 'flex';
    pickWrap.style.flexDirection = 'column';
    pickWrap.style.gap = '16px';
    var detail = h('div', null);
    viewHost.appendChild(pickWrap);
    viewHost.appendChild(detail);

    function renderRx(p, rows) {
      detail.innerHTML = '';
      var card = h('div', 'card');
      card.appendChild(h('div', 'sub-t', nmLabel(p) + ' — 활성 처방'));
      var active = rows.filter(function (x) { return x.active !== false; });
      if (!active.length) {
        card.appendChild(h('div', 'empty', '활성 처방이 없습니다'));
        detail.appendChild(card);
        return;
      }
      var t = makeTable(['약물', '용법', '시작일']);
      active.forEach(function (x) { t.tbody.appendChild(trow([bcell(x.drug), x.dosage, x.start])); });
      card.appendChild(t.wrap);
      aiSection(card, 'AI 상호작용 검토', 'AI 상호작용 검토', function () {
        var list = active.map(function (x) { return x.drug + (x.dosage ? ' (' + x.dosage + ')' : ''); }).join(', ');
        return '다음 약물들의 상호작용·주의사항을 요약해줘: ' + list;
      });
      detail.appendChild(card);
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    patientPicker(pickWrap, function (p) {
      detail.innerHTML = '';
      detail.appendChild(loadingBox());
      getJson('/api/prescriptions?patient_id=' + encodeURIComponent(p.id)).then(function (d) {
        renderRx(p, (d && d.rows) || []);
      }).catch(function (e) {
        console.warn('처방 조회 실패 — EMR 요약 데이터로 대체:', e);
        if (p.emr && Array.isArray(p.emr.prescriptions)) renderRx(p, p.emr.prescriptions);
        else { detail.innerHTML = ''; detail.appendChild(emptyBox()); }
      });
    });
  }

  /* ---------- 뷰: 서류/문서 관리 (docs, 계약 1-6) ---------- */
  function renderDocsView() {
    viewHost.appendChild(viewHead('서류 / 문서 관리', '환자가 신청한 서류를 발급하거나 반려합니다.'));
    var card = h('div', 'card');
    var tabs = h('div', 'vtabs');
    var tabReq = h('button', 'vtab on', '신청됨'); tabReq.type = 'button';
    var tabDone = h('button', 'vtab', '처리 완료'); tabDone.type = 'button';
    tabs.appendChild(tabReq); tabs.appendChild(tabDone);
    // 서류 종류 필터 — 알림에서 "진단서 요청 n건"을 눌러 들어오면 해당 종류가 선택된다
    var DOC_TYPES = ['진단서', '소견서', '의무기록 사본', '검사결과서', '처방전', '보험서류', '기타'];
    var typeSel = document.createElement('select');
    typeSel.style.cssText = 'margin-left:auto;font:inherit;font-size:12.5px;font-weight:600;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:9px;padding:6px 10px;cursor:pointer;';
    var o0 = document.createElement('option');
    o0.value = ''; o0.textContent = '전체 종류';
    typeSel.appendChild(o0);
    DOC_TYPES.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t; o.textContent = t;
      typeSel.appendChild(o);
    });
    try {
      var t0 = sessionStorage.getItem('bn.docType') || '';
      if (t0) { sessionStorage.removeItem('bn.docType'); if (DOC_TYPES.indexOf(t0) !== -1) typeSel.value = t0; }
    } catch (e) {}
    typeSel.addEventListener('change', function () { load(1); });
    tabs.appendChild(typeSel);
    card.appendChild(tabs);
    var listWrap = h('div', null);
    listWrap.style.marginTop = '12px';
    card.appendChild(listWrap);
    viewHost.appendChild(card);

    var tab = 'requested';
    var stCls = { requested: 'wait', issued: 'ok', rejected: 'cxl' };

    function act(id, status, label) {
      fetch('/api/documents/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: status })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
          toast(label + ' 처리되었습니다');
          dashDirty = true; // 대시보드 서류 현황 갱신 필요
          load(1);
        });
      }).catch(function (e) {
        toast('처리 실패: ' + e.message);
      });
    }

    function load(page) {
      listWrap.innerHTML = '';
      listWrap.appendChild(loadingBox());
      var url = tab === 'requested'
        ? '/api/documents?status=requested&page=' + page
        : '/api/documents?status=processed&page=' + page;
      if (typeSel.value) url += '&type=' + encodeURIComponent(typeSel.value);
      getJson(url).then(function (d) {
        listWrap.innerHTML = '';
        var rows = (d && d.rows) || [];
        if (!rows.length) {
          listWrap.appendChild(h('div', 'empty', tab === 'requested' ? '신청된 서류가 없습니다' : '처리된 서류가 없습니다'));
          return;
        }
        var cols = tab === 'requested' ? ['환자', '서류 종류', '신청일', '상태', '처리'] : ['환자', '서류 종류', '신청일', '상태'];
        var t = makeTable(cols);
        rows.forEach(function (x) {
          var cells = [bcell(x.patient), x.type, x.date, stBadge(stCls[x.status] || 'wait', x.statusLabel || x.status)];
          if (tab === 'requested') {
            var box = h('span', null);
            var ok = ghostBtn('발급');
            var no = ghostBtn('반려', 'danger');
            no.style.marginLeft = '6px';
            ok.addEventListener('click', function () { act(x.id, 'issued', '발급'); });
            no.addEventListener('click', function () { act(x.id, 'rejected', '반려'); });
            box.appendChild(ok); box.appendChild(no);
            cells.push(box);
          }
          t.tbody.appendChild(trow(cells));
        });
        listWrap.appendChild(t.wrap);
        var totalPages = Math.max(1, Math.ceil((d.total || rows.length) / 20));
        if (totalPages > 1) listWrap.appendChild(pager(page, totalPages, load));
      }).catch(function (e) {
        console.warn('서류 목록 조회 실패:', e);
        listWrap.innerHTML = '';
        listWrap.appendChild(emptyBox());
      });
    }
    function setTab(next) {
      tab = next;
      tabReq.classList.toggle('on', tab === 'requested');
      tabDone.classList.toggle('on', tab !== 'requested');
      load(1);
    }
    tabReq.addEventListener('click', function () { setTab('requested'); });
    tabDone.addEventListener('click', function () { setTab('done'); });
    load(1);
  }

  /* ---------- 뷰: 통계/리포트 (stats, 계약 1-10) ---------- */
  function renderStatsView() {
    var head = viewHead('통계 / 리포트', '이번 달 내 진료 통계');
    viewHost.appendChild(head);
    var sub = head.querySelector('.vh-sub');
    var scopeAll = false; // P2: 기본은 내 진료만
    var tabs = scopeTabs(function (isAll) { scopeAll = isAll; load(); });
    tabs.style.marginBottom = '14px';
    viewHost.appendChild(tabs);
    var wrap = h('div', null);
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '16px';
    viewHost.appendChild(wrap);
    function load() {
    wrap.innerHTML = '';
    wrap.appendChild(loadingBox());
    getJson('/api/stats/doctor' + (scopeAll ? '?scope=all' : '')).then(function (d) {
      wrap.innerHTML = '';
      if (sub && d.month) sub.textContent = d.month + (scopeAll ? ' 병원 전체 진료 통계' : ' 내 진료 통계');

      // 숫자 카드 (기존 .stat4/.s4 마크업 재사용)
      var numCard = h('div', 'card');
      var grid = h('div', 'stat4 cols2');
      [['총 진료 수', Number(d.encounters || 0).toLocaleString() + '건'],
       ['No-Show', Number(d.noShow || 0).toLocaleString() + '건']].forEach(function (x) {
        var s4 = h('div', 's4');
        s4.appendChild(h('div', 's4l', x[0]));
        s4.appendChild(h('div', 's4n', x[1]));
        grid.appendChild(s4);
      });
      numCard.appendChild(grid);
      wrap.appendChild(numCard);

      // kind별 표
      var kindCard = h('div', 'card');
      kindCard.appendChild(h('div', 'sub-t', '유형별 예약 건수'));
      var byKind = d.byKind || [];
      if (byKind.length) {
        var t = makeTable(['구분', '건수']);
        byKind.forEach(function (k) { t.tbody.appendChild(trow([bcell(k.kind), Number(k.count).toLocaleString() + '건'])); });
        kindCard.appendChild(t.wrap);
      } else kindCard.appendChild(h('div', 'empty', '데이터가 없습니다'));
      wrap.appendChild(kindCard);

      // 일별 CSS 바차트 (라이브러리 없이 div 높이 비례)
      var barCard = h('div', 'card');
      barCard.appendChild(h('div', 'sub-t', '일별 진료 건수'));
      var daily = d.daily || [];
      if (daily.length) {
        var max = daily.reduce(function (m, x) { return Math.max(m, x.count || 0); }, 0) || 1;
        var bars = h('div', 'bars');
        daily.forEach(function (x) {
          var bc = h('div', 'bc');
          var bar = h('div', 'bar');
          bar.style.height = Math.round((x.count || 0) / max * 100) + '%';
          bar.title = x.day + '일: ' + (x.count || 0) + '건';
          bc.appendChild(bar);
          bc.appendChild(h('div', 'bl', (x.day === 1 || x.day % 5 === 0) ? String(x.day) : ''));
          bars.appendChild(bc);
        });
        barCard.appendChild(bars);
      } else barCard.appendChild(h('div', 'empty', '데이터가 없습니다'));
      wrap.appendChild(barCard);
    }).catch(function (e) {
      console.warn('통계 조회 실패:', e);
      wrap.innerHTML = '';
      wrap.appendChild(emptyBox());
    });
    }
    load();
  }

  /* ---------- 뷰: 설정 (settings, 계약 1-11) ---------- */
  function renderSettingsView() {
    viewHost.appendChild(viewHead('설정', '내 정보 확인 및 비밀번호 변경'));
    var roleLabel = { doctor: '의사', nurse: '간호사', patient: '환자', admin: '관리자' };

    var infoCard = h('div', 'card');
    infoCard.appendChild(h('div', 'sub-t', '내 정보'));
    var infoWrap = h('div', null);
    infoWrap.appendChild(loadingBox());
    infoCard.appendChild(infoWrap);
    viewHost.appendChild(infoCard);
    getJson('/api/me').then(function (u) {
      infoWrap.innerHTML = '';
      var prof = u.profile || {};
      [['이름', u.name], ['아이디', u.username], ['역할', roleLabel[u.role] || u.role], ['진료과', prof.department || '-']].forEach(function (x) {
        var kv = h('div', 'kv');
        kv.appendChild(h('span', 'k', x[0]));
        kv.appendChild(h('span', 'v', x[1] == null ? '-' : String(x[1])));
        infoWrap.appendChild(kv);
      });
    }).catch(function (e) {
      console.warn('내 정보 조회 실패:', e);
      infoWrap.innerHTML = '';
      infoWrap.appendChild(emptyBox());
    });

    var pwCard = h('div', 'card');
    pwCard.appendChild(h('div', 'sub-t', '비밀번호 변경'));
    var frm = document.createElement('form');
    frm.className = 'frm';
    function field(labelText, name) {
      var lb = h('label', null, labelText);
      var inp = document.createElement('input');
      inp.type = 'password';
      inp.name = name;
      inp.autocomplete = name === 'current' ? 'current-password' : 'new-password';
      frm.appendChild(lb);
      frm.appendChild(inp);
      return inp;
    }
    var curInp = field('현재 비밀번호', 'current');
    var nxtInp = field('새 비밀번호 (8자 이상)', 'next');
    var cfmInp = field('새 비밀번호 확인', 'confirm');
    var err = h('div', 'frm-err', '');
    frm.appendChild(err);
    var submit = h('button', 'btn-cta', '비밀번호 변경');
    submit.type = 'submit';
    submit.style.alignSelf = 'flex-start';
    frm.appendChild(submit);
    pwCard.appendChild(frm);
    viewHost.appendChild(pwCard);

    frm.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = '';
      var cur = curInp.value, nxt = nxtInp.value, cfm = cfmInp.value;
      if (!cur || !nxt || !cfm) { err.textContent = '모든 항목을 입력해 주세요.'; return; }
      if (nxt.length < 8) { err.textContent = '새 비밀번호는 8자 이상이어야 합니다.'; return; }
      if (nxt !== cfm) { err.textContent = '새 비밀번호가 일치하지 않습니다.'; return; }
      submit.disabled = true;
      fetch('/api/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: cur, next: nxt })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.error || '변경에 실패했습니다. (HTTP ' + r.status + ')');
          toast('비밀번호가 변경되었습니다');
          curInp.value = ''; nxtInp.value = ''; cfmInp.value = '';
        });
      }).catch(function (e2) {
        err.textContent = e2.message;
      }).then(function () {
        submit.disabled = false;
      });
    });
  }

  /* ---------- 뷰: C 안내 패널 (ai-doc / billing, 계약 §3) ---------- */
  function renderInfoView(title, icon, descA, descB) {
    viewHost.appendChild(viewHead(title));
    var card = h('div', 'card c-panel');
    var ico = h('span', 'cp-ico');
    var img = document.createElement('img');
    img.src = icon;
    img.alt = '';
    ico.appendChild(img);
    card.appendChild(ico);
    card.appendChild(h('h3', null, title));
    card.appendChild(h('p', null, descA + ' ' + descB));
    var link = document.createElement('a');
    link.className = 'link';
    link.href = '../../index.html';
    link.innerHTML = '제품 소개 · 데모 영상 보기 <span class="arr">›</span>';
    card.appendChild(link);
    viewHost.appendChild(card);
  }
  function renderAiDocView() {
    renderInfoView('AI 자동 문서화 (MintNote)', '../../assets/svc/mintnote.png',
      'AI 자동 문서화는 MintNote 제품 영역입니다.',
      '데모 영상에서 음성 기반 EMR 자동 작성을 확인해 보세요.');
  }
  function renderBillingView() {
    renderInfoView('수가 청구 도우미 (ThymeCare)', '../../assets/svc/thymecare.png',
      '수가 청구 도우미는 ThymeCare 제품 영역입니다.',
      '청구서 자동 작성과 삭감 방지 기능을 데모 영상에서 확인해 보세요.');
  }

  /* ---------- 라우팅 (계약 §0) ---------- */
  var VIEWS = {
    dashboard: null, // 기존 P4 콘텐츠 복원
    search: renderSearchView,
    schedule: renderScheduleView,
    records: renderRecordsView,
    'ai-summary': renderAiSummaryView,
    'ai-doc': renderAiDocView,
    billing: renderBillingView,
    drug: renderDrugView,
    docs: renderDocsView,
    stats: renderStatsView,
    settings: renderSettingsView
  };

  function currentViewFromHash() {
    var m = /^#view-([a-z-]+)$/.exec(location.hash || '');
    if (m && Object.prototype.hasOwnProperty.call(VIEWS, m[1])) return m[1];
    return 'dashboard'; // 해시 없음/미지정 → 대시보드
  }

  function showView(name) {
    if (!viewHost) return;
    // .nav-i.on 동기화 (data-view 없는 항목 = 외부 링크는 항상 off)
    document.querySelectorAll('.sb-nav .nav-i').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-view') === name);
    });
    if (name === 'dashboard') {
      viewHost.style.display = 'none';
      viewHost.innerHTML = '';
      dashKids.forEach(function (el) { el.style.display = ''; });
      if (dashDirty) { dashDirty = false; refreshDashboard(); }
    } else {
      dashKids.forEach(function (el) { el.style.display = 'none'; });
      viewHost.innerHTML = '';
      viewHost.style.display = '';
      VIEWS[name]();
    }
  }

  function route() { showView(currentViewFromHash()); }

  function initP5() {
    var main = document.querySelector('main.main');
    if (!main) return;
    dashKids = Array.prototype.slice.call(main.children); // 기존 대시보드 자식들
    viewHost = document.createElement('div');
    viewHost.id = 'viewHost';
    viewHost.style.display = 'none';
    main.appendChild(viewHost);

    // MintNote/ThymeCare/Rosemary 카드 → 토스트
    document.querySelectorAll('[data-demo]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        toast('외부 제품 데모 영역입니다');
      });
    });

    window.addEventListener('hashchange', route);
    route(); // 새로고침 시 해시 유지, 없으면 대시보드
  }

  /* ---------- 알림 벨 드롭다운 (rail-top) ---------- */
  var bellItems = [];
  function updateBellItems(data) {
    bellItems = [];
    (Array.isArray(data.docRequests) ? data.docRequests : []).forEach(function (d) {
      if (d.count > 0) bellItems.push({ t: d.type + ' 요청 ' + d.count + '건', h: '#view-docs', dt: d.type });
    });
    if (Array.isArray(data.schedule) && data.schedule.length)
      bellItems.push({ t: '오늘 예약 ' + data.schedule.length + '건', h: '#view-schedule' });
  }
  function initBell() {
    var btn = document.querySelector('.rail-top .icon-btn');
    if (!btn) return;
    var wrap = btn.parentElement;
    wrap.style.position = 'relative';
    var panel = null;
    function closeBell() { if (panel) { panel.remove(); panel = null; } }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel) { closeBell(); return; }
      panel = document.createElement('div');
      panel.style.cssText = 'position:absolute;top:calc(100% + 8px);right:0;width:272px;background:#fff;border:1px solid #e6ece6;border-radius:14px;box-shadow:0 18px 44px rgba(20,45,30,.18);z-index:1500;overflow:hidden;';
      var head = document.createElement('div');
      head.style.cssText = 'font-size:12.5px;font-weight:800;color:#1f2d27;padding:11px 14px;border-bottom:1px solid #eef2ee;';
      head.textContent = '알림';
      panel.appendChild(head);
      if (!bellItems.length) {
        var em = document.createElement('div');
        em.style.cssText = 'padding:16px 14px;font-size:12.5px;color:#7f8e85;';
        em.textContent = '새 알림이 없습니다.';
        panel.appendChild(em);
      }
      bellItems.forEach(function (it) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 14px;font-size:12.5px;font-weight:600;color:#364a3f;cursor:pointer;border-bottom:1px solid #f4f7f4;';
        row.addEventListener('mouseenter', function () { row.style.background = '#f6faf7'; });
        row.addEventListener('mouseleave', function () { row.style.background = ''; });
        var t = document.createElement('span'); t.textContent = it.t;
        var arr = document.createElement('span'); arr.textContent = '›';
        arr.style.cssText = 'color:#9db3a5;font-weight:700;';
        row.appendChild(t); row.appendChild(arr);
        row.addEventListener('click', function () {
          closeBell();
          if (it.dt) { try { sessionStorage.setItem('bn.docType', it.dt); } catch (e2) {} }
          if (!it.h) return;
          // 이미 같은 뷰에 있으면 hashchange가 안 일어나므로 강제로 재렌더
          if (location.hash === it.h) window.dispatchEvent(new Event('hashchange'));
          else location.hash = it.h;
        });
        panel.appendChild(row);
      });
      wrap.appendChild(panel);
    });
    document.addEventListener('click', function (e) { if (panel && !panel.contains(e.target)) closeBell(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeBell(); });
  }

  function initRailButtons() {
    initBell();
    // M1: '새 환자 등록' CTA 제거됨 — 관련 토스트 핸들러도 정리
    var detailBtn = document.querySelector('#recentCard .pt-head .btn-ghost');
    if (detailBtn) detailBtn.addEventListener('click', function () { location.hash = '#view-search'; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { initP5(); initRailButtons(); });
  else { initP5(); initRailButtons(); }
})();
