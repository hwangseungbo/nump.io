/* ============================================================
   Basil Nexus AI — 역할 페이지 공통 챗 패널 동작
   입력창은 그대로 두고, 질문 시 서버 프록시(/api/medgemma-chat)로
   NUMP Medgemma 서비스에 전달 → 스트리밍 답변을 패널 아래에 표시.
   ============================================================ */
(function () {
  var box = document.querySelector('.ai-box');
  if (!box) return;
  var input = box.querySelector('.ai-field input');
  var sendBtn = box.querySelector('.ai-field .send');
  var chips = box.querySelectorAll('.chip');
  if (!input) return;

  // 대화 영역을 패널 '내부' 입력창 위에 생성 (ChatGPT 스타일)
  var chat = document.createElement('div');
  chat.className = 'ai-chat';
  var fieldEl = box.querySelector('.ai-field');
  if (fieldEl) box.insertBefore(chat, fieldEl); else box.appendChild(chat);
  var chipsWrap = box.querySelector('.chips');

  var history = [];
  var streaming = false;
  // NUMP 챗봇은 세션 기반(서버가 히스토리 관리). 페이지 단위로 고정 세션 ID 사용.
  var sessionId = 'bn-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function render(md) {
    try {
      if (window.marked && window.DOMPurify) return DOMPurify.sanitize(window.marked.parse(md));
    } catch (e) {}
    return escapeHtml(md).replace(/\n/g, '<br>');
  }
  function bubble(role, html) {
    var wrap = document.createElement('div');
    wrap.className = 'ai-msg ' + role;
    wrap.innerHTML = '<div class="ai-bubble">' + html + '</div>';
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
    return wrap.querySelector('.ai-bubble');
  }

  async function send(text) {
    text = (text || '').trim();
    if (!text || streaming) return;
    if (chipsWrap) chipsWrap.style.display = 'none'; // 대화 시작 시 추천칩 숨김
    box.classList.add('chatting');
    bubble('user', escapeHtml(text));
    history.push({ role: 'user', content: text });
    input.value = '';
    var ai = bubble('ai', '<span class="ai-dots"><i></i><i></i><i></i></span>');
    streaming = true;
    if (sendBtn) sendBtn.disabled = true;

    var raw = '';
    try {
      var resp = await fetch('/api/medgemma-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: text })
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
          try { d = JSON.parse(ev.slice(6)); } catch (e) { continue; }
          var piece = (d.delta != null) ? d.delta : d.content; // Medgemma=delta, NUMP챗봇=content
          if (piece) { raw += piece; ai.innerHTML = render(raw); chat.scrollTop = chat.scrollHeight; }
          if (d.error) { ai.innerHTML = '<em class="ai-err">⚠️ ' + escapeHtml(d.error) + '</em>'; }
        }
      }
      if (!raw && !ai.querySelector('.ai-err')) ai.innerHTML = '<em class="ai-err">응답이 없습니다.</em>';
    } catch (e) {
      ai.innerHTML = '<em class="ai-err">⚠️ ' + escapeHtml(e.message) + '</em>';
    }
    if (raw) history.push({ role: 'assistant', content: raw });
    streaming = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }

  if (sendBtn) sendBtn.addEventListener('click', function () { send(input.value); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
  });
  chips.forEach(function (c) {
    c.style.cursor = 'pointer';
    c.addEventListener('click', function () { send(c.textContent); });
  });
})();
