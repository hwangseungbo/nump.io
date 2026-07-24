/* ============================================================
   Basil Nexus — 환자 대시보드 (P4)
   - GET /api/dashboard/patient 1회 수신 후 각 패널 렌더링
   - POST /api/documents 로 서류 발급 신청 (.doc-c 카드 클릭)
   - POST /api/appointments 로 진료 예약 신청 (미니 모달)
   - fetch 실패/404 시 정적 목업 내용 유지 + console.warn
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

  function setupDocsHistory() {
    var link = $('#bnDocsHist');
    if (!link) return;
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var list = ensureDocsList();
      if (!list) return;
      if (list.classList.contains('open')) { list.classList.remove('open'); return; }
      renderDocsList();
      list.classList.add('open');
    });
  }

  /* ---------- 서류 발급 신청 (POST /api/documents) ---------- */
  function setupDocRequests() {
    var docsCard = $('#bnDocsCard');
    if (!docsCard) return;
    $all('.docs .doc-c', docsCard).forEach(function (cardEl) {
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
        }).catch(function (err) {
          console.warn('[patient] POST /api/documents 실패:', err.message);
          toast('서버에 연결할 수 없습니다', true);
        });
      });
    });
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

      submit.disabled = true;
      fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: date, time: time, kind: kind })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          return { ok: r.ok, status: r.status, body: j };
        });
      }).then(function (res) {
        submit.disabled = false;
        if (!res.ok) {
          console.warn('[patient] POST /api/appointments ' + res.status);
          if (res.status === 400) showErr('과거 날짜이거나 입력 형식이 올바르지 않습니다.');
          else if (res.status === 401) showErr('로그인이 필요합니다.');
          else showErr('서버 오류로 예약을 신청하지 못했습니다 (' + res.status + ')');
          return;
        }
        close();
        toast('예약이 신청되었습니다');
        loadDashboard(); // 일정 패널 갱신
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

  function setupApptModal() {
    var btn = $('#bnApptBtn');
    if (!btn) return;
    var modal = null;
    btn.addEventListener('click', function () {
      if (!modal) modal = buildApptModal();
      modal.open();
    });
  }

  /* ---------- 대시보드 렌더 ---------- */
  function renderDashboard(d) {
    renderSchedule(d);
    renderEncounters(d.encounters);
    renderMeds(d.meds);
    renderProfile(d.profile);
    renderBills(d.bills);
    renderHealth(d.health);
    renderBadge(d.alertCount);
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

  /* ---------- 초기화 ---------- */
  function init() {
    loadDashboard();
    setupDocsHistory();
    setupDocRequests();
    setupApptModal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
