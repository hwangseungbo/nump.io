/* ============================================================
   Basil Nexus — 역할 대시보드 공통 인증/개인화 (P2)
   - /api/me 로 로그인 확인 (실패 시 로그인 페이지로)
   - 사이드바 프로필·인사말을 DB의 실제 이름/소속으로 교체
   - 우측 상단에 로그아웃 버튼 추가
   ============================================================ */
(function () {
  var role = document.body.getAttribute('data-role');

  fetch('/api/me').then(function (r) {
    if (r.status === 401) { location.href = '../login.html'; return null; }
    return r.ok ? r.json() : null;
  }).then(function (me) {
    if (!me) return;
    // 역할 불일치(admin 제외)면 자기 페이지로
    if (me.role !== role && me.role !== 'admin') {
      var home = { doctor: '../doctor/', nurse: '../nurse/', patient: '../patient/', admin: '../admin/' };
      location.href = home[me.role] || '../../index.html';
      return;
    }
    personalize(me);
    addLogout();
  }).catch(function () { /* 서버 미가동 시 데모 데이터 그대로 표시 */ });

  function displayName(me) {
    var p = me.profile || {};
    if (role === 'doctor')  return me.name + ' ' + (p.title || '원장') + '님';
    if (role === 'nurse')   return me.name + ' ' + (p.title || '간호사');
    return me.name + '님';
  }
  function subLine(me) {
    var p = me.profile || {};
    if (role === 'doctor') return p.department || '';
    if (role === 'nurse')  return p.ward || '';
    if (p.birth_date) {
      var age = '';
      try {
        var b = new Date(p.birth_date);
        var a = Math.floor((Date.now() - b.getTime()) / 3.15576e10);
        age = ' (만 ' + a + '세)';
      } catch (e) {}
      return String(p.birth_date).replace(/-/g, '.') + age;
    }
    return '';
  }

  function personalize(me) {
    var p = me.profile || {};
    // 사이드바 프로필
    var pn = document.querySelector('.sb-profile .pn');
    if (pn) pn.textContent = displayName(me);
    var pms = document.querySelectorAll('.sb-profile .pm');
    var sub = subLine(me);
    if (pms[0] && sub) pms[0].textContent = sub;
    if (role === 'patient' && pms[1] && p.phone) pms[1].textContent = p.phone;
    // 인사말
    var em = document.querySelector('.hello em');
    if (em) em.textContent = displayName(me);
  }

  function confirmLogout(onYes) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,30,20,.45);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;';
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.25);padding:26px 24px 20px;width:100%;max-width:320px;text-align:center;font-family:inherit;';
    card.innerHTML = '<div style="font-size:16px;font-weight:800;color:#1f2d27;margin-bottom:8px;">로그아웃</div>'
      + '<div style="font-size:13.5px;color:#5f7468;margin-bottom:20px;">정말 로그아웃하시겠습니까?</div>';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;';
    var no = document.createElement('button');
    no.textContent = '취소';
    no.style.cssText = 'flex:1;border:1px solid #e6ece6;background:#f6f9f6;color:#3c5a47;font-family:inherit;font-size:13.5px;font-weight:700;padding:11px 0;border-radius:11px;cursor:pointer;';
    var yes = document.createElement('button');
    yes.textContent = '로그아웃';
    yes.style.cssText = 'flex:1;border:none;background:linear-gradient(135deg,var(--accent,#4aab61),var(--accent-d,#2f8347));color:#fff;font-family:inherit;font-size:13.5px;font-weight:700;padding:11px 0;border-radius:11px;cursor:pointer;';
    function close() { document.removeEventListener('keydown', onKey); ov.remove(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    no.addEventListener('click', close);
    yes.addEventListener('click', function () { close(); onYes(); });
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey);
    row.appendChild(no); row.appendChild(yes);
    card.appendChild(row); ov.appendChild(card);
    document.body.appendChild(ov);
    no.focus();
  }

  function addLogout() {
    var top = document.querySelector('.rail-top');
    if (!top) return;
    var b = document.createElement('button');
    b.className = 'icon-btn';
    b.title = '로그아웃';
    b.setAttribute('aria-label', '로그아웃');
    // M1: 아이콘만으로는 발견성이 낮아 텍스트 라벨 병기 (icon-btn 고정폭을 인라인으로 해제)
    b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg><span>로그아웃</span>';
    b.style.cssText = 'width:auto;padding:0 12px;display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:11.5px;font-weight:600;color:var(--ink-2,#444);';
    b.addEventListener('click', function () {
      confirmLogout(function () {
        fetch('/api/logout', { method: 'POST' }).then(function () { location.href = '../../index.html'; });
      });
    });
    top.insertBefore(b, top.firstChild);
  }
})();
