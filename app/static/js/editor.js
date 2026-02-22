/* editor.js — Enhanced CodeMirror + snippet manager + run history */
(function () {
  'use strict';

  // ── Initialize CodeMirror ─────────────────────────────────────────────────
  const cm = CodeMirror.fromTextArea(document.getElementById('code'), {
    mode: 'python',
    theme: 'dracula',
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    autoCloseBrackets: true,
    matchBrackets: true,
    styleActiveLine: true,
    extraKeys: {
      Tab: function (cm) {
        if (cm.somethingSelected()) cm.indentSelection('add');
        else cm.replaceSelection('    ', 'end');
      },
      'Ctrl-Enter': runCode,
      'Cmd-Enter': runCode,
      'Ctrl-S': saveCurrentSnippet,
    },
  });

  // Cursor position indicator
  const cursorPos = document.getElementById('cursor-pos');
  if (cursorPos) {
    cm.on('cursorActivity', () => {
      const c = cm.getCursor();
      cursorPos.textContent = `${c.line + 1}:${c.ch + 1}`;
    });
  }

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const runBtn        = document.getElementById('run-btn');
  const clearBtn      = document.getElementById('clear-btn');
  const clearOutBtn   = document.getElementById('clear-output-btn');
  const copyBtn       = document.getElementById('copy-btn');
  const stdinEl       = document.getElementById('stdin');
  const outputEl      = document.getElementById('output');
  const exitBadge     = document.getElementById('exit-badge');
  const runStatus     = document.getElementById('run-status');
  const runTime       = document.getElementById('run-time');
  const themeSelect   = document.getElementById('theme-select');
  const snippetNameEl = document.getElementById('current-snippet-name');

  // Snippet modal
  const saveSnippetBtn = document.getElementById('save-snippet-btn');
  const newSnippetBtn  = document.getElementById('new-snippet-btn');
  const modalSnippetId = document.getElementById('modal-snippet-id');
  const modalTitle     = document.getElementById('modal-snippet-title');
  const modalError     = document.getElementById('modal-error');
  const modalSaveBtn   = document.getElementById('modal-save-btn');
  const snippetModalEl = document.getElementById('saveSnippetModal');
  const snippetModal   = snippetModalEl ? new bootstrap.Modal(snippetModalEl) : null;
  const snippetsToggle = document.getElementById('snippets-toggle');
  const editorSidebar  = document.getElementById('editor-sidebar');

  let currentSnippetId = null;

  // ── Load from session storage (dashboard redirect) ────────────────────────
  const savedCode = sessionStorage.getItem('loadCode');
  if (savedCode) {
    cm.setValue(savedCode);
    const savedStdin = sessionStorage.getItem('loadStdin');
    if (savedStdin && stdinEl) stdinEl.value = savedStdin;
    sessionStorage.removeItem('loadCode');
    sessionStorage.removeItem('loadStdin');
  }

  // ── Theme switcher ────────────────────────────────────────────────────────
  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      cm.setOption('theme', themeSelect.value);
      localStorage.setItem('editor-theme', themeSelect.value);
    });
    const savedTheme = localStorage.getItem('editor-theme');
    if (savedTheme) { themeSelect.value = savedTheme; cm.setOption('theme', savedTheme); }
  }

  // ── SocketIO connection for interactive code execution ───────────────────
  const socket = io('/editor', { transports: ['websocket', 'polling'] });
  let codeRunning = false;
  let runStartTime = null;

  const interactiveInput = document.getElementById('interactive-input');
  const codeStdin        = document.getElementById('code-stdin');
  const sendInputBtn     = document.getElementById('send-input-btn');

  socket.on('code_output', function (data) {
    // Append output text in real time
    if (outputEl.textContent === '(nothing to run)' || outputEl.querySelector('strong')) {
      outputEl.innerHTML = '';
    }
    outputEl.textContent += data.data;
    outputEl.scrollTop = outputEl.scrollHeight;
  });

  socket.on('code_done', function (data) {
    codeRunning = false;
    setRunning(false);
    if (interactiveInput) interactiveInput.classList.add('d-none');

    const exitCode = data.exit_code;
    const elapsed = runStartTime ? Date.now() - runStartTime : null;

    if (exitBadge) {
      exitBadge.classList.remove('d-none', 'bg-success', 'bg-danger', 'bg-warning');
      if (exitCode === 0) {
        exitBadge.className = 'badge bg-success rounded-pill';
        exitBadge.textContent = '✓ exit 0';
      } else if (exitCode === -1) {
        exitBadge.className = 'badge bg-warning text-dark rounded-pill';
        exitBadge.textContent = '⏱ timeout';
      } else {
        exitBadge.className = 'badge bg-danger rounded-pill';
        exitBadge.textContent = '✗ exit ' + exitCode;
      }
    }

    if (runTime && elapsed) {
      runTime.textContent = elapsed + 'ms';
      runTime.classList.remove('d-none');
    }
  });

  function sendStdinInput() {
    if (!codeRunning || !codeStdin) return;
    const text = codeStdin.value;
    socket.emit('code_input', { data: text + '\n' });
    codeStdin.value = '';
    codeStdin.focus();
  }

  if (sendInputBtn) sendInputBtn.addEventListener('click', sendStdinInput);
  if (codeStdin) {
    codeStdin.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendStdinInput();
      }
    });
  }

  // ── Run code ──────────────────────────────────────────────────────────────
  function setRunning(state) {
    runBtn.disabled = state;
    runBtn.innerHTML = state
      ? '<span class="spinner-border spinner-border-sm me-1"></span>Running…'
      : '<i class="bi bi-play-fill me-1"></i>Run';
    if (runStatus) runStatus.textContent = state ? 'Executing…' : '';
  }

  function runCode() {
    const code = cm.getValue();

    if (!code.trim()) {
      outputEl.textContent = '(nothing to run)';
      return;
    }

    codeRunning = true;
    runStartTime = Date.now();
    setRunning(true);
    outputEl.innerHTML = '';
    outputEl.classList.remove('has-error');
    if (exitBadge) exitBadge.classList.add('d-none');
    if (runTime) runTime.classList.add('d-none');

    // Show interactive input area
    if (interactiveInput) interactiveInput.classList.remove('d-none');
    if (codeStdin) {
      codeStdin.value = '';
      codeStdin.focus();
    }

    socket.emit('run_code', { code: code });

    // If there's pre-entered stdin, send it as initial input
    const preStdin = stdinEl ? stdinEl.value : '';
    if (preStdin) {
      socket.emit('code_input', { data: preStdin + '\n' });
    }
  }

  // ── Snippet management ────────────────────────────────────────────────────
  function openSaveModal(id, title) {
    if (!snippetModal) return;
    modalSnippetId.value = id || '';
    modalTitle.value = title || '';
    modalError.classList.add('d-none');
    snippetModal.show();
    setTimeout(() => modalTitle.focus(), 300);
  }

  function saveCurrentSnippet() {
    const name = snippetNameEl ? snippetNameEl.textContent.replace('.py', '') : '';
    openSaveModal(currentSnippetId, name === 'main' ? '' : name);
  }

  if (saveSnippetBtn) saveSnippetBtn.addEventListener('click', (e) => { e.preventDefault(); saveCurrentSnippet(); });
  if (newSnippetBtn)  newSnippetBtn.addEventListener('click',  () => openSaveModal(null, ''));

  if (modalSaveBtn) {
    modalSaveBtn.addEventListener('click', () => {
      const title = modalTitle.value.trim();
      if (!title) {
        modalError.textContent = 'Please enter a name.';
        modalError.classList.remove('d-none');
        return;
      }
      modalSaveBtn.disabled = true;
      modalSaveBtn.textContent = 'Saving…';

      fetch('/editor/snippets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: modalSnippetId.value || null,
          title: title,
          code: cm.getValue(),
        }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.error) {
            modalError.textContent = data.error;
            modalError.classList.remove('d-none');
          } else {
            currentSnippetId = data.id;
            if (snippetNameEl) snippetNameEl.textContent = title + '.py';
            snippetModal.hide();
            refreshSnippetList();
          }
        })
        .catch(err => {
          modalError.textContent = `Error: ${err.message}`;
          modalError.classList.remove('d-none');
        })
        .finally(() => {
          modalSaveBtn.disabled = false;
          modalSaveBtn.innerHTML = '<i class="bi bi-bookmark-check me-1"></i>Save';
        });
    });
  }

  function escHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function refreshSnippetList() {
    fetch('/editor/snippets')
      .then(r => r.json())
      .then(snippets => {
        const list = document.getElementById('snippet-list');
        if (!list) return;
        if (snippets.length === 0) {
          list.innerHTML = '<div class="text-secondary text-center py-4 small"><i class="bi bi-bookmark fs-3 d-block mb-1 opacity-25"></i>No snippets yet.</div>';
          return;
        }
        list.innerHTML = snippets.map(s => `
          <div class="snippet-item rounded px-2 py-1 d-flex align-items-center justify-content-between" data-id="${s.id}">
            <span class="small text-truncate text-light" style="max-width:160px">
              <i class="bi bi-file-earmark-code me-1 text-success opacity-75"></i>${escHtml(s.title)}
            </span>
            <div class="d-flex gap-1">
              <button class="btn btn-sm py-0 px-1 btn-outline-secondary load-snippet" data-id="${s.id}" title="Load">
                <i class="bi bi-arrow-up-right" style="font-size:.7rem"></i>
              </button>
              <button class="btn btn-sm py-0 px-1 btn-outline-danger delete-snippet" data-id="${s.id}" title="Delete">
                <i class="bi bi-trash" style="font-size:.7rem"></i>
              </button>
            </div>
          </div>`).join('');
        attachSnippetListeners();
      })
      .catch(() => {});
  }

  function attachSnippetListeners() {
    document.querySelectorAll('.load-snippet').forEach(btn => {
      btn.addEventListener('click', () => {
        fetch(`/editor/snippets/${btn.dataset.id}`)
          .then(r => r.json())
          .then(data => {
            cm.setValue(data.code);
            currentSnippetId = data.id;
            if (snippetNameEl) snippetNameEl.textContent = data.title + '.py';
            cm.focus();
          });
      });
    });

    document.querySelectorAll('.delete-snippet').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this snippet?')) return;
        fetch(`/editor/snippets/${btn.dataset.id}`, { method: 'DELETE' })
          .then(() => refreshSnippetList());
      });
    });
  }

  attachSnippetListeners();

  // Load history items
  document.querySelectorAll('.load-history').forEach(el => {
    el.addEventListener('click', () => {
      fetch(`/editor/history/${el.dataset.id}`)
        .then(r => r.json())
        .then(data => {
          cm.setValue(data.code);
          if (stdinEl) stdinEl.value = data.stdin || '';
          if (snippetNameEl) snippetNameEl.textContent = 'main.py';
          currentSnippetId = null;
          cm.focus();
        });
    });
  });

  // Sidebar toggle (mobile)
  if (snippetsToggle && editorSidebar) {
    snippetsToggle.addEventListener('click', () => {
      editorSidebar.classList.toggle('show');
    });
    // Close sidebar when clicking outside
    document.addEventListener('click', (e) => {
      if (!editorSidebar.contains(e.target) && e.target !== snippetsToggle) {
        editorSidebar.classList.remove('show');
      }
    });
  }

  // ── Button listeners ──────────────────────────────────────────────────────
  if (runBtn) runBtn.addEventListener('click', runCode);

  if (clearBtn) clearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    cm.setValue('');
    currentSnippetId = null;
    if (snippetNameEl) snippetNameEl.textContent = 'main.py';
    cm.focus();
  });

  if (clearOutBtn) clearOutBtn.addEventListener('click', () => {
    if (codeRunning) {
      socket.emit('stop_code');
      codeRunning = false;
      setRunning(false);
    }
    outputEl.textContent = '';
    outputEl.classList.remove('has-error');
    if (exitBadge) exitBadge.classList.add('d-none');
    if (runTime) runTime.classList.add('d-none');
    if (interactiveInput) interactiveInput.classList.add('d-none');
  });

  if (copyBtn) copyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    navigator.clipboard.writeText(cm.getValue()).then(() => {
      copyBtn.innerHTML = '<i class="bi bi-clipboard-check me-2 text-success"></i>Copied!';
      setTimeout(() => { copyBtn.innerHTML = '<i class="bi bi-clipboard me-2"></i>Copy Code'; }, 1500);
    });
  });
})();
