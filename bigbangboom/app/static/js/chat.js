/* chat.js — BigBangBoom AI chat interactions */

(function () {
  'use strict';

  const SESSION_ID  = window.BBB_SESSION_ID;
  const SEND_URL    = `/chat/session/${SESSION_ID}/send`;

  const messagesEl  = document.getElementById('bbb-messages');
  const inputEl     = document.getElementById('bbb-input');
  const sendBtn     = document.getElementById('bbb-send');
  const sendIcon    = document.getElementById('bbb-send-icon');
  const sendSpinner = document.getElementById('bbb-send-spinner');
  const errorEl     = document.getElementById('bbb-error');

  // ── Scroll to bottom ─────────────────────────────────────────────────────
  function scrollToBottom() {
    const bottom = document.getElementById('bbb-bottom');
    if (bottom) bottom.scrollIntoView({ behavior: 'smooth' });
  }

  // ── HTML escape ──────────────────────────────────────────────────────────
  function esc(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Basic markdown-ish rendering ──────────────────────────────────────────
  function renderContent(text) {
    // Fenced code blocks
    let out = esc(text).replace(
      /```(\w*)\n?([\s\S]*?)```/g,
      (_, _lang, code) => `<pre><code>${code.trimEnd()}</code></pre>`
    );
    // Inline code
    out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    // Bold
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Newlines → <br> (skip inside pre)
    out = out.replace(/(?<!<\/pre>)\n(?!<pre)/g, '<br>');
    return out;
  }

  // ── Build a chat bubble ───────────────────────────────────────────────────
  function buildBubble(role, content) {
    const isUser = role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `d-flex mb-3 ${isUser ? 'justify-content-end' : 'justify-content-start'}`;

    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);

    const bubble = document.createElement('div');
    bubble.className = `bbb-bubble ${isUser ? 'bbb-bubble-user' : 'bbb-bubble-bot'}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'bbb-msg-content';
    contentDiv.innerHTML = renderContent(content);

    const timeDiv = document.createElement('div');
    timeDiv.className = 'bbb-msg-time';
    timeDiv.textContent = timeStr;

    bubble.appendChild(contentDiv);
    bubble.appendChild(timeDiv);

    if (isUser) {
      // user: bubble left, avatar right
      wrapper.appendChild(bubble);
      wrapper.insertAdjacentHTML('beforeend',
        `<div class="ms-2 flex-shrink-0">
           <div class="bbb-msg-avatar bbb-msg-avatar-user" id="user-initials"></div>
         </div>`
      );
      // Fill initials from navbar if present
      const avatarEl = document.querySelector('.bbb-avatar');
      if (avatarEl) {
        wrapper.querySelector('#user-initials').textContent = avatarEl.textContent.trim();
      }
    } else {
      // bot: avatar left, bubble right
      wrapper.insertAdjacentHTML('afterbegin',
        `<div class="me-2 flex-shrink-0">
           <div class="bbb-msg-avatar bbb-msg-avatar-bot">💥</div>
         </div>`
      );
      wrapper.appendChild(bubble);
    }

    return wrapper;
  }

  // ── Remove empty-state banner ─────────────────────────────────────────────
  function removeEmptyState() {
    const el = document.getElementById('bbb-empty-state');
    if (el) el.remove();
  }

  // ── Typing indicator ──────────────────────────────────────────────────────
  let typingEl = null;

  function showTyping() {
    typingEl = document.createElement('div');
    typingEl.className = 'd-flex mb-3 justify-content-start';
    typingEl.id = 'bbb-typing';
    typingEl.innerHTML = `
      <div class="me-2 flex-shrink-0">
        <div class="bbb-msg-avatar bbb-msg-avatar-bot">💥</div>
      </div>
      <div class="bbb-bubble bbb-bubble-bot d-flex align-items-center gap-1">
        <span class="bbb-typing-dot"></span>
        <span class="bbb-typing-dot" style="animation-delay:.2s"></span>
        <span class="bbb-typing-dot" style="animation-delay:.4s"></span>
      </div>`;

    // inject keyframes once
    if (!document.getElementById('bbb-typing-style')) {
      const style = document.createElement('style');
      style.id = 'bbb-typing-style';
      style.textContent = `
        .bbb-typing-dot {
          width: 8px; height: 8px;
          background: var(--accent-2, #06b6d4);
          border-radius: 50%;
          display: inline-block;
          animation: bbb-bounce .9s ease-in-out infinite;
        }
        @keyframes bbb-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: .5; }
          40%            { transform: translateY(-6px); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    const bottom = document.getElementById('bbb-bottom');
    messagesEl.insertBefore(typingEl, bottom);
    scrollToBottom();
  }

  function hideTyping() {
    if (typingEl) { typingEl.remove(); typingEl = null; }
  }

  // ── Sending state ─────────────────────────────────────────────────────────
  function setSending(state) {
    sendBtn.disabled = state;
    inputEl.disabled = state;
    sendIcon.classList.toggle('d-none', state);
    sendSpinner.classList.toggle('d-none', !state);
  }

  // ── Error display ─────────────────────────────────────────────────────────
  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('d-none');
    setTimeout(() => errorEl.classList.add('d-none'), 9000);
  }

  // ── Send message ──────────────────────────────────────────────────────────
  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    errorEl.classList.add('d-none');
    removeEmptyState();

    const bottom = document.getElementById('bbb-bottom');
    messagesEl.insertBefore(buildBubble('user', text), bottom);
    scrollToBottom();

    inputEl.value = '';
    inputEl.style.height = 'auto';
    setSending(true);
    showTyping();

    fetch(SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
      .then(res => res.json().then(data => ({ status: res.status, data })))
      .then(({ data }) => {
        hideTyping();
        if (data.error) {
          showError(data.error);
        } else {
          const bottom2 = document.getElementById('bbb-bottom');
          messagesEl.insertBefore(buildBubble('assistant', data.reply), bottom2);
          scrollToBottom();
        }
      })
      .catch(err => {
        hideTyping();
        showError(`Network error: ${err.message}`);
      })
      .finally(() => setSending(false));
  }

  // ── Events ────────────────────────────────────────────────────────────────
  sendBtn.addEventListener('click', sendMessage);

  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  inputEl.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 160) + 'px';
  });

  // Auto-scroll on load
  scrollToBottom();
})();
