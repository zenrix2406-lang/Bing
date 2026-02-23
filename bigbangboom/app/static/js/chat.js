/* chat.js — BigBangBoom AI chat interactions (streaming) */

(function () {
  'use strict';

  const SESSION_ID  = window.BBB_SESSION_ID;
  const STREAM_URL  = `/chat/session/${SESSION_ID}/stream`;

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

  // ── Build a finished chat bubble ─────────────────────────────────────────
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
      wrapper.appendChild(bubble);
      wrapper.insertAdjacentHTML('beforeend',
        `<div class="ms-2 flex-shrink-0">
           <div class="bbb-msg-avatar bbb-msg-avatar-user" id="user-initials"></div>
         </div>`
      );
      const avatarEl = document.querySelector('.bbb-avatar');
      if (avatarEl) {
        wrapper.querySelector('#user-initials').textContent = avatarEl.textContent.trim();
      }
    } else {
      wrapper.insertAdjacentHTML('afterbegin',
        `<div class="me-2 flex-shrink-0">
           <div class="bbb-msg-avatar bbb-msg-avatar-bot">💥</div>
         </div>`
      );
      wrapper.appendChild(bubble);
    }

    return wrapper;
  }

  // ── Build an empty streaming bot bubble ──────────────────────────────────
  function buildStreamBubble() {
    const wrapper = document.createElement('div');
    wrapper.className = 'd-flex mb-3 justify-content-start';
    wrapper.insertAdjacentHTML('afterbegin',
      `<div class="me-2 flex-shrink-0">
         <div class="bbb-msg-avatar bbb-msg-avatar-bot">💥</div>
       </div>`
    );

    const bubble = document.createElement('div');
    bubble.className = 'bbb-bubble bbb-bubble-bot';

    const contentEl = document.createElement('div');
    contentEl.className = 'bbb-msg-content bbb-streaming';

    const timeEl = document.createElement('div');
    timeEl.className = 'bbb-msg-time';

    bubble.appendChild(contentEl);
    bubble.appendChild(timeEl);
    wrapper.appendChild(bubble);

    return { wrapper, contentEl, timeEl };
  }

  // ── Remove empty-state banner ─────────────────────────────────────────────
  function removeEmptyState() {
    const el = document.getElementById('bbb-empty-state');
    if (el) el.remove();
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

  // ── Send message with streaming ───────────────────────────────────────────
  async function sendMessage() {
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

    // Place an empty bot bubble — text fills in as chunks arrive
    const { wrapper: botWrapper, contentEl: botContentEl, timeEl: botTimeEl } =
      buildStreamBubble();
    messagesEl.insertBefore(botWrapper, document.getElementById('bbb-bottom'));
    scrollToBottom();

    let fullText = '';
    let hadError = false;

    try {
      const response = await fetch(STREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData.error) errMsg = errData.error;
        } catch (_) { /* ignore */ }
        throw new Error(errMsg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // SSE events are separated by double newlines
        const parts = buffer.split('\n\n');
        buffer = parts.pop(); // keep incomplete trailing part

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed.startsWith('data: ')) continue;
          let evt;
          // Incomplete or keep-alive SSE lines may not be valid JSON — skip silently
          try { evt = JSON.parse(trimmed.slice(6)); } catch (_) { continue; }

          if (evt.error) {
            hadError = true;
            botWrapper.remove();
            showError(evt.error);
            streamDone = true;
            break;
          }
          if (evt.chunk) {
            fullText += evt.chunk;
            // Fast raw-text update during streaming (avoid expensive HTML parse on every chunk)
            botContentEl.textContent = fullText;
            scrollToBottom();
          }
          if (evt.done) {
            // Full markdown render once generation is complete
            botContentEl.classList.remove('bbb-streaming');
            botContentEl.innerHTML = renderContent(fullText);
            botTimeEl.textContent = new Date().toTimeString().slice(0, 5);
            scrollToBottom();
            streamDone = true;
          }
        }
      }
    } catch (err) {
      if (!hadError) {
        botWrapper.remove();
        showError(`Network error: ${err.message}`);
      }
    } finally {
      setSending(false);
    }
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
