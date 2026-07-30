/* ============================================================
   Basil Nexus — 간호사 대시보드 (P4 + P5)
   P4
   - GET /api/dashboard/nurse 1회 수신 후 각 패널 렌더링
   - POST /api/memos 로 새 메모 등록 (인라인 입력줄 + 토스트)
   - GET /api/health 로 푸터 시스템 상태 갱신
   - fetch 실패/404 시 정적 목업 내용 유지 + console.warn
   P5 (docs/API-CONTRACT-P5.md)
   - 사이드바 내비 실기능화: 해시 라우팅(#view-*) + #viewHost 뷰 전환
   - 뷰: search / admission / schedule / meds / tests / notes /
         docs / memo / stats / settings / etc(안내 패널)
   - 쓰기 성공 시 토스트 + 뷰 재조회, 대시보드 복귀 시 재갱신
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

  /* ---------- 대시보드 로드 (P4 로직 그대로, 재호출 가능하게 분리) ---------- */
  function loadDashboard() {
    fetch('/api/dashboard/nurse').then(function (r) {
      if (!r.ok) throw new Error('GET /api/dashboard/nurse ' + r.status);
      return r.json();
    }).then(function (d) {
      if (d) renderDashboard(d); // 렌더는 데이터 수신 성공 후에만
    }).catch(function (e) {
      console.warn('[nurse] 대시보드 데이터를 불러오지 못해 정적 목업을 유지합니다:', e.message);
    });
  }

  /* ============================================================
     P5 — 사이드바 내비 실기능화 (해시 라우팅 + #viewHost 뷰 전환)
     ============================================================ */

  var NOTE_TYPES = ['활력징후', '투약', '처치', '간호기록'];
  var ROLE_KO = { doctor: '의사', nurse: '간호사', patient: '환자', admin: '관리자' };
  var viewHost = null;      // JS가 .main 안에 생성 (계약 §0)
  var dashKids = [];        // 기존 P4 대시보드 자식 노드들 (display 토글 대상)
  var dashDirty = false;    // 다른 뷰에서 쓰기 성공 → 대시보드 복귀 시 재조회

  /* ---------- P5 공통 유틸 ---------- */
  function fetchJson(url, opts) {
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) {
          var e = new Error((d && d.error) || ('HTTP ' + r.status));
          e.status = r.status;
          throw e;
        }
        return d;
      });
    });
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function shiftISO(iso, days) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2] + days);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function viewHead(title, sub) {
    var h = el('div', 'view-head');
    h.appendChild(el('h2', null, title));
    if (sub) h.appendChild(el('div', 'vh-sub', sub));
    return h;
  }
  function emptyBox(msg) { return el('div', 'empty', msg || '데이터를 불러올 수 없습니다'); }
  function loadFail(box) { box.innerHTML = ''; box.appendChild(emptyBox()); }
  function td(v) { // 문자열은 textContent, Node는 append (XSS 방지)
    var c = document.createElement('td');
    if (v == null) c.textContent = '';
    else if (v.nodeType) c.appendChild(v);
    else c.textContent = String(v);
    return c;
  }
  function makeTable(cols) {
    var wrap = el('div', 'vt-wrap');
    var table = el('table', 'vt');
    var thead = document.createElement('thead');
    var tr = document.createElement('tr');
    cols.forEach(function (c) { tr.appendChild(el('th', null, c)); });
    thead.appendChild(tr);
    var tbody = document.createElement('tbody');
    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);
    return { wrap: wrap, tbody: tbody };
  }
  function stBadge(status, label) {
    var cls = {
      scheduled: 'now', done: 'done', cancelled: 'cancel', no_show: 'warn',
      admitted: 'now', discharged: 'cancel',
      requested: 'now', issued: 'done', rejected: 'warn'
    }[status] || 'wait';
    if (label === '퇴원 예정') cls = 'due';
    return el('span', 'st ' + cls, label || status || '');
  }
  function pager(page, total, per, onGo) {
    var pages = Math.max(1, Math.ceil((total || 0) / per));
    var w = el('div', 'pgr');
    var prev = el('button', null, '‹ 이전'); prev.type = 'button'; prev.disabled = page <= 1;
    var next = el('button', null, '다음 ›'); next.type = 'button'; next.disabled = page >= pages;
    prev.addEventListener('click', function () { onGo(page - 1); });
    next.addEventListener('click', function () { onGo(page + 1); });
    w.appendChild(prev);
    w.appendChild(el('span', null, page + ' / ' + pages));
    w.appendChild(next);
    return w;
  }
  function vbtn(label, cls) {
    var b = el('button', 'vbtn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    return b;
  }
  function textInput(ph) {
    var i = document.createElement('input');
    i.type = 'text';
    if (ph) i.placeholder = ph;
    return i;
  }
  function pwInput(ph) {
    var i = document.createElement('input');
    i.type = 'password';
    i.placeholder = ph;
    i.autocomplete = 'new-password';
    return i;
  }
  function field(labelText, control) {
    var f = el('div', 'vf-field');
    f.appendChild(el('label', null, labelText));
    f.appendChild(control);
    return f;
  }
  function jsonOpts(method, body) {
    return { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  }

  /* ---------- 환자 검색/선택 콤보 (입원 등록·간호 기록 공용) ---------- */
  function patientPicker() {
    var root = el('div', 'vw-picker');
    var input = textInput('환자 이름 또는 ID 검색');
    var btn = vbtn('검색', 'ghost');
    var sel = document.createElement('select');
    function fill(results) {
      sel.innerHTML = '';
      var o0 = document.createElement('option');
      o0.value = '';
      o0.textContent = results.length ? '환자 선택 (' + results.length + '명)' : '검색 결과 없음';
      sel.appendChild(o0);
      results.forEach(function (p) {
        var o = document.createElement('option');
        o.value = String(p.id);
        o.textContent = (p.name || '') + ' (' + (p.sex || '') + '/' + (p.age != null ? p.age : '') + ') · ' + (p.pid || '');
        sel.appendChild(o);
      });
    }
    function search() {
      fetchJson('/api/patients?q=' + encodeURIComponent(input.value.trim()))
        .then(function (d) { fill(Array.isArray(d.results) ? d.results : []); })
        .catch(function () { fill([]); });
    }
    btn.addEventListener('click', search);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); search(); }
    });
    root.appendChild(input); root.appendChild(btn); root.appendChild(sel);
    search(); // 초기: q 없이 최근 내원순 20명 (계약 1-1)
    return {
      root: root,
      getId: function () { return sel.value ? parseInt(sel.value, 10) : null; }
    };
  }

  /* ---------- 뷰: 환자 검색 (AI 버튼 없음) ---------- */
  function renderSearchView(host) {
    host.appendChild(viewHead('환자 검색', '이름 또는 환자 ID로 검색하세요. 행을 클릭하면 EMR 상세를 볼 수 있습니다.'));
    var card = el('div', 'card');
    var bar = el('div', 'vw-toolbar');
    var input = textInput('환자 이름 또는 ID 입력');
    var btn = vbtn('검색');
    bar.appendChild(input); bar.appendChild(btn);
    card.appendChild(bar);
    var box = el('div');
    card.appendChild(box);
    host.appendChild(card);

    var page = 1;
    function load() {
      box.innerHTML = '';
      var q = input.value.trim();
      var url = '/api/patients?q=' + encodeURIComponent(q) + (q ? '' : '&page=' + page);
      fetchJson(url).then(function (d) {
        var rows = Array.isArray(d.results) ? d.results : [];
        if (!rows.length) { box.appendChild(el('div', 'empty', '검색 결과가 없습니다')); return; }
        var t = makeTable(['환자명', '환자 ID', '성별/나이', '진단', '처방', '최근 내원']);
        rows.forEach(function (p) {
          var tr = el('tr', 'rowlink');
          tr.appendChild(td(p.name));
          tr.appendChild(td(p.pid));
          tr.appendChild(td((p.sex || '') + '/' + (p.age != null ? p.age : '')));
          tr.appendChild(td(p.dx));
          tr.appendChild(td(p.rx));
          tr.appendChild(td(p.lastVisit));
          tr.addEventListener('click', function () { renderPatientDetail(box, p, load); });
          t.tbody.appendChild(tr);
        });
        box.appendChild(t.wrap);
        if (!q && d.total != null && d.total > 20) {
          box.appendChild(pager(page, d.total, 20, function (p2) { page = p2; load(); }));
        }
      }).catch(function () { loadFail(box); });
    }
    btn.addEventListener('click', function () { page = 1; load(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); page = 1; load(); }
    });
    load();
  }

  function emrSection(title, cols, rows) {
    var sec = el('div', 'emr-sec');
    sec.appendChild(el('h3', null, title));
    if (!rows.length) { sec.appendChild(el('div', 'empty', '기록이 없습니다')); return sec; }
    var t = makeTable(cols);
    rows.forEach(function (cells) {
      var tr = document.createElement('tr');
      cells.forEach(function (v) { tr.appendChild(td(v)); });
      t.tbody.appendChild(tr);
    });
    sec.appendChild(t.wrap);
    return sec;
  }

  function renderPatientDetail(box, p, onBack) {
    box.innerHTML = '';
    var back = el('a', 'link', '‹ 목록으로');
    back.href = '#view-search';
    back.addEventListener('click', function (e) { e.preventDefault(); onBack(); });
    box.appendChild(back);

    var head = el('div', 'pd-head');
    head.appendChild(el('div', 'pd-name', (p.name || '') + ' (' + (p.sex || '') + '/' + (p.age != null ? p.age : '') + ')'));
    head.appendChild(el('div', 'pd-meta', (p.pid || '') + ' · 최근 내원 ' + (p.lastVisit || '-')));
    if (p.dx) head.appendChild(el('div', 'pd-meta', '진단: ' + p.dx));
    if (p.rx) head.appendChild(el('div', 'pd-meta', '처방: ' + p.rx));
    if (p.memo) head.appendChild(el('div', 'pd-memo', p.memo));
    box.appendChild(head);

    var emr = p.emr || {};
    box.appendChild(emrSection('진단', ['진단명', '코드', '진단일'],
      (emr.diagnoses || []).map(function (d) { return [d.name, d.code, d.date]; })));
    box.appendChild(emrSection('처방', ['약품', '용법', '상태'],
      (emr.prescriptions || []).map(function (r) {
        return [r.drug, r.dosage, el('span', 'st ' + (r.active ? 'now' : 'cancel'), r.active ? '복용 중' : '종료')];
      })));
    box.appendChild(emrSection('바이탈', ['측정일', '혈압', '혈당', '체중', 'BMI'],
      (emr.vitals || []).map(function (v) {
        return [v.date,
          (v.systolic != null ? v.systolic : '-') + ' / ' + (v.diastolic != null ? v.diastolic : '-'),
          v.glucose != null ? v.glucose : '-',
          v.weight != null ? v.weight + 'kg' : '-',
          v.bmi != null ? v.bmi : '-'];
      })));
    box.appendChild(emrSection('검사', ['검사일', '항목', '결과', '참고치'],
      (emr.labs || []).map(function (l) {
        var val = l.value != null ? String(l.value) : '';
        var cell = l.flag ? el('span', l.flag === 'L' ? 'fl-l' : 'fl-h', val + ' (' + l.flag + ')') : val;
        return [l.date, l.test, cell, l.ref];
      })));
  }

  /* ---------- 뷰: 입·퇴원 관리 ---------- */
  function renderAdmissionView(host) {
    host.appendChild(viewHead('입·퇴원 관리', '병동 입·퇴원 현황 및 신규 입원 등록'));

    var formCard = el('div', 'card');
    formCard.appendChild(el('h3', 'vw-form-t', '신규 입원'));
    var form = el('div', 'vw-form');
    var picker = patientPicker();
    var room = textInput('예) 1210호');
    var ward = textInput('예) 내과 병동');
    var due = document.createElement('input'); due.type = 'date';
    var submit = vbtn('입원 등록');
    form.appendChild(field('환자 검색/선택', picker.root));
    form.appendChild(field('병실', room));
    form.appendChild(field('병동', ward));
    form.appendChild(field('퇴원 예정일 (선택)', due));
    form.appendChild(submit);
    formCard.appendChild(form);
    host.appendChild(formCard);

    var listCard = el('div', 'card');
    var box = el('div');
    listCard.appendChild(box);
    host.appendChild(listCard);

    function load() {
      box.innerHTML = '';
      fetchJson('/api/admissions').then(function (d) {
        var rows = Array.isArray(d.rows) ? d.rows : [];
        if (!rows.length) { box.appendChild(el('div', 'empty', '입원 내역이 없습니다')); return; }
        var t = makeTable(['병실', '병동', '환자', '성별/나이', '입원일', '퇴원 예정', '상태', '']);
        rows.forEach(function (r) {
          var tr = document.createElement('tr');
          tr.appendChild(td(r.room));
          tr.appendChild(td(r.ward));
          tr.appendChild(td(r.patient));
          tr.appendChild(td((r.sex || '') + '/' + (r.age != null ? r.age : '')));
          tr.appendChild(td(r.admittedAt));
          tr.appendChild(td(r.dischargeDue || '-'));
          tr.appendChild(td(stBadge(r.status, r.statusLabel)));
          var act = document.createElement('td');
          act.className = 'cell-act';
          if (r.status === 'admitted') {
            var b = vbtn('퇴원 처리', 'ghost sm');
            b.addEventListener('click', function () {
              b.disabled = true;
              fetchJson('/api/admissions/' + r.id, jsonOpts('PATCH', { status: 'discharged' }))
                .then(function () { toast('퇴원 처리되었습니다'); dashDirty = true; load(); })
                .catch(function (err) { toast('퇴원 처리 실패: ' + err.message); b.disabled = false; });
            });
            act.appendChild(b);
          }
          tr.appendChild(act);
          t.tbody.appendChild(tr);
        });
        box.appendChild(t.wrap);
      }).catch(function () { loadFail(box); });
    }

    submit.addEventListener('click', function () {
      var pid = picker.getId();
      if (!pid) { toast('환자를 선택하세요'); return; }
      if (!room.value.trim()) { toast('병실을 입력하세요'); room.focus(); return; }
      if (!ward.value.trim()) { toast('병동을 입력하세요'); ward.focus(); return; }
      var body = { patient_id: pid, room: room.value.trim(), ward: ward.value.trim() };
      if (due.value) body.discharge_due = due.value;
      submit.disabled = true;
      fetchJson('/api/admissions', jsonOpts('POST', body)).then(function () {
        toast('입원 등록이 완료되었습니다');
        dashDirty = true;
        room.value = ''; due.value = '';
        load();
      }).catch(function (err) {
        toast(err.status === 409 ? '이미 입원 중인 환자입니다' : ('입원 등록 실패: ' + err.message));
      }).then(function () { submit.disabled = false; });
    });
    load();
  }

  /* ---------- 뷰: 진료 일정 (scope=ward) ---------- */
  function renderScheduleView(host) {
    host.appendChild(viewHead('진료 일정', '병동 전체 예약 일정 (병실 포함)'));
    var card = el('div', 'card');
    var bar = el('div', 'vw-toolbar');
    var prev = vbtn('◀', 'ghost sm');
    var dateIn = document.createElement('input');
    dateIn.type = 'date';
    dateIn.value = todayISO();
    var next = vbtn('▶', 'ghost sm');
    var todayBtn = vbtn('오늘', 'ghost sm');
    var lab = el('span', 'vw-datelabel', '');
    bar.appendChild(prev); bar.appendChild(dateIn); bar.appendChild(next);
    bar.appendChild(todayBtn); bar.appendChild(lab);
    card.appendChild(bar);
    var box = el('div');
    card.appendChild(box);
    host.appendChild(card);

    function load() {
      box.innerHTML = '';
      fetchJson('/api/appointments?date=' + dateIn.value + '&scope=ward').then(function (d) {
        lab.textContent = d.dateLabel || '';
        var rows = Array.isArray(d.rows) ? d.rows : [];
        if (!rows.length) { box.appendChild(el('div', 'empty', '해당 날짜에 일정이 없습니다')); return; }
        var t = makeTable(['시간', '환자', '성별/나이', '병실', '구분', '상태']);
        rows.forEach(function (r) {
          var tr = document.createElement('tr');
          tr.appendChild(td(r.time));
          tr.appendChild(td(r.name));
          tr.appendChild(td((r.sex || '') + '/' + (r.age != null ? r.age : '')));
          tr.appendChild(td(r.room || '-'));
          tr.appendChild(td(r.kind));
          tr.appendChild(td(stBadge(r.status, r.statusLabel)));
          t.tbody.appendChild(tr);
        });
        box.appendChild(t.wrap);
      }).catch(function () { loadFail(box); });
    }
    prev.addEventListener('click', function () { dateIn.value = shiftISO(dateIn.value, -1); load(); });
    next.addEventListener('click', function () { dateIn.value = shiftISO(dateIn.value, 1); load(); });
    todayBtn.addEventListener('click', function () { dateIn.value = todayISO(); load(); });
    dateIn.addEventListener('change', load);
    load();
  }

  /* ---------- 뷰: 투약 / 검사·처치 (오늘 워크리스트 공용) ---------- */
  function renderWorklist(host, opt) {
    host.appendChild(viewHead(opt.title, opt.sub));
    var card = el('div', 'card');
    var box = el('div');
    card.appendChild(box);
    host.appendChild(card);
    function load() {
      box.innerHTML = '';
      fetchJson('/api/appointments?date=' + todayISO() + '&scope=ward').then(function (d) {
        var rows = (Array.isArray(d.rows) ? d.rows : []).filter(function (r) {
          return opt.kinds.indexOf(r.kind) !== -1;
        });
        if (!rows.length) { box.appendChild(el('div', 'empty', opt.emptyMsg)); return; }
        var t = makeTable(['시간', '환자', '성별/나이', '병실', '구분', '상태', '']);
        rows.forEach(function (r) {
          var tr = document.createElement('tr');
          tr.appendChild(td(r.time));
          tr.appendChild(td(r.name));
          tr.appendChild(td((r.sex || '') + '/' + (r.age != null ? r.age : '')));
          tr.appendChild(td(r.room || '-'));
          tr.appendChild(td(r.kind));
          tr.appendChild(td(stBadge(r.status, r.statusLabel)));
          var act = document.createElement('td');
          act.className = 'cell-act';
          if (r.status === 'scheduled') {
            var b = vbtn(opt.btnLabel, 'sm');
            b.addEventListener('click', function () {
              b.disabled = true;
              fetchJson('/api/appointments/' + r.id, jsonOpts('PATCH', { status: 'done' }))
                .then(function () { toast(opt.doneToast); dashDirty = true; load(); })
                .catch(function (err) { toast('처리 실패: ' + err.message); b.disabled = false; });
            });
            act.appendChild(b);
          }
          tr.appendChild(act);
          t.tbody.appendChild(tr);
        });
        box.appendChild(t.wrap);
      }).catch(function () { loadFail(box); });
    }
    load();
  }
  function renderMedsView(host) {
    renderWorklist(host, {
      title: '투약 관리', sub: '오늘 투약 예약 목록 — 완료 처리 시 간호 기록이 자동 등록됩니다.',
      kinds: ['투약'], btnLabel: '투약 완료',
      doneToast: '투약 완료 — 간호 기록에 자동 등록되었습니다',
      emptyMsg: '오늘 예정된 투약이 없습니다'
    });
  }
  function renderTestsView(host) {
    renderWorklist(host, {
      title: '검사 / 처치 관리', sub: '오늘 검사·처치 예약 목록 — 완료 처리 시 간호 기록이 자동 등록됩니다.',
      kinds: ['검사', '처치'], btnLabel: '완료 처리',
      doneToast: '완료 처리되었습니다 — 간호 기록에 자동 등록되었습니다',
      emptyMsg: '오늘 예정된 검사·처치가 없습니다'
    });
  }

  /* ---------- 뷰: 간호 기록 ---------- */
  function renderNotesView(host) {
    host.appendChild(viewHead('간호 기록', '유형별 간호 기록 조회 및 새 기록 작성'));

    var formCard = el('div', 'card');
    formCard.appendChild(el('h3', 'vw-form-t', '새 기록'));
    var form = el('div', 'vw-form');
    var picker = patientPicker();
    var typeSel = document.createElement('select');
    NOTE_TYPES.forEach(function (nt) {
      var o = document.createElement('option');
      o.value = nt; o.textContent = nt;
      typeSel.appendChild(o);
    });
    var content = document.createElement('textarea');
    content.rows = 2;
    content.placeholder = '기록 내용을 입력하세요';
    content.maxLength = 2000;
    var submit = vbtn('기록 등록');
    form.appendChild(field('환자 검색/선택', picker.root));
    form.appendChild(field('유형', typeSel));
    var cf = field('내용', content);
    cf.classList.add('grow');
    form.appendChild(cf);
    form.appendChild(submit);
    formCard.appendChild(form);
    host.appendChild(formCard);

    var card = el('div', 'card');
    var bar = el('div', 'vw-toolbar');
    var filter = document.createElement('select');
    [['', '전체 유형']].concat(NOTE_TYPES.map(function (nt) { return [nt, nt]; })).forEach(function (o) {
      var op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      filter.appendChild(op);
    });
    bar.appendChild(filter);
    card.appendChild(bar);
    var box = el('div');
    card.appendChild(box);
    host.appendChild(card);

    var page = 1;
    function load() {
      box.innerHTML = '';
      fetchJson('/api/nursing-notes?type=' + encodeURIComponent(filter.value) + '&page=' + page).then(function (d) {
        var rows = Array.isArray(d.rows) ? d.rows : [];
        if (!rows.length) { box.appendChild(el('div', 'empty', '간호 기록이 없습니다')); return; }
        var t = makeTable(['일시', '환자', '병실', '유형', '내용', '작성자']);
        rows.forEach(function (r) {
          var tr = document.createElement('tr');
          tr.appendChild(td((r.date || '') + ' ' + (r.time || '')));
          tr.appendChild(td(r.patient));
          tr.appendChild(td(r.room || '-'));
          tr.appendChild(td(r.type));
          var c = td(r.content); c.className = 'cell-wide';
          tr.appendChild(c);
          tr.appendChild(td(r.nurse));
          t.tbody.appendChild(tr);
        });
        box.appendChild(t.wrap);
        if (d.total != null && d.total > 20) {
          box.appendChild(pager(page, d.total, 20, function (p2) { page = p2; load(); }));
        }
      }).catch(function () { loadFail(box); });
    }
    filter.addEventListener('change', function () { page = 1; load(); });

    submit.addEventListener('click', function () {
      var pid = picker.getId();
      if (!pid) { toast('환자를 선택하세요'); return; }
      var text = content.value.trim();
      if (!text) { toast('내용을 입력하세요'); content.focus(); return; }
      submit.disabled = true;
      fetchJson('/api/nursing-notes', jsonOpts('POST', { patient_id: pid, note_type: typeSel.value, content: text }))
        .then(function () {
          toast('간호 기록이 등록되었습니다');
          dashDirty = true;
          content.value = '';
          page = 1;
          load();
        }).catch(function (err) { toast('등록 실패: ' + err.message); })
        .then(function () { submit.disabled = false; });
    });
    load();
  }

  /* ---------- 뷰: 서류 요청 관리 ---------- */
  function renderDocsView(host) {
    host.appendChild(viewHead('서류 요청 관리', '환자 서류 신청 건 발급/반려 처리'));
    var card = el('div', 'card');
    var tabs = el('div', 'vtabs');
    var tabReq = el('button', 'vtab on', '신청됨'); tabReq.type = 'button';
    var tabDone = el('button', 'vtab', '처리 완료'); tabDone.type = 'button';
    tabs.appendChild(tabReq); tabs.appendChild(tabDone);
    card.appendChild(tabs);
    var box = el('div');
    card.appendChild(box);
    host.appendChild(card);

    var mode = 'requested';
    var page = 1;
    function setMode(m) {
      mode = m; page = 1;
      tabReq.classList.toggle('on', m === 'requested');
      tabDone.classList.toggle('on', m !== 'requested');
      load();
    }
    tabReq.addEventListener('click', function () { setMode('requested'); });
    tabDone.addEventListener('click', function () { setMode('done'); });

    function patchDoc(id, status, btns) {
      btns.forEach(function (b) { b.disabled = true; });
      fetchJson('/api/documents/' + id, jsonOpts('PATCH', { status: status })).then(function () {
        toast(status === 'issued' ? '서류가 발급 처리되었습니다' : '서류가 반려 처리되었습니다');
        dashDirty = true;
        load();
      }).catch(function (err) {
        toast('처리 실패: ' + err.message);
        btns.forEach(function (b) { b.disabled = false; });
      });
    }

    function renderRows(rows, withActions, total) {
      if (!rows.length) { box.appendChild(el('div', 'empty', '해당 서류 요청이 없습니다')); return; }
      var cols = ['환자', '서류 유형', '신청일', '상태'];
      if (withActions) cols.push('');
      var t = makeTable(cols);
      rows.forEach(function (r) {
        var tr = document.createElement('tr');
        tr.appendChild(td(r.patient));
        tr.appendChild(td(r.type));
        tr.appendChild(td(r.date));
        tr.appendChild(td(stBadge(r.status, r.statusLabel)));
        if (withActions) {
          var act = document.createElement('td');
          act.className = 'cell-act';
          var ok = vbtn('발급', 'sm');
          var no = vbtn('반려', 'danger sm');
          ok.addEventListener('click', function () { patchDoc(r.id, 'issued', [ok, no]); });
          no.addEventListener('click', function () { patchDoc(r.id, 'rejected', [ok, no]); });
          act.appendChild(ok); act.appendChild(no);
          tr.appendChild(act);
        }
        t.tbody.appendChild(tr);
      });
      box.appendChild(t.wrap);
      if (total > 20) {
        box.appendChild(pager(page, total, 20, function (p2) { page = p2; load(); }));
      }
    }

    function load() {
      box.innerHTML = '';
      if (mode === 'requested') {
        fetchJson('/api/documents?status=requested&page=' + page).then(function (d) {
          renderRows(Array.isArray(d.rows) ? d.rows : [], true, d.total || 0);
        }).catch(function () { loadFail(box); });
      } else {
        fetchJson('/api/documents?status=processed&page=' + page).then(function (d) {
          renderRows(Array.isArray(d.rows) ? d.rows : [], false, d.total || 0);
        }).catch(function () { loadFail(box); });
      }
    }
    load();
  }

  /* ---------- 뷰: 공지 / 메모 ---------- */
  function renderMemoView(host) {
    host.appendChild(viewHead('공지 / 메모', '병동 공지 및 전달 사항 (최근 50건)'));
    var card = el('div', 'card');
    var form = el('div', 'vw-toolbar');
    var input = textInput('메모 내용을 입력하세요');
    input.maxLength = 500;
    var btn = vbtn('등록');
    form.appendChild(input); form.appendChild(btn);
    card.appendChild(form);
    var box = el('div');
    card.appendChild(box);
    host.appendChild(card);

    function load() {
      box.innerHTML = '';
      fetchJson('/api/memos?limit=50').then(function (d) {
        var rows = Array.isArray(d.rows) ? d.rows : [];
        if (!rows.length) { box.appendChild(el('div', 'empty', '등록된 메모가 없습니다')); return; }
        var t = makeTable(['날짜', '시간', '내용', '작성자']);
        rows.forEach(function (r) {
          var tr = document.createElement('tr');
          tr.appendChild(td(r.date));
          tr.appendChild(td(r.time));
          var c = td(r.text); c.className = 'cell-wide';
          tr.appendChild(c);
          tr.appendChild(td(r.author));
          t.tbody.appendChild(tr);
        });
        box.appendChild(t.wrap);
      }).catch(function () { loadFail(box); });
    }
    function save() { // 기존 P4 POST /api/memos 로직 재사용 (동일 엔드포인트/바디)
      var content = input.value.trim();
      if (!content) { input.focus(); return; }
      btn.disabled = true;
      fetchJson('/api/memos', jsonOpts('POST', { content: content })).then(function () {
        toast('메모가 등록되었습니다');
        dashDirty = true;
        input.value = '';
        load();
      }).catch(function (err) { toast('메모 등록 실패: ' + err.message); })
        .then(function () { btn.disabled = false; });
    }
    btn.addEventListener('click', save);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
    });
    load();
  }

  /* ---------- 뷰: 통계 / 리포트 ---------- */
  function renderStatsView(host) {
    host.appendChild(viewHead('통계 / 리포트', '병동 간호 통계 및 환자 안전 지표'));
    var box = el('div');
    host.appendChild(box);
    fetchJson('/api/stats/nurse').then(function (d) {
      var cards = el('div', 'vcards');
      [
        [d.admitted, '명', '현재 입원'],
        [d.dischargedThisMonth, '명', '이번 달 퇴원'],
        [d.doneToday, '건', '오늘 완료 처리']
      ].forEach(function (c) {
        var v = el('div', 'vcard');
        v.appendChild(el('div', 'vn', (c[0] != null ? c[0] : '-') + c[1]));
        v.appendChild(el('div', 'vl', c[2]));
        cards.appendChild(v);
      });
      box.appendChild(cards);

      var byType = el('div', 'card');
      byType.appendChild(el('h3', 'vw-form-t', (d.month || '') + ' 유형별 간호 기록'));
      var rows = Array.isArray(d.notesByType) ? d.notesByType : [];
      if (!rows.length) byType.appendChild(el('div', 'empty', '기록이 없습니다'));
      else {
        var t = makeTable(['유형', '건수']);
        rows.forEach(function (r) {
          var tr = document.createElement('tr');
          tr.appendChild(td(r.type));
          tr.appendChild(td((r.count != null ? r.count : 0) + '건'));
          t.tbody.appendChild(tr);
        });
        byType.appendChild(t.wrap);
      }
      box.appendChild(byType);

      var safety = d.safety || {};
      var sCard = el('div', 'card');
      sCard.appendChild(el('h3', 'vw-form-t', (d.month || '') + ' 환자 안전 지표'));
      var grid = el('div', 'vcards cols4');
      [['fall', '낙상 발생'], ['sore', '욕창 발생'], ['medError', '투약 오류'], ['infection', '감염 발생']]
        .forEach(function (s) {
          var v = el('div', 'vcard');
          var n = safety[s[0]] != null ? safety[s[0]] : 0;
          var vn = el('div', 'vn', n + '건');
          if (n > 0) vn.classList.add('warn');
          v.appendChild(vn);
          v.appendChild(el('div', 'vl', s[1]));
          grid.appendChild(v);
        });
      sCard.appendChild(grid);
      box.appendChild(sCard);
    }).catch(function () { loadFail(box); });
  }

  /* ---------- 뷰: 설정 ---------- */
  function renderSettingsView(host) {
    host.appendChild(viewHead('설정', '내 정보 확인 및 비밀번호 변경'));

    var info = el('div', 'card');
    info.appendChild(el('h3', 'vw-form-t', '내 정보'));
    var infoBox = el('div');
    info.appendChild(infoBox);
    host.appendChild(info);

    fetchJson('/api/me').then(function (me) {
      var p = me.profile || {};
      [['이름', me.name], ['아이디', me.username], ['역할', ROLE_KO[me.role] || me.role],
       ['소속', p.ward || '-'], ['직함', p.title || '-']].forEach(function (r) {
        var row = el('div', 'kv-row');
        row.appendChild(el('span', 'kv-k', r[0]));
        row.appendChild(el('span', 'kv-v', r[1] == null ? '-' : String(r[1])));
        infoBox.appendChild(row);
      });
    }).catch(function () { loadFail(infoBox); });

    var pw = el('div', 'card');
    pw.appendChild(el('h3', 'vw-form-t', '비밀번호 변경'));
    var form = el('div', 'vw-form');
    var cur = pwInput('현재 비밀번호');
    var next = pwInput('8자 이상');
    var conf = pwInput('다시 입력');
    var btn = vbtn('변경');
    form.appendChild(field('현재 비밀번호', cur));
    form.appendChild(field('새 비밀번호', next));
    form.appendChild(field('새 비밀번호 확인', conf));
    form.appendChild(btn);
    pw.appendChild(form);
    host.appendChild(pw);

    btn.addEventListener('click', function () {
      if (!cur.value) { toast('현재 비밀번호를 입력하세요'); cur.focus(); return; }
      if (next.value.length < 8) { toast('새 비밀번호는 8자 이상이어야 합니다'); next.focus(); return; }
      if (next.value !== conf.value) { toast('새 비밀번호 확인이 일치하지 않습니다'); conf.focus(); return; }
      btn.disabled = true;
      fetchJson('/api/me/password', jsonOpts('POST', { current: cur.value, next: next.value }))
        .then(function () {
          toast('비밀번호가 변경되었습니다');
          cur.value = next.value = conf.value = '';
        }).catch(function (err) { toast(err.message); })
        .then(function () { btn.disabled = false; });
    });
  }

  /* ---------- 뷰: C 안내 패널 (낙상 관리·간호 계획·교육 자료 공용) ---------- */
  // 고정 상수 마크업 (DB 유래 아님)
  var ETC_ICON = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.5 5 5.5.5-4 4 1 5.5L12 20l-5 .5 1-5.5-4-4 5.5-.5z"/></svg>';
  var ETC_VARIANTS = {
    fall: {
      title: '낙상 관리',
      desc: '낙상 위험 평가와 예방 활동 관리 기능은 차기 업데이트에서 제공될 예정입니다. 현재는 통계/리포트의 환자 안전 지표에서 이번 달 낙상 발생 현황을 확인할 수 있습니다.',
      links: [['#view-stats', '통계/리포트에서 안전 지표 보기']]
    },
    plan: {
      title: '간호 계획',
      desc: '간호 계획 수립·평가 기능은 차기 업데이트에서 제공될 예정입니다. 현재는 간호 기록 메뉴에서 환자별 경과 기록을 작성·조회할 수 있습니다.',
      links: [['#view-notes', '간호 기록으로 이동']]
    },
    edu: {
      title: '교육 자료',
      desc: '환자 교육 자료 라이브러리는 차기 업데이트에서 제공될 예정입니다. 대시보드의 Basil Nexus AI에게 퇴원 교육 안내문 작성을 요청해 보세요.',
      links: [['#view-dashboard', '대시보드로 이동']]
    }
  };
  function renderEtcView(host, variant) {
    var v = ETC_VARIANTS[variant] || {
      title: '준비 중인 기능',
      desc: '이 기능은 차기 업데이트에서 제공될 예정입니다. 관련 업무는 대시보드와 각 메뉴에서 계속 이용할 수 있습니다.',
      links: [['#view-dashboard', '대시보드로 이동']]
    };
    host.appendChild(viewHead(v.title));
    var card = el('div', 'card etc-card');
    var ico = el('span', 'etc-ico');
    ico.innerHTML = ETC_ICON;
    card.appendChild(ico);
    card.appendChild(el('h3', 'etc-t', v.title));
    card.appendChild(el('p', 'etc-d', v.desc));
    var links = el('div', 'etc-links');
    v.links.forEach(function (l) {
      var a = el('a', 'link', l[1] + ' ');
      a.href = l[0];
      a.appendChild(el('span', 'arr', '›'));
      links.appendChild(a);
    });
    card.appendChild(links);
    host.appendChild(card);
  }

  /* ---------- 라우팅 ---------- */
  var RENDERERS = {
    search: renderSearchView,
    admission: renderAdmissionView,
    schedule: renderScheduleView,
    meds: renderMedsView,
    tests: renderTestsView,
    notes: renderNotesView,
    docs: renderDocsView,
    memo: renderMemoView,
    stats: renderStatsView,
    settings: renderSettingsView,
    etc: renderEtcView
  };

  function parseHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (h.indexOf('view-') !== 0) return 'dashboard';
    var name = h.slice(5);
    if (name === 'dashboard') return 'dashboard';
    if (name.indexOf('etc') === 0) return name; // etc / etc-fall / etc-plan / etc-edu
    return RENDERERS[name] ? name : 'dashboard';
  }

  function showView(name) {
    var base = name.indexOf('etc') === 0 ? 'etc' : name;
    // .nav-i.on 동기화
    $all('.sb-nav .nav-i').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-view') === base);
    });
    if (base === 'dashboard') {
      if (viewHost) viewHost.style.display = 'none';
      dashKids.forEach(function (n) { n.style.display = ''; });
      if (dashDirty) { dashDirty = false; loadDashboard(); }
      return;
    }
    dashKids.forEach(function (n) { n.style.display = 'none'; });
    viewHost.innerHTML = '';
    viewHost.style.display = 'block';
    if (base === 'etc') renderEtcView(viewHost, name === 'etc' ? '' : name.slice(4));
    else RENDERERS[base](viewHost);
  }

  function initViews() {
    var main = $('.main');
    if (!main) return;
    dashKids = Array.prototype.slice.call(main.children);
    viewHost = el('div');
    viewHost.id = 'viewHost';
    main.appendChild(viewHost);
    window.addEventListener('hashchange', function () { showView(parseHash()); });
    showView(parseHash()); // 새로고침 시에도 해시 뷰 유지 (계약 §0)
  }

  /* ---------- 초기화 ---------- */
  function init() {
    loadDashboard();

    fetch('/api/health').then(function (r) {
      if (!r.ok) throw new Error('GET /api/health ' + r.status);
      return r.json();
    }).then(function (h) {
      if (h) renderHealth(h);
    }).catch(function (e) {
      console.warn('[nurse] 시스템 상태를 불러오지 못했습니다:', e.message);
    });

    setupMemoForm();
    initViews(); // P5 뷰 전환 플럼빙
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
