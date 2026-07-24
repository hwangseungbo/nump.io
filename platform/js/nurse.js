/* ============================================================
   Basil Nexus — 간호사 대시보드 (P4)
   - GET /api/dashboard/nurse 1회 수신 후 각 패널 렌더링
   - POST /api/memos 로 새 메모 등록 (인라인 입력줄 + 토스트)
   - GET /api/health 로 푸터 시스템 상태 갱신
   - fetch 실패/404 시 정적 목업 내용 유지 + console.warn
   ============================================================ */
(function () {
  'use strict';

  var AVA_COLORS = ['#6a5bd4', '#3f9e6b', '#d99a2b', '#4f7ddb', '#c2557a'];
  // 기존 .contact-row 의 전화 아이콘 마크업 복제 (고정 상수, DB 유래 아님)
  var PHONE_SVG = '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3-8.6A2 2 0 014.1 2h3a2 2 0 012 1.7c.3 2 .8 3 .8 3a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1-1.2a2 2 0 012.1-.5s1 .5 3 .8a2 2 0 011.7 2z"/></svg>';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text; // DB 유래 문자열은 항상 textContent (XSS 방지)
    return e;
  }
  function removeAll(sel, root) { $all(sel, root).forEach(function (n) { n.remove(); }); }

  /* ---------- 토스트 ---------- */
  function toast(msg) {
    var t = el('div', 'bn-toast', msg);
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 2200);
  }

  /* ---------- 사이드바 "오늘 병동 통계" ---------- */
  function renderSidebarStats(sb) {
    if (!sb) return;
    var sns = $all('.sb-stats .sb-stat .sn');
    if (sns[0] && sb.vitals != null) sns[0].textContent = sb.vitals + '건';
    if (sns[1] && sb.meds != null) sns[1].textContent = sb.meds + '건';
  }

  /* ---------- 오늘 담당 환자 ---------- */
  function renderPatients(d) {
    var card = $('#patientsCard');
    var cnt = $('#patientCount');
    if (cnt && d.patientCount != null) cnt.textContent = '(' + d.patientCount + '명)';
    if (!card || !Array.isArray(d.patients)) return;
    removeAll('.p-item', card);
    d.patients.forEach(function (p, i) {
      var row = el('div', 'p-item');
      var ava = el('span', 'p-ava', p.initial || '');
      ava.style.background = AVA_COLORS[i % AVA_COLORS.length];
      var body = el('div', 'p-b');
      body.appendChild(el('div', 'p-n', (p.name || '') + ' (' + (p.sex || '') + '/' + (p.age != null ? p.age : '') + ')'));
      body.appendChild(el('div', 'p-m', (p.room || '') + ' · ' + (p.dx || '')));
      var right = el('div', 'p-r');
      if (p.tag) right.appendChild(el('span', 'tag' + (p.tagClass ? ' ' + p.tagClass : ''), p.tag));
      if (p.time) right.appendChild(el('div', 'p-time', p.time));
      row.appendChild(ava); row.appendChild(body); row.appendChild(right);
      card.appendChild(row);
    });
  }

  /* ---------- 오늘 일정: 날짜 헤더만 갱신 (행은 정적 유지) ---------- */
  function renderTodayLabel(label) {
    var t = $('#todayLabel');
    if (t && label) t.textContent = label;
  }

  /* ---------- 서류 요청 현황 ---------- */
  function renderDocRequests(rows) {
    var card = $('#docReqCard');
    if (!card || !Array.isArray(rows)) return;
    removeAll('.row-lc', card);
    rows.forEach(function (r) {
      var row = el('div', 'row-lc');
      row.appendChild(el('span', 'lab', (r.type || '') + ' 요청'));
      row.appendChild(el('span', 'c' + (r.count >= 4 ? ' warn' : ''), r.count + '건'));
      card.appendChild(row);
    });
  }

  /* ---------- 환자 안전 지표 ---------- */
  function renderSafety(safety) {
    var grid = $('#safetyGrid');
    if (!grid || !safety) return;
    var keys = ['fall', 'sore', 'medError', 'infection'];
    var metrics = $all('.metric', grid);
    keys.forEach(function (k, i) {
      var m = metrics[i];
      if (!m || safety[k] == null) return;
      var mn = $('.mn', m);
      if (mn) mn.textContent = safety[k] + '건';
      if (k === 'infection') m.classList.toggle('alert', safety[k] > 0);
    });
  }

  /* ---------- rail 주요 알림 + 배지 ---------- */
  function renderAlerts(alerts, alertCount) {
    var badge = $('#alertBadge');
    if (badge && alertCount != null) badge.textContent = alertCount;
    var card = $('#alertsCard');
    if (!card || !alerts) return;
    var keys = ['med', 'lab', 'care', 'admission', 'docs'];
    var cells = $all('.al-c', card);
    keys.forEach(function (k, i) {
      if (cells[i] && alerts[k] != null) cells[i].textContent = alerts[k] + '건';
    });
  }

  /* ---------- 메모 / 전달 사항 ---------- */
  function buildMemoRow(m) {
    var row = el('div', 'memo-row');
    row.appendChild(el('span', 'memo-t', m.time || ''));
    var b = el('div', 'memo-b');
    b.appendChild(el('div', 'mt', m.text || ''));
    b.appendChild(el('div', 'mw', m.author || ''));
    row.appendChild(b);
    return row;
  }

  function renderMemos(memos) {
    var card = $('#memoCard');
    if (!card || !Array.isArray(memos)) return;
    removeAll('.memo-row', card);
    var foot = $('.docs-foot', card);
    memos.forEach(function (m) {
      var row = buildMemoRow(m);
      if (foot) card.insertBefore(row, foot); else card.appendChild(row);
    });
  }

  function prependMemoRow(card, memo) {
    var row = buildMemoRow(memo);
    var first = $('.memo-row', card);
    if (first) { card.insertBefore(row, first); return; }
    var foot = $('.docs-foot', card);
    if (foot) card.insertBefore(row, foot); else card.appendChild(row);
  }

  function setupMemoForm() {
    var card = $('#memoCard');
    if (!card) return;
    var link = $('.sec-t a.link', card); // "+ 새 메모"
    if (!link) return;
    var form = null;

    link.addEventListener('click', function (e) {
      e.preventDefault();
      if (form) { closeForm(); return; } // 재클릭 시 닫기

      form = el('div', 'memo-form');
      var input = document.createElement('input');
      input.type = 'text';
      input.placeholder = '메모 내용을 입력하세요';
      input.maxLength = 500;
      var btn = el('button', 'memo-save', '저장');
      btn.type = 'button';
      form.appendChild(input);
      form.appendChild(btn);
      var secT = $('.sec-t', card);
      if (secT && secT.nextSibling) card.insertBefore(form, secT.nextSibling);
      else card.appendChild(form);
      input.focus();

      btn.addEventListener('click', save);
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); save(); }
        else if (ev.key === 'Escape') closeForm();
      });

      function save() {
        var content = input.value.trim();
        if (!content) { input.focus(); return; }
        btn.disabled = true;
        fetch('/api/memos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: content })
        }).then(function (r) {
          if (!r.ok) throw new Error('POST /api/memos ' + r.status);
          return r.json();
        }).then(function (d) {
          if (!d || !d.memo) throw new Error('POST /api/memos: 잘못된 응답');
          prependMemoRow(card, d.memo);
          closeForm();
          toast('메모가 등록되었습니다');
        }).catch(function (err) {
          console.warn('[nurse] 메모 등록 실패:', err.message);
          if (btn.isConnected) btn.disabled = false;
        });
      }
    });

    function closeForm() {
      if (form) { form.remove(); form = null; }
    }
  }

  /* ---------- 병동 현황 ---------- */
  function renderWard(w) {
    var grid = $('#wardGrid');
    if (!grid || !w) return;
    var cells = $all('.ward-c .wn', grid);
    var vals = [
      w.inpatients != null ? w.inpatients + '명' : null,
      w.dischargeDue != null ? w.dischargeDue + '명' : null,
      w.testsToday != null ? w.testsToday + '건' : null,
      w.surgeriesToday != null ? w.surgeriesToday + '건' : null
    ];
    vals.forEach(function (v, i) { if (cells[i] && v != null) cells[i].textContent = v; });
  }

  /* ---------- 빠른 연락처 ---------- */
  function renderContacts(contacts) {
    var card = $('#contactsCard');
    if (!card || !Array.isArray(contacts)) return;
    removeAll('.contact-row', card);
    contacts.forEach(function (c) {
      var row = el('div', 'contact-row');
      row.appendChild(el('span', 'ca', c.initial || ''));
      row.appendChild(el('span', 'cn', c.name || ''));
      row.appendChild(el('span', 'cnum', c.phone || ''));
      var cp = el('span', 'cp');
      cp.innerHTML = PHONE_SVG; // 고정 마크업 복제 (DB 유래 아님)
      row.appendChild(cp);
      card.appendChild(row);
    });
  }

  /* ---------- 최근 기록 ---------- */
  function renderRecentNotes(notes) {
    var card = $('#recentCard');
    if (!card || !Array.isArray(notes)) return;
    removeAll('.rec2-row', card);
    notes.forEach(function (n) {
      var row = el('div', 'rec2-row');
      row.appendChild(el('span', 'dot'));
      row.appendChild(el('span', 'lb', n.label || ''));
      row.appendChild(el('span', 'rm', n.room || ''));
      card.appendChild(row);
    });
  }

  /* ---------- 푸터 시스템 상태 ---------- */
  function setSysValue(elm, val) {
    if (!elm) return;
    if (val === false) {
      elm.textContent = '점검 필요';
      elm.classList.add('sv-warn');
    } else if (val != null) {
      elm.textContent = String(val);
      elm.classList.remove('sv-warn');
    }
  }

  function renderHealth(h) {
    if (!h) return;
    var svs = $all('.sysbar .sys-i .sv');
    // 순서: On-Premise(db) → 서버 상태(항상 "정상") → 데이터 백업 → 보안 상태
    setSysValue(svs[0], h.db === false ? false : '연결 정상');
    setSysValue(svs[1], '정상');
    setSysValue(svs[2], h.backup);
    setSysValue(svs[3], h.security);
  }

  /* ---------- 대시보드 렌더 ---------- */
  function renderDashboard(d) {
    renderSidebarStats(d.sidebar);
    renderPatients(d);
    renderTodayLabel(d.todayLabel);
    renderDocRequests(d.docRequests);
    renderSafety(d.safety);
    renderAlerts(d.alerts, d.alertCount);
    renderMemos(d.memos);
    renderWard(d.ward);
    renderContacts(d.contacts);
    renderRecentNotes(d.recentNotes);
  }

  /* ---------- 초기화 ---------- */
  function init() {
    fetch('/api/dashboard/nurse').then(function (r) {
      if (!r.ok) throw new Error('GET /api/dashboard/nurse ' + r.status);
      return r.json();
    }).then(function (d) {
      if (d) renderDashboard(d); // 렌더는 데이터 수신 성공 후에만
    }).catch(function (e) {
      console.warn('[nurse] 대시보드 데이터를 불러오지 못해 정적 목업을 유지합니다:', e.message);
    });

    fetch('/api/health').then(function (r) {
      if (!r.ok) throw new Error('GET /api/health ' + r.status);
      return r.json();
    }).then(function (h) {
      if (h) renderHealth(h);
    }).catch(function (e) {
      console.warn('[nurse] 시스템 상태를 불러오지 못했습니다:', e.message);
    });

    setupMemoForm();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
