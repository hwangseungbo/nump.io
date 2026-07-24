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
      if (foot) card.insertBefore(row, foot); else card.appendChild(row);
    });
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
      var badge = document.getElementById('alertBadge');
      if (badge && data.alertCount != null) badge.textContent = data.alertCount;
      setSummaryGuide();
    }).catch(function (e) {
      console.warn('의사 대시보드 데이터 수신 실패 — 정적 목업 유지:', e);
    });

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
})();
