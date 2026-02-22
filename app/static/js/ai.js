/* ai.js — AI Chat UI: send messages, append bubbles, auto-scroll */

(function () {
  'use strict';

  const SESSION_ID    = window.AI_SESSION_ID;
  const sendUrl       = `/ai/session/${SESSION_ID}/send`;

  const messagesEl    = document.getElementById('chat-messages');
  const inputEl       = document.getElementById('message-input');
  const sendBtn       = document.getElementById('send-btn');
  const sendIcon      = document.getElementById('send-icon');
  const sendSpinner   = document.getElementById('send-spinner');
  const chatError     = document.getElementById('chat-error');

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  function scrollToBottom() {
    const bottom = document.getElementById('chat-bottom');
    if (bottom) bottom.scrollIntoView({ behavior: 'smooth' });
  }

  // ── Render content with basic markdown-like formatting ───────────────────
  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderContent(text) {
    // Fenced code blocks ```lang\n...\n```
    let rendered = escapeHtml(text).replace(
      /```(\w*)\n?([\s\S]*?)```/g,
      (_, lang, code) => `<pre><code>${code.trimEnd()}</code></pre>`
    );
    // Inline code `...`
    rendered = rendered.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold **...**
    rendered = rendered.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic *...*
    rendered = rendered.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Newlines → <br> (outside of pre blocks)
    rendered = rendered.replace(/(?<!<\/pre>)\n(?!<pre)/g, '<br>');
    return rendered;
  }

  // ── Build a bubble element ────────────────────────────────────────────────
  function buildBubble(role, content) {
    const isUser = role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `d-flex mb-3 ${isUser ? 'justify-content-end' : 'justify-content-start'}`;

    const avatarHtml = isUser
      ? `<div class="ms-2 flex-shrink-0">
           <div class="rounded-circle bg-primary d-flex align-items-center justify-content-center"
                style="width:32px;height:32px;">
             <i class="bi bi-person-fill text-white small"></i>
           </div>
         </div>`
      : `<div class="me-2 flex-shrink-0">
           <div class="rounded-circle bg-info d-flex align-items-center justify-content-center"
                style="width:32px;height:32px;">
             <i class="bi bi-robot text-dark small"></i>
           </div>
         </div>`;

    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);

    const bubbleClass = isUser ? 'chat-bubble-user' : 'chat-bubble-assistant';

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${bubbleClass}`;

    // Safely render content (escape HTML, then linkify newlines)
    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-content';
    contentDiv.innerHTML = renderContent(content);

    const timeDiv = document.createElement('div');
    timeDiv.className = 'chat-time text-secondary';
    timeDiv.style.fontSize = '0.7rem';
    timeDiv.textContent = timeStr;

    bubble.appendChild(contentDiv);
    bubble.appendChild(timeDiv);

    if (isUser) {
      wrapper.appendChild(bubble);
      wrapper.insertAdjacentHTML('beforeend', avatarHtml);
    } else {
      wrapper.insertAdjacentHTML('afterbegin', avatarHtml);
      wrapper.appendChild(bubble);
    }

    return wrapper;
  }

  // ── Remove empty-state placeholder ───────────────────────────────────────
  function removeEmptyState() {
    const placeholder = messagesEl.querySelector('.text-center.text-secondary');
    if (placeholder) placeholder.remove();
  }

  // ── Show / hide loading indicator ────────────────────────────────────────
  let typingEl = null;

  function showTyping() {
    typingEl = document.createElement('div');
    typingEl.className = 'd-flex mb-3 justify-content-start';
    typingEl.id = 'typing-indicator';
    typingEl.innerHTML = `
      <div class="me-2 flex-shrink-0">
        <div class="rounded-circle bg-info d-flex align-items-center justify-content-center"
             style="width:32px;height:32px;">
          <i class="bi bi-robot text-dark small"></i>
        </div>
      </div>
      <div class="chat-bubble chat-bubble-assistant">
        <span class="spinner-grow spinner-grow-sm me-1 text-secondary"></span>
        <span class="spinner-grow spinner-grow-sm me-1 text-secondary" style="animation-delay:.2s"></span>
        <span class="spinner-grow spinner-grow-sm text-secondary" style="animation-delay:.4s"></span>
      </div>`;
    const bottom = document.getElementById('chat-bottom');
    messagesEl.insertBefore(typingEl, bottom);
    scrollToBottom();
  }

  function hideTyping() {
    if (typingEl) {
      typingEl.remove();
      typingEl = null;
    }
  }

  // ── Set sending state ─────────────────────────────────────────────────────
  function setSending(state) {
    sendBtn.disabled = state;
    inputEl.disabled = state;
    sendIcon.classList.toggle('d-none', state);
    sendSpinner.classList.toggle('d-none', !state);
  }

  // ── Show error ────────────────────────────────────────────────────────────
  function showError(msg) {
    chatError.textContent = msg;
    chatError.classList.remove('d-none');
    setTimeout(() => chatError.classList.add('d-none'), 8000);
  }

  // ── Send message ──────────────────────────────────────────────────────────
  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    chatError.classList.add('d-none');
    removeEmptyState();

    // Append user bubble immediately
    const bottom = document.getElementById('chat-bottom');
    messagesEl.insertBefore(buildBubble('user', text), bottom);
    scrollToBottom();

    inputEl.value = '';
    setSending(true);
    showTyping();

    fetch(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
      .then(res => res.json().then(data => ({ status: res.status, data })))
      .then(({ status, data }) => {
        hideTyping();
        if (data.error) {
          showError(data.error);
        } else {
          const bottom2 = document.getElementById('chat-bottom');
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

  // ── Event listeners ───────────────────────────────────────────────────────
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

  // Scroll to bottom on initial load
  scrollToBottom();
})();
