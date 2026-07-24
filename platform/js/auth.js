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

  function addLogout() {
    var top = document.querySelector('.rail-top');
    if (!top) return;
    var b = document.createElement('button');
    b.className = 'icon-btn';
    b.title = '로그아웃';
    b.setAttribute('aria-label', '로그아웃');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>';
    b.addEventListener('click', function () {
      fetch('/api/logout', { method: 'POST' }).then(function () { location.href = '../../index.html'; });
    });
    top.insertBefore(b, top.firstChild);
  }
})();
