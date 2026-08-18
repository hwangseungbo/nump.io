/* ============================================================
   Basil Nexus — 환자 대시보드 (P4) + 사이드바 뷰 전환 (P5)
   - GET /api/dashboard/patient 1회 수신 후 각 패널 렌더링
   - POST /api/documents 로 서류 발급 신청 (.doc-c 카드 클릭)
   - POST /api/appointments 로 진료 예약 신청 (미니 모달)
   - fetch 실패/404 시 정적 목업 내용 유지 + console.warn
   - P5: 해시 라우팅(#view-*) + #viewHost 뷰 렌더 (계약 §0·§2 환자 표)
   ============================================================ */
(function () {
  'use strict';

  // 기존 .rec-row 의 하트 아이콘 마크업 복제 (고정 상수, DB 유래 아님)
  var HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 21s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.5-7 10-7 10z"/></svg>';
  var PILL_CLASSES = ['cap', 'tab', 'tab2'];
  // 서류 카드 이름(h4) → doc_type enum 매핑 (계약 §0)
  var DOC_MAP = {
    '진단서': '진단서',
    '소견서': '소견서',
    '진료기록 사본': '의무기록 사본',
    '검사결과서': '검사결과서',
    '처방전 재발급': '처방전'
  };
  var DOC_STATUS_CLASSES = { requested: 'st-requested', issued: 'st-issued', rejected: 'st-rejected' };

  var docsData = null; // 발급 내역 (대시보드 수신 성공 후 배열)

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text; // DB 유래 문자열은 항상 textContent (XSS 방지)
    return e;
  }
  function removeAll(sel, root) { $all(sel, root).forEach(function (n) { n.remove(); }); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------- 토스트 ---------- */
  function toast(msg, isErr) {
    var t = el('div', 'bn-toast' + (isErr ? ' err' : ''), msg);
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 2600);
  }

  /* ---------- 나의 일정 ---------- */
  function renderSchedule(d) {
    // nextAppt 가 null 이면 이 패널 전체 정적 유지
    if (!d.nextAppt) return;
    var next = $('#bnApptNext');
    if (next) {
      var dt = $('.dt', next), meta = $('.meta', next), dday = $('.dday', next);
      if (dt && d.nextAppt.dateLabel != null) dt.textContent = d.nextAppt.dateLabel;
      if (meta && d.nextAppt.meta != null) meta.textContent = d.nextAppt.meta;
      if (dday && d.nextAppt.dday != null) dday.textContent = 'D-' + d.nextAppt.dday;
    }
    var tl = $('#bnUpcoming');
    if (tl && Array.isArray(d.upcoming)) {
      removeAll('.tl-row', tl); // .tl-t("예정된 일정") 제목은 유지
      d.upcoming.forEach(function (u) {
        var row = el('div', 'tl-row');
        row.appendChild(el('span', 'dot'));
        row.appendChild(el('span', 'd', u.date || ''));
        row.appendChild(el('span', 'h', u.time || ''));
        row.appendChild(el('span', 'l', u.label || ''));
        tl.appendChild(row);
      });
    }
  }

  /* ---------- 최근 진료 기록 ---------- */
  function renderEncounters(rows) {
    var card = $('#bnRecCard');
    if (!card || !Array.isArray(rows)) return;
    removeAll('.rec-row', card);
    rows.forEach(function (r) {
      var row = el('div', 'rec-row');
      var ic = el('span', 'rec-ic');
      ic.innerHTML = HEART_SVG; // 고정 마크업 복제 (DB 유래 아님)
      var body = el('div', 'rec-b');
      var top = el('div', 'rec-top');
      top.appendChild(document.createTextNode(r.date || ''));
      top.appendChild(el('b', null, r.department || ''));
      body.appendChild(top);
      body.appendChild(el('div', 'rec-dx', r.dx || ''));
      body.appendChild(el('div', 'rec-dr', r.doctor || ''));
      var btn = el('button', 'btn-ghost', '상세 보기');
      btn.type = 'button';
      row.appendChild(ic); row.appendChild(body); row.appendChild(btn);
      card.appendChild(row);
    });
  }

  /* ---------- 처방 약 / 복약 정보 ---------- */
  function renderMeds(rows) {
    var card = $('#bnMedCard');
    if (!card || !Array.isArray(rows)) return;
    removeAll('.med-row', card);
    rows.forEach(function (m, i) {
      var row = el('div', 'med-row');
      row.appendChild(el('span', 'pill ' + PILL_CLASSES[i % PILL_CLASSES.length]));
      var body = el('div', 'med-b');
      body.appendChild(el('div', 'med-n', m.name || ''));
      body.appendChild(el('div', 'med-d', m.dosage || ''));
      row.appendChild(body);
      row.appendChild(el('span', 'tag-on', '복용 중'));
      card.appendChild(row);
    });
  }

  /* ---------- 환자 기본 정보 ---------- */
  function renderProfile(p) {
    var card = $('#bnProfileCard');
    if (!card || !p) return;
    var vals = $all('.kv .v', card);
    var order = [p.name, p.birth, p.sexLabel, p.phone, p.email, p.address];
    order.forEach(function (v, i) {
      if (vals[i] && v != null) vals[i].textContent = v;
    });
  }

  /* ---------- 진료비 내역 ---------- */
  function renderBills(bills) {
    var card = $('#bnBillCard');
    if (!card || !bills) return;
    var big = $('.bill-big .n', card);
    if (big && typeof bills.unpaid === 'number') big.textContent = bills.unpaid.toLocaleString() + '원';
    if (!Array.isArray(bills.rows)) return;
    removeAll('.bill-row', card);
    var foot = $('.bill-foot', card);
    bills.rows.forEach(function (b) {
      var row = el('div', 'bill-row');
      row.appendChild(el('span', 'bd', (b.date || '') + ' · ' + (b.item || '')));
      row.appendChild(el('span', 'bn', (typeof b.amount === 'number' ? b.amount.toLocaleString() : '0') + '원'));
      if (foot) card.insertBefore(row, foot); else card.appendChild(row);
    });
  }

  /* ---------- 건강 정보 요약 ---------- */
  function setHv(hv, value, smallText) {
    if (!hv || value == null) return;
    hv.textContent = value + ' ';
    hv.appendChild(el('small', null, smallText));
  }

  function renderHealth(h) {
    var card = $('#bnHealthCard');
    if (!card || !h) return;
    var hvs = $all('.health-row .hv', card);
    setHv(hvs[0], h.bp, 'mmHg');
    setHv(hvs[1], h.glucose, 'mg/dL');
    setHv(hvs[2], h.weight, 'kg');
    if (h.bmi != null) setHv(hvs[3], h.bmi, '(' + (h.bmiLabel || '') + ')');
    var foot = $('.health-foot', card);
    if (foot && h.lastCheck != null) foot.textContent = '최근 검진일: ' + h.lastCheck;
  }

  /* ---------- rail 알림 배지 ---------- */
  function renderBadge(alertCount) {
    var badge = $('.rail-top .badge');
    if (badge && alertCount != null) badge.textContent = alertCount;
  }

  /* ---------- 서류 발급 내역 (인라인 목록 토글) ---------- */
  function ensureDocsList() {
    var card = $('#bnDocsCard');
    if (!card) return null;
    var list = $('#bnDocsList');
    if (!list) {
      list = el('div', 'bn-docs-list');
      list.id = 'bnDocsList';
      card.appendChild(list);
    }
    return list;
  }

  function renderDocsList() {
    var list = ensureDocsList();
    if (!list) return;
    list.textContent = '';
    if (!Array.isArray(docsData)) {
      list.appendChild(el('div', 'bn-docs-empty', '발급 내역을 불러오지 못했습니다.'));
      return;
    }
    if (!docsData.length) {
      list.appendChild(el('div', 'bn-docs-empty', '발급 내역이 없습니다.'));
      return;
    }
    docsData.forEach(function (doc) {
      var row = el('div', 'bn-doc-row');
      row.appendChild(el('span', 'bn-doc-t', (doc.type || '') + ' · ' + (doc.date || '')));
      var stCls = DOC_STATUS_CLASSES[doc.status] || 'st-requested';
      row.appendChild(el('span', 'bn-doc-st ' + stCls, doc.statusLabel || ''));
      list.appendChild(row);
    });
  }

  /* P5: 대시보드 "나의 발급 내역 보기" 링크는 §4 매핑(#view-docs)으로 이동하므로
     P4의 인라인 토글(setupDocsHistory)은 제거. renderDocsList 등은 신청 성공 경로에서 재사용. */

  /* ---------- 서류 발급 신청 (POST /api/documents) ---------- */
  function attachDocCards(root) {
    if (!root) return;
    $all('.doc-c', root).forEach(function (cardEl) {
      cardEl.addEventListener('click', function (e) {
        e.preventDefault();
        var h4 = $('h4', cardEl);
        var label = h4 ? h4.textContent.trim() : '';
        var docType = DOC_MAP[label];
        if (!docType) return;
        if (!window.confirm("'" + label + "'을(를) 신청하시겠습니까?")) return;

        fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc_type: docType })
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            return { ok: r.ok, status: r.status, body: j };
          });
        }).then(function (res) {
          if (!res.ok) {
            var msg = res.status === 401 ? '로그인이 필요합니다'
              : res.status === 400 ? '요청 형식이 올바르지 않습니다'
              : '서류 신청에 실패했습니다 (' + res.status + ')';
            console.warn('[patient] POST /api/documents ' + res.status);
            toast(msg, true);
            return;
          }
          toast('서류 신청이 접수되었습니다');
          // 발급 내역 목록에 반영
          if (res.body && res.body.doc) {
            if (!Array.isArray(docsData)) docsData = [];
            docsData.unshift(res.body.doc);
            docsData = docsData.slice(0, 5); // 계약: 최근 5건
          }
          var list = $('#bnDocsList');
          if (list && list.classList.contains('open')) renderDocsList();
          loadDashboard();      // P5: 신청 성공 시 대시보드 데이터도 재조회
          refreshActiveView();  // P5: docs 뷰 활성 시 내역 표 재조회
        }).catch(function (err) {
          console.warn('[patient] POST /api/documents 실패:', err.message);
          toast('서버에 연결할 수 없습니다', true);
        });
      });
    });
  }

  function setupDocRequests() {
    attachDocCards($('#bnDocsCard'));
  }

  /* ---------- 진료 예약 모달 (POST /api/appointments) ---------- */
  function tomorrowStr() {
    var d = new Date();
    d.setDate(d.getDate() + 1);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function buildApptModal() {
    var overlay = el('div', 'bn-overlay');
    overlay.id = 'bnApptOverlay';
    var modal = el('div', 'bn-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', '진료 예약 신청');
    modal.appendChild(el('h3', null, '진료 예약 신청'));

    var lbDate = el('label', null, '날짜');
    var inDate = document.createElement('input');
    inDate.type = 'date';
    inDate.id = 'bnApDate';
    modal.appendChild(lbDate);
    modal.appendChild(inDate);

    var lbTime = el('label', null, '시간');
    var selTime = document.createElement('select');
    selTime.id = 'bnApTime';
    for (var h = 9; h <= 17; h++) {
      for (var m = 0; m < 60; m += 30) {
        var t = pad2(h) + ':' + pad2(m);
        var opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        selTime.appendChild(opt);
      }
    }
    modal.appendChild(lbTime);
    modal.appendChild(selTime);

    // P2: 진료과 선택 — 목록은 /api/chat-doctors의 doctors[].department에서 중복 제거.
    // 로딩 실패 시(구서버 등) 안내 옵션만 남고, 그 경우 선택 없이도 신청 가능(기존 동작 유지).
    var lbDept = el('label', null, '진료과');
    var selDept = document.createElement('select');
    selDept.id = 'bnApDept';
    var deptLoaded = false;
    var opt0 = document.createElement('option');
    opt0.value = ''; opt0.textContent = '진료과를 선택하세요';
    selDept.appendChild(opt0);
    fetch('/api/chat-doctors').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !Array.isArray(d.doctors)) return;
      var seen = {};
      d.doctors.forEach(function (doc) {
        var dep = doc.department;
        if (!dep || seen[dep]) return;
        seen[dep] = true;
        var o = document.createElement('option');
        o.value = dep;
        o.textContent = dep; // DB 유래 문자열 — textContent
        selDept.appendChild(o);
      });
      deptLoaded = selDept.options.length > 1;
    }).catch(function () { /* 실패 시 진료과 없이 기존 흐름 */ });
    modal.appendChild(lbDept);
    modal.appendChild(selDept);

    var lbKind = el('label', null, '종류');
    var selKind = document.createElement('select');
    selKind.id = 'bnApKind';
    ['진료', '검사', '물리치료', '검진'].forEach(function (k) {
      var opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k;
      selKind.appendChild(opt);
    });
    modal.appendChild(lbKind);
    modal.appendChild(selKind);

    var errBox = el('div', 'bn-modal-err');
    errBox.hidden = true;
    modal.appendChild(errBox);

    var btns = el('div', 'bn-modal-btns');
    var submit = el('button', 'bn-btn-primary', '신청');
    submit.type = 'button';
    var cancel = el('button', 'bn-btn-ghost', '취소');
    cancel.type = 'button';
    btns.appendChild(submit);
    btns.appendChild(cancel);
    modal.appendChild(btns);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function showErr(msg) { errBox.textContent = msg; errBox.hidden = false; }
    function clearErr() { errBox.hidden = true; errBox.textContent = ''; }
    function close() { overlay.classList.remove('open'); }

    cancel.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });

    submit.addEventListener('click', function () {
      clearErr();
      var min = inDate.min || tomorrowStr();
      var date = inDate.value;
      var time = selTime.value;
      var kind = selKind.value;
      if (!date) { showErr('예약 날짜를 선택해 주세요.'); return; }
      if (date < min) { showErr('내일 이후 날짜만 선택할 수 있습니다.'); return; }
      // P2: 진료과 목록이 정상 로드됐으면 필수 선택
      if (deptLoaded && !selDept.value) { showErr('진료과를 선택해 주세요.'); return; }

      var payload = { date: date, time: time, kind: kind };
      if (selDept.value) payload.department = selDept.value;
      submit.disabled = true;
      fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          return { ok: r.ok, status: r.status, body: j };
        });
      }).then(function (res) {
        submit.disabled = false;
        if (!res.ok) {
          console.warn('[patient] POST /api/appointments ' + res.status);
          if (res.body && res.body.error) showErr(res.body.error);
          else if (res.status === 400) showErr('과거 날짜이거나 입력 형식이 올바르지 않습니다.');
          else if (res.status === 401) showErr('로그인이 필요합니다.');
          else showErr('서버 오류로 예약을 신청하지 못했습니다 (' + res.status + ')');
          return;
        }
        close();
        // P2: 배정된 의사 안내 — 서버 응답의 진료과·의사명(DB 유래)은 toast가 textContent로 렌더
        if (res.body && res.body.doctorName)
          toast((res.body.department ? res.body.department + ' ' : '') + res.body.doctorName + ' 원장님으로 접수되었습니다');
        else toast('예약이 신청되었습니다');
        loadDashboard(); // 일정 패널 갱신
        refreshActiveView(); // P5: appt 뷰 활성 시 예약 표 재조회
      }).catch(function (err) {
        submit.disabled = false;
        console.warn('[patient] POST /api/appointments 실패:', err.message);
        showErr('서버에 연결할 수 없습니다.');
      });
    });

    return {
      open: function () {
        clearErr();
        inDate.min = tomorrowStr();
        if (!inDate.value || inDate.value < inDate.min) inDate.value = inDate.min;
        overlay.classList.add('open');
        inDate.focus();
      }
    };
  }

  var apptModal = null; // P5: appt 뷰 "새 예약" 버튼과 공유 (기존 P4 모달 재사용)
  function openApptModal() {
    if (!apptModal) apptModal = buildApptModal();
    apptModal.open();
  }

  function setupApptModal() {
    var btn = $('#bnApptBtn');
    if (!btn) return;
    btn.addEventListener('click', openApptModal);
  }

  /* ---------- 대시보드 렌더 ---------- */
  function renderDashboard(d) {
    renderSchedule(d);
    renderEncounters(d.encounters);
    renderMeds(d.meds);
    renderProfile(d.profile);
    renderBills(d.bills);
    renderHealth(d.health);
    bellItems = [];
    if (d.nextAppt && d.nextAppt.dateLabel) bellItems.push({ t: '다음 예약 ' + d.nextAppt.dateLabel, h: '#view-appt' });
    if (d.bills && d.bills.unpaid > 0) bellItems.push({ t: '미납 진료비 ' + d.bills.unpaid.toLocaleString() + '원', h: '#view-bills' });
    if (Array.isArray(d.docs) && d.docs.length) bellItems.push({ t: '서류 신청·발급 ' + d.docs.length + '건', h: '#view-docs' });
    renderBadge(bellItems.length); // 배지 = 드롭다운 목록 건수 (서버 alertCount와 불일치 방지)
    if (Array.isArray(d.docs)) {
      docsData = d.docs;
      var list = $('#bnDocsList');
      if (list && list.classList.contains('open')) renderDocsList();
    }
  }

  function loadDashboard() {
    return fetch('/api/dashboard/patient').then(function (r) {
      if (!r.ok) throw new Error('GET /api/dashboard/patient ' + r.status);
      return r.json();
    }).then(function (d) {
      if (d) renderDashboard(d); // 렌더는 데이터 수신 성공 후에만
    }).catch(function (e) {
      console.warn('[patient] 대시보드 데이터를 불러오지 못해 정적 목업을 유지합니다:', e.message);
    });
  }

  /* ============================================================
     P5 — 사이드바 뷰 전환 (해시 라우팅 #view-*, 계약 §0·§2)
     ============================================================ */
  var VIEWS = ['home', 'appt', 'records', 'labs', 'meds', 'docs', 'bills', 'health', 'family', 'notice'];
  var currentView = 'home';
  var viewHost = null;
  var homeChildren = [];
  var pageState = { records: 1, docs: 1 }; // 페이지네이션 상태

  // 예약 상태 뱃지 색상 (status → .vbdg 변형)
  var APPT_ST_CLASSES = { scheduled: 'g', done: 'g', cancelled: 'gray', no_show: 'r' };
  var APPT_LABEL_CLASSES = { '대기': 'g', '완료': 'g', '취소': 'gray', 'No-Show': 'r' };

  /* ---------- P5 공통 헬퍼 ---------- */
  function fetchJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }

  function patchJSON(url, body) {
    return fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        return { ok: r.ok, status: r.status, body: j };
      });
    });
  }

  function apiErrMsg(res, fallback) {
    if (res && res.body && typeof res.body.error === 'string' && res.body.error) return res.body.error;
    return fallback + ' (' + (res ? res.status : '?') + ')';
  }

  function viewHead(title, sub) {
    var head = el('div', 'view-head');
    var left = el('div');
    left.appendChild(el('h2', null, title));
    if (sub) left.appendChild(el('div', 'vh-sub', sub));
    head.appendChild(left);
    return head;
  }

  function emptyBox(msg) {
    return el('div', 'empty', msg || '데이터를 불러올 수 없습니다');
  }

  function makeTable(headers) {
    var wrap = el('div', 'vt-wrap');
    var table = el('table', 'vt');
    var thead = document.createElement('thead');
    var tr = document.createElement('tr');
    headers.forEach(function (h) { tr.appendChild(el('th', null, h)); });
    thead.appendChild(tr);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    table.appendChild(tbody);
    wrap.appendChild(table);
    return { wrap: wrap, tbody: tbody };
  }

  function td(text) { return el('td', null, text == null || text === '' ? '—' : String(text)); }
  function badge(variant, text) { return el('span', 'vbdg ' + variant, text || ''); }
  function won(n) { return (typeof n === 'number' ? n.toLocaleString() : '0') + '원'; }

  // 계약 §0: ‹ 이전 | n / 전체 | 다음 ›
  function pagerEl(page, pages, onGo) {
    var p = el('div', 'pgr');
    var prev = el('button', null, '‹ 이전');
    prev.type = 'button';
    prev.disabled = page <= 1;
    prev.addEventListener('click', function () { if (page > 1) onGo(page - 1); });
    var next = el('button', null, '다음 ›');
    next.type = 'button';
    next.disabled = page >= pages;
    next.addEventListener('click', function () { if (page < pages) onGo(page + 1); });
    p.appendChild(prev);
    p.appendChild(el('span', null, page + ' / ' + pages));
    p.appendChild(next);
    return p;
  }

  function pageCount(total, perPage) {
    return Math.max(1, Math.ceil((typeof total === 'number' ? total : 0) / perPage));
  }

  /* ---------- 뷰: 진료 예약 (appt) ---------- */
  function cancelAppt(a) {
    var label = (a.date || '') + ' ' + (a.time || '');
    if (!window.confirm(label + ' 예약을 취소하시겠습니까?')) return;
    patchJSON('/api/appointments/' + a.id, { status: 'cancelled' }).then(function (res) {
      if (!res.ok) {
        console.warn('[patient] PATCH /api/appointments/' + a.id + ' ' + res.status);
        toast(apiErrMsg(res, '예약 취소에 실패했습니다'), true);
        return;
      }
      toast('예약이 취소되었습니다');
      refreshActiveView();
      loadDashboard(); // 대시보드 일정 패널 갱신
    }).catch(function (err) {
      console.warn('[patient] PATCH /api/appointments 실패:', err.message);
      toast('서버에 연결할 수 없습니다', true);
    });
  }

  function apptStatusBadge(row) {
    var variant = APPT_ST_CLASSES[row.status] || APPT_LABEL_CLASSES[row.statusLabel] || 'gray';
    return badge(variant, row.statusLabel || '');
  }

  function renderApptView(host) {
    host.textContent = '';
    var head = viewHead('진료 예약', '다가오는 예약을 확인·취소하고, 새 예약을 신청할 수 있습니다.');
    var newBtn = el('button', 'bn-btn-primary vh-btn', '+ 새 예약');
    newBtn.type = 'button';
    newBtn.addEventListener('click', openApptModal); // 기존 P4 모달 재사용
    head.appendChild(newBtn);
    host.appendChild(head);

    var body = el('div');
    host.appendChild(body);

    fetchJSON('/api/appointments?scope=self').then(function (d) {
      body.textContent = '';

      var card1 = el('div', 'card v-card');
      card1.appendChild(el('div', 'vs-t', '다가오는 예약'));
      var up = Array.isArray(d.upcoming) ? d.upcoming : [];
      if (!up.length) {
        card1.appendChild(emptyBox('다가오는 예약이 없습니다'));
      } else {
        var t1 = makeTable(['날짜', '시간', '종류', '진료과', '담당의', '관리']);
        up.forEach(function (a) {
          var tr = document.createElement('tr');
          tr.appendChild(td(a.date));
          tr.appendChild(td(a.time));
          tr.appendChild(td(a.kind));
          tr.appendChild(td(a.department));
          tr.appendChild(td(a.doctor));
          var cell = document.createElement('td');
          if (a.cancellable) {
            var b = el('button', 'vt-btn warn', '예약 취소');
            b.type = 'button';
            b.addEventListener('click', function () { cancelAppt(a); });
            cell.appendChild(b);
          } else {
            cell.textContent = '—';
          }
          tr.appendChild(cell);
          t1.tbody.appendChild(tr);
        });
        card1.appendChild(t1.wrap);
      }
      body.appendChild(card1);

      var card2 = el('div', 'card v-card');
      card2.appendChild(el('div', 'vs-t', '지난 예약'));
      var past = Array.isArray(d.past) ? d.past : [];
      if (!past.length) {
        card2.appendChild(emptyBox('지난 예약이 없습니다'));
      } else {
        var t2 = makeTable(['날짜', '시간', '종류', '진료과', '담당의', '상태']);
        past.forEach(function (a) {
          var tr = document.createElement('tr');
          tr.appendChild(td(a.date));
          tr.appendChild(td(a.time));
          tr.appendChild(td(a.kind));
          tr.appendChild(td(a.department));
          tr.appendChild(td(a.doctor));
          var cell = document.createElement('td');
          cell.appendChild(apptStatusBadge(a));
          tr.appendChild(cell);
          t2.tbody.appendChild(tr);
        });
        card2.appendChild(t2.wrap);
      }
      body.appendChild(card2);
    }).catch(function (err) {
      console.warn('[patient] GET /api/appointments?scope=self 실패:', err.message);
      body.textContent = '';
      body.appendChild(emptyBox());
    });
  }

  /* ---------- 뷰: 진료 기록 (records) ---------- */
  function loadRecordsPage(card, page) {
    pageState.records = page;
    card.textContent = '';
    fetchJSON('/api/encounters?page=' + page).then(function (d) {
      var rows = Array.isArray(d.rows) ? d.rows : [];
      if (!rows.length) {
        card.appendChild(emptyBox('진료 기록이 없습니다'));
        if (page > 1) { // 마지막 페이지를 넘어선 경우 되돌아갈 수 있게
          card.appendChild(pagerEl(page, pageCount(d.total, 20), function (p) {
            loadRecordsPage(card, p);
          }));
        }
        return;
      }
      var t = makeTable(['날짜', '진료과', '진단', '담당의']);
      rows.forEach(function (r) {
        var tr = document.createElement('tr');
        tr.appendChild(td((r.date || '') + (r.time ? ' ' + r.time : '')));
        tr.appendChild(td(r.department));
        tr.appendChild(td(r.dx));
        tr.appendChild(td(r.doctor));
        t.tbody.appendChild(tr);
      });
      card.appendChild(t.wrap);
      card.appendChild(pagerEl(page, pageCount(d.total, 20), function (p) {
        loadRecordsPage(card, p);
      }));
    }).catch(function (err) {
      console.warn('[patient] GET /api/encounters 실패:', err.message);
      card.textContent = '';
      card.appendChild(emptyBox());
    });
  }

  function renderRecordsView(host) {
    host.textContent = '';
    host.appendChild(viewHead('진료 기록', '나의 진료 내역을 최신순으로 확인할 수 있습니다.'));
    var card = el('div', 'card v-card');
    host.appendChild(card);
    loadRecordsPage(card, pageState.records);
  }

  /* ---------- 뷰: 검사 결과 (labs) ---------- */
  // P3a: 검사 항목 쉬운 이름 병기 사전 — 미등재 항목은 원명 그대로
  var LAB_EASY = {
    'LDL-C': 'LDL (나쁜 콜레스테롤)', 'HbA1c': '당화혈색소 (3개월 평균 혈당)',
    'TSH': '갑상선 자극 호르몬', 'CRP': '염증 수치', 'DEXA T-score': '골밀도 점수',
    '크레아티닌': '신장 기능', 'AST': '간 기능', 'ALT': '간 기능'
  };
  // P3a: flag×추세 조합의 안심형 한 줄 해석 (공포 조장·진단 표현 금지, 행동 권유형)
  function labAdvice(flag, dir) { // dir: 'better' | 'worse' | null
    if (flag !== 'H' && flag !== 'L') return '정상 범위예요.';
    if (dir === 'better')
      return (flag === 'H' ? '목표보다 조금 높지만' : '목표보다 조금 낮지만') + ' 지난번보다 좋아지고 있어요. 처방을 꾸준히 지켜주세요.';
    if (dir === 'worse')
      return (flag === 'H' ? '지난번보다 조금 올랐어요.' : '지난번보다 조금 내려갔어요.') + ' 다음 진료 때 선생님과 상의해 보세요.';
    return (flag === 'H' ? '목표보다 조금 높아요.' : '목표보다 조금 낮아요.') + ' 다음 진료 때 선생님과 함께 확인해 보세요.';
  }
  function renderLabsView(host) {
    host.textContent = '';
    host.appendChild(viewHead('검사 결과', '최근 검사 결과를 확인할 수 있습니다. L(낮음)·H(높음) 항목은 강조 표시됩니다.'));
    var card = el('div', 'card v-card');
    host.appendChild(card);
    fetchJSON('/api/lab-results').then(function (d) {
      var rows = Array.isArray(d.rows) ? d.rows : [];
      if (!rows.length) {
        card.appendChild(emptyBox('검사 결과가 없습니다'));
        return;
      }
      var t = makeTable(['날짜', '검사 항목', '결과', '참고치', '판정']);
      rows.forEach(function (r, i) {
        var tr = document.createElement('tr');
        tr.appendChild(td(r.date));
        // 검사 항목 — 쉬운 이름을 아래 줄에 병기 (전부 textContent)
        var tCell = td(r.test);
        var easy = LAB_EASY[r.test];
        if (easy) {
          var e = el('div', 'muted', easy);
          e.style.cssText = 'font-size:11px;font-weight:400;';
          tCell.appendChild(e);
        }
        tr.appendChild(tCell);
        var vCell = td(r.value);
        if (r.flag === 'L') vCell.className = 'fl-l';
        else if (r.flag === 'H') vCell.className = 'fl-h';
        tr.appendChild(vCell);
        tr.appendChild(td(r.ref));
        var fCell = document.createElement('td');
        if (r.flag === 'L') fCell.appendChild(badge('b', '낮음 (L)'));
        else if (r.flag === 'H') fCell.appendChild(badge('r', '높음 (H)'));
        else fCell.appendChild(badge('g', '정상'));
        tr.appendChild(fCell);
        t.tbody.appendChild(tr);

        // P3a: 전회 대비 + 안심형 한 줄 해석 (행 아래 보조 텍스트, colspan 행)
        var prev = null; // 응답은 최신순 — 뒤쪽에서 같은 항목의 직전(더 오래된) 결과를 찾는다
        for (var j = i + 1; j < rows.length; j++) {
          if (rows[j].test === r.test) { prev = rows[j]; break; }
        }
        var cur = parseFloat(r.value);
        var dir = null, cmpText = '';
        if (prev) {
          var pv = parseFloat(prev.value);
          if (isFinite(cur) && isFinite(pv) && cur !== pv) {
            var arrow = cur > pv ? '▲' : '▼';
            cmpText = '지난번 ' + prev.value + ' → 이번 ' + r.value + ' ' + arrow;
            // 개선 판정: H는 내려가면, L은 올라가면 개선
            if (r.flag === 'H') dir = cur < pv ? 'better' : 'worse';
            else if (r.flag === 'L') dir = cur > pv ? 'better' : 'worse';
          } else if (isFinite(cur) && isFinite(pv)) {
            cmpText = '지난번 ' + prev.value + ' → 이번 ' + r.value + ' →';
          }
        }
        var subTr = document.createElement('tr');
        var subTd = document.createElement('td');
        subTd.colSpan = 5;
        subTd.className = 'muted';
        subTd.style.cssText = 'font-size:11.5px;padding-top:0;';
        subTd.textContent = (cmpText ? cmpText + ' · ' : '') + labAdvice(r.flag, dir);
        subTr.appendChild(subTd);
        t.tbody.appendChild(subTr);
      });
      card.appendChild(t.wrap);
    }).catch(function (err) {
      console.warn('[patient] GET /api/lab-results 실패:', err.message);
      card.appendChild(emptyBox());
    });
  }

  /* ---------- 뷰: 처방 약 / 복약 정보 (meds) ---------- */
  function renderMedsView(host) {
    host.textContent = '';
    host.appendChild(viewHead('처방 약 / 복약 정보', '처방받은 약과 복용 상태를 확인할 수 있습니다.'));
    var card = el('div', 'card v-card');
    host.appendChild(card);
    fetchJSON('/api/prescriptions').then(function (d) {
      var rows = Array.isArray(d.rows) ? d.rows : [];
      if (!rows.length) {
        card.appendChild(emptyBox('처방 내역이 없습니다'));
        return;
      }
      var t = makeTable(['처방 약', '용법·용량', '시작일', '종료일', '상태']);
      rows.forEach(function (m) {
        var tr = document.createElement('tr');
        tr.appendChild(td(m.drug));
        tr.appendChild(td(m.dosage));
        tr.appendChild(td(m.start));
        tr.appendChild(td(m.end));
        var cell = document.createElement('td');
        cell.appendChild(el('span', m.active ? 'tag-on' : 'tag-off', m.active ? '복용 중' : '종료'));
        tr.appendChild(cell);
        t.tbody.appendChild(tr);
      });
      card.appendChild(t.wrap);
    }).catch(function (err) {
      console.warn('[patient] GET /api/prescriptions 실패:', err.message);
      card.appendChild(emptyBox());
    });
  }

  /* ---------- 뷰: 서류 발급 / 신청 (docs) ---------- */
  function loadDocsPage(card, page) {
    pageState.docs = page;
    card.textContent = '';
    card.appendChild(el('div', 'vs-t', '나의 신청·발급 내역'));
    var body = el('div');
    card.appendChild(body);
    fetchJSON('/api/documents?status=all&page=' + page).then(function (d) {
      var rows = Array.isArray(d.rows) ? d.rows : [];
      if (!rows.length) {
        body.appendChild(emptyBox('신청 내역이 없습니다'));
        if (page > 1) { // 마지막 페이지를 넘어선 경우 되돌아갈 수 있게
          body.appendChild(pagerEl(page, pageCount(d.total, 20), function (p) {
            loadDocsPage(card, p);
          }));
        }
        return;
      }
      var t = makeTable(['서류', '신청일', '상태']);
      rows.forEach(function (doc) {
        var tr = document.createElement('tr');
        tr.appendChild(td(doc.type));
        tr.appendChild(td(doc.date));
        var cell = document.createElement('td');
        var stCls = DOC_STATUS_CLASSES[doc.status] || 'st-requested';
        cell.appendChild(el('span', 'bn-doc-st ' + stCls, doc.statusLabel || ''));
        tr.appendChild(cell);
        t.tbody.appendChild(tr);
      });
      body.appendChild(t.wrap);
      var pages = pageCount(d.total, 20);
      if (pages > 1) {
        body.appendChild(pagerEl(page, pages, function (p) { loadDocsPage(card, p); }));
      }
    }).catch(function (err) {
      console.warn('[patient] GET /api/documents 실패:', err.message);
      body.appendChild(emptyBox());
    });
  }

  function renderDocsView(host) {
    host.textContent = '';
    host.appendChild(viewHead('서류 발급 / 신청', '필요한 서류를 신청하고 발급 상태를 확인할 수 있습니다.'));

    // 신청 카드 5종 — 대시보드 카드 마크업 복제 + 동일 신청 로직 재사용
    var src = $('#bnDocsCard .docs');
    if (src) {
      var reqCard = el('div', 'card v-card');
      reqCard.appendChild(el('div', 'vs-t', '서류 신청'));
      var grid = src.cloneNode(true);
      attachDocCards(grid);
      reqCard.appendChild(grid);
      host.appendChild(reqCard);
    }

    var listCard = el('div', 'card v-card');
    host.appendChild(listCard);
    loadDocsPage(listCard, pageState.docs);
  }

  /* ---------- 뷰: 수납 / 결제 내역 (bills) ---------- */
  function payBill(b) {
    var label = (b.item || '') + ' ' + won(b.amount);
    if (!window.confirm(label + '을(를) 수납 처리하시겠습니까? (데모)')) return;
    patchJSON('/api/bills/' + b.id, { paid: true }).then(function (res) {
      if (!res.ok) {
        console.warn('[patient] PATCH /api/bills/' + b.id + ' ' + res.status);
        toast(apiErrMsg(res, '수납 처리에 실패했습니다'), true);
        return;
      }
      toast('수납이 완료되었습니다');
      refreshActiveView();
      loadDashboard(); // 대시보드 진료비 패널 갱신
    }).catch(function (err) {
      console.warn('[patient] PATCH /api/bills 실패:', err.message);
      toast('서버에 연결할 수 없습니다', true);
    });
  }

  function renderBillsView(host) {
    host.textContent = '';
    host.appendChild(viewHead('수납 / 결제 내역', '진료비 청구·수납 내역을 확인하고 미납 금액을 수납할 수 있습니다.'));
    var body = el('div');
    host.appendChild(body);
    fetchJSON('/api/bills').then(function (d) {
      body.textContent = '';

      var bigCard = el('div', 'card v-card');
      var big = el('div', 'bill-big');
      big.appendChild(el('div', 'l', '미수납 금액'));
      big.appendChild(el('div', 'n', won(d.unpaid)));
      bigCard.appendChild(big);
      body.appendChild(bigCard);

      var card = el('div', 'card v-card');
      var rows = Array.isArray(d.rows) ? d.rows : [];
      if (!rows.length) {
        card.appendChild(emptyBox('수납 내역이 없습니다'));
      } else {
        var t = makeTable(['날짜', '항목', '금액', '상태', '관리']);
        rows.forEach(function (b) {
          var tr = document.createElement('tr');
          tr.appendChild(td(b.date));
          tr.appendChild(td(b.item));
          tr.appendChild(td(won(b.amount)));
          var stCell = document.createElement('td');
          stCell.appendChild(b.paid ? badge('g', '수납 완료') : badge('r', '미납'));
          tr.appendChild(stCell);
          var cell = document.createElement('td');
          if (!b.paid) {
            var btn = el('button', 'vt-btn', '수납하기(데모)');
            btn.type = 'button';
            btn.addEventListener('click', function () { payBill(b); });
            cell.appendChild(btn);
          } else {
            cell.textContent = '—';
          }
          tr.appendChild(cell);
          t.tbody.appendChild(tr);
        });
        card.appendChild(t.wrap);
      }
      body.appendChild(card);
    }).catch(function (err) {
      console.warn('[patient] GET /api/bills 실패:', err.message);
      body.textContent = '';
      body.appendChild(emptyBox());
    });
  }

  /* ---------- 뷰: 건강 정보 (health) ---------- */
  function miniChart(title, entries, barCls) {
    var card = el('div', 'card v-card');
    card.appendChild(el('div', 'vs-t', title));
    var valid = entries.filter(function (e) { return typeof e.value === 'number'; });
    if (!valid.length) {
      card.appendChild(emptyBox('표시할 데이터가 없습니다'));
      return card;
    }
    var max = valid.reduce(function (m, e) { return Math.max(m, e.value); }, 0) || 1;
    var bars = el('div', 'mc-bars');
    valid.forEach(function (e) {
      var col = el('div', 'mc-col');
      col.appendChild(el('div', 'mc-v', String(e.value)));
      var bar = el('div', 'mc-bar' + (barCls ? ' ' + barCls : ''));
      bar.style.height = Math.max(6, Math.round(e.value / max * 92)) + 'px'; // 값에 비례한 높이
      col.appendChild(bar);
      col.appendChild(el('div', 'mc-d', e.label));
      bars.appendChild(col);
    });
    card.appendChild(bars);
    return card;
  }

  function renderHealthView(host) {
    host.textContent = '';
    host.appendChild(viewHead('건강 정보', '측정 기록과 최근 혈압·혈당 추이를 확인할 수 있습니다.'));
    var body = el('div');
    host.appendChild(body);
    fetchJSON('/api/vitals').then(function (d) {
      body.textContent = '';
      var rows = Array.isArray(d.rows) ? d.rows : [];
      if (!rows.length) {
        var emptyCard = el('div', 'card v-card');
        emptyCard.appendChild(emptyBox('측정 기록이 없습니다'));
        body.appendChild(emptyCard);
        return;
      }

      // 최근 7회(시간순) 미니 바 추이
      var recent = rows.slice(0, 7).reverse();
      function shortDate(r) { return (r.date || '').slice(5); } // "2026.07.23" → "07.23"
      var chartWrap = el('div', 'chart2');
      chartWrap.appendChild(miniChart('최근 혈압(수축기) 추이 · mmHg', recent.map(function (r) {
        return { value: r.systolic, label: shortDate(r) };
      }), ''));
      chartWrap.appendChild(miniChart('최근 혈당 추이 · mg/dL', recent.map(function (r) {
        return { value: r.glucose, label: shortDate(r) };
      }), 'glu'));
      body.appendChild(chartWrap);

      var card = el('div', 'card v-card');
      var t = makeTable(['날짜', '시간', '혈압 (mmHg)', '혈당 (mg/dL)', '체중 (kg)', 'BMI']);
      rows.forEach(function (r) {
        var tr = document.createElement('tr');
        tr.appendChild(td(r.date));
        tr.appendChild(td(r.time));
        tr.appendChild(td(r.systolic != null && r.diastolic != null ? r.systolic + ' / ' + r.diastolic : null));
        tr.appendChild(td(r.glucose));
        tr.appendChild(td(r.weight));
        tr.appendChild(td(r.bmi));
        t.tbody.appendChild(tr);
      });
      card.appendChild(t.wrap);
      body.appendChild(card);
    }).catch(function (err) {
      console.warn('[patient] GET /api/vitals 실패:', err.message);
      body.textContent = '';
      body.appendChild(emptyBox());
    });
  }

  /* ---------- 뷰: 가족 건강 관리 (family) — C 안내 패널 ---------- */
  var FAMILY_ICON_SVG = '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0112 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15 20a5 5 0 016-3"/></svg>'; // 사이드바 아이콘 복제 (고정 상수)

  function renderFamilyView(host) {
    host.textContent = '';
    host.appendChild(viewHead('가족 건강 관리'));
    var card = el('div', 'card c-panel');
    var ico = el('span', 'c-ico');
    ico.innerHTML = FAMILY_ICON_SVG; // 고정 마크업 (DB 유래 아님)
    card.appendChild(ico);
    var box = el('div');
    box.appendChild(el('h3', null, '가족 건강 관리는 차기 업데이트 예정입니다.'));
    box.appendChild(el('p', null,
      '가족 구성원의 진료 예약·진료 기록·복약 정보를 한 화면에서 함께 관리하는 기능을 준비하고 있습니다. ' +
      '업데이트가 공개되면 공지사항을 통해 안내해 드리겠습니다.'));
    var link = el('a', 'link');
    link.href = '#view-notice';
    link.textContent = '공지사항 보기 ›';
    box.appendChild(link);
    card.appendChild(box);
    host.appendChild(card);
  }

  /* ---------- 뷰: 공지사항 (notice) — 정적 공지 하드코딩 ---------- */
  var NOTICES = [
    {
      tag: '점검',
      date: '2026.07.20',
      title: '시스템 정기 점검 안내',
      body: '보다 안정적인 서비스 제공을 위해 2026년 8월 2일(일) 02:00~06:00에 시스템 정기 점검이 진행됩니다. 점검 시간 동안 진료 예약·서류 발급 등 일부 서비스 이용이 제한될 수 있으니 양해 부탁드립니다.'
    },
    {
      tag: '안내',
      date: '2026.07.10',
      title: 'Basil Nexus 이용 안내',
      body: '진료 예약, 진료 기록·검사 결과 조회, 서류 발급 신청, 수납까지 좌측 메뉴에서 24시간 이용하실 수 있습니다. 이용 중 궁금한 점은 고객센터(1661-XXXX, 평일 09:00~18:00)로 문의해 주세요.'
    },
    {
      tag: '안내',
      date: '2026.07.01',
      title: '개인정보 처리방침 개정 안내',
      body: '2026년 7월 1일부로 개인정보 처리방침이 일부 개정되었습니다. 자세한 내용은 페이지 하단의 개인정보처리방침에서 확인하실 수 있습니다.'
    }
  ];

  function renderNoticeView(host) {
    host.textContent = '';
    host.appendChild(viewHead('공지사항', 'Basil Nexus 서비스 관련 소식을 안내해 드립니다.'));
    var card = el('div', 'card v-card');
    NOTICES.forEach(function (n) {
      var row = el('div', 'ntc-row');
      var h = el('h3');
      h.appendChild(badge(n.tag === '점검' ? 'r' : 'g', n.tag));
      h.appendChild(document.createTextNode(n.title));
      h.appendChild(el('span', 'ntc-date', n.date));
      row.appendChild(h);
      row.appendChild(el('p', null, n.body));
      card.appendChild(row);
    });
    host.appendChild(card);
  }

  /* ---------- 라우팅 ---------- */
  var VIEW_RENDERERS = {
    appt: renderApptView,
    records: renderRecordsView,
    labs: renderLabsView,
    meds: renderMedsView,
    docs: renderDocsView,
    bills: renderBillsView,
    health: renderHealthView,
    family: renderFamilyView,
    notice: renderNoticeView
  };

  function parseHash() {
    var h = (window.location.hash || '').replace(/^#/, '');
    if (h.indexOf('view-') === 0) h = h.slice(5);
    else h = '';
    return VIEWS.indexOf(h) >= 0 ? h : 'home'; // 해시 없거나 미지정이면 home
  }

  function showView(name) {
    if (!viewHost) return;
    currentView = name;
    // 사이드바 .nav-i.on 동기화
    $all('.sb-nav .nav-i').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-view') === name);
    });
    if (name === 'home') {
      // 홈 = 기존 P4 대시보드 콘텐츠 복원
      homeChildren.forEach(function (n) { n.style.display = ''; });
      viewHost.style.display = 'none';
      viewHost.textContent = '';
    } else {
      homeChildren.forEach(function (n) { n.style.display = 'none'; });
      viewHost.style.display = 'block';
      var render = VIEW_RENDERERS[name];
      if (render) render(viewHost);
    }
  }

  function refreshActiveView() {
    if (currentView !== 'home' && viewHost && VIEW_RENDERERS[currentView]) {
      VIEW_RENDERERS[currentView](viewHost);
    }
  }

  function initViews() {
    var main = $('.main');
    if (!main) return;
    homeChildren = Array.prototype.slice.call(main.children); // viewHost 추가 전 기존 자식들
    viewHost = el('div');
    viewHost.id = 'viewHost';
    main.appendChild(viewHost);
    window.addEventListener('hashchange', function () { showView(parseHash()); });
    showView(parseHash()); // 새로고침 시에도 해시의 뷰 유지
  }

  /* ---------- 초기화 ---------- */
  function init() {
    loadDashboard();
    setupDocRequests();
    setupApptModal();
    initViews();
  }

  /* ---------- 알림 벨 드롭다운 (rail-top) ---------- */
  var bellItems = [];
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
        row.addEventListener('click', function () { closeBell(); if (it.h) location.hash = it.h; });
        panel.appendChild(row);
      });
      wrap.appendChild(panel);
    });
    document.addEventListener('click', function (e) { if (panel && !panel.contains(e.target)) closeBell(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeBell(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); initBell(); });
  else { init(); initBell(); }
})();
