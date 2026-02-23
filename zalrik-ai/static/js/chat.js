/* Zalrik AI — Chat JavaScript */
(function () {
  'use strict';

  const messagesEl   = document.getElementById('chat-messages');
  const inputEl      = document.getElementById('message-input');
  const sendBtn      = document.getElementById('send-btn');
  const sendIcon     = document.getElementById('send-icon');
  const sendSpinner  = document.getElementById('send-spinner');
  const errorEl      = document.getElementById('chat-error');
  const typingEl     = document.getElementById('typing-indicator');
  const clearBtn     = document.getElementById('clear-chat-btn');
  const bottomEl     = document.getElementById('chat-bottom');

  // Scroll to bottom
  function scrollBottom() {
    if (bottomEl) bottomEl.scrollIntoView({ behavior: 'smooth' });
  }

  scrollBottom();

  // Build a bubble element
  function makeBubble(role, content, ts) {
    const isUser = role === 'user';
    const wrap = document.createElement('div');
    wrap.className = `d-flex mb-3 ${isUser ? 'justify-content-end' : 'justify-content-start'}`;

    const avatarHtml = isUser
      ? `<div class="ms-2 flex-shrink-0">
           <div class="zalrik-avatar-user rounded-circle d-flex align-items-center justify-content-center"
                style="width:34px;height:34px;">
             <i class="bi bi-person-fill text-white small"></i>
           </div>
         </div>`
      : `<div class="me-2 flex-shrink-0">
           <div class="zalrik-avatar-ai rounded-circle d-flex align-items-center justify-content-center"
                style="width:34px;height:34px;font-size:1.1rem;">🤖</div>
         </div>`;

    const tsHtml = ts ? `<div class="zalrik-msg-time">${ts}</div>` : '';

    const bubbleHtml = `<div class="zalrik-bubble ${isUser ? 'zalrik-bubble-user' : 'zalrik-bubble-ai'}">
      <div class="zalrik-msg-content">${escapeHtml(content)}</div>
      ${tsHtml}
    </div>`;

    wrap.innerHTML = isUser
      ? bubbleHtml + avatarHtml
      : avatarHtml + bubbleHtml;

    return wrap;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('d-none');
  }

  function clearError() {
    errorEl.textContent = '';
    errorEl.classList.add('d-none');
  }

  function setLoading(on) {
    sendBtn.disabled = on;
    inputEl.disabled = on;
    sendIcon.classList.toggle('d-none', on);
    sendSpinner.classList.toggle('d-none', !on);
    typingEl.classList.toggle('d-none', !on);
  }

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    clearError();

    // Remove empty state
    const emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.remove();

    // Append user bubble immediately
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messagesEl.insertBefore(makeBubble('user', text, now), bottomEl);
    inputEl.value = '';
    scrollBottom();

    setLoading(true);

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      const data = await resp.json();

      if (!resp.ok || data.error) {
        showError(data.error || `Error ${resp.status}`);
      } else {
        messagesEl.insertBefore(makeBubble('assistant', data.reply, data.ts || now), bottomEl);
        scrollBottom();
      }
    } catch (err) {
      showError('Network error — please try again.');
    } finally {
      setLoading(false);
      inputEl.focus();
    }
  }

  // Send on button click
  sendBtn.addEventListener('click', sendMessage);

  // Enter to send, Shift+Enter for newline
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Clear chat
  if (clearBtn) {
    clearBtn.addEventListener('click', async function () {
      if (!confirm('Clear all chat messages?')) return;
      await fetch('/api/clear_chat', { method: 'POST' });
      window.location.reload();
    });
  }
})();
