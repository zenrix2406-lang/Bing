/* editor.js — CodeMirror setup + run-code handler */

(function () {
  'use strict';

  // ── Initialize CodeMirror ──────────────────────────────────────────────────
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
        if (cm.somethingSelected()) {
          cm.indentSelection('add');
        } else {
          cm.replaceSelection('    ', 'end');
        }
      },
      'Ctrl-Enter': runCode,
      'Cmd-Enter': runCode,
    },
  });

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const runBtn       = document.getElementById('run-btn');
  const clearBtn     = document.getElementById('clear-btn');
  const clearOutBtn  = document.getElementById('clear-output-btn');
  const copyBtn      = document.getElementById('copy-btn');
  const stdinEl      = document.getElementById('stdin');
  const outputEl     = document.getElementById('output');
  const exitBadge    = document.getElementById('exit-badge');
  const runStatus    = document.getElementById('run-status');

  // ── Run code ──────────────────────────────────────────────────────────────
  function setRunning(state) {
    runBtn.disabled = state;
    runBtn.innerHTML = state
      ? '<span class="spinner-border spinner-border-sm me-1"></span>Running…'
      : '<i class="bi bi-play-fill me-1"></i>Run';
    runStatus.textContent = state ? 'Executing…' : '';
  }

  function showOutput(stdout, stderr, exitCode) {
    const text = [stdout, stderr].filter(Boolean).join('\n');
    outputEl.textContent = text || '(no output)';
    outputEl.classList.toggle('has-error', !!stderr);

    exitBadge.classList.remove('d-none', 'bg-success', 'bg-danger', 'bg-secondary');
    if (exitCode === 0) {
      exitBadge.className = 'badge bg-success';
      exitBadge.textContent = 'exit 0';
    } else if (exitCode === -1) {
      exitBadge.className = 'badge bg-secondary';
      exitBadge.textContent = 'timeout';
    } else {
      exitBadge.className = 'badge bg-danger';
      exitBadge.textContent = `exit ${exitCode}`;
    }
  }

  function runCode() {
    const code  = cm.getValue();
    const stdin = stdinEl.value;

    if (!code.trim()) {
      outputEl.textContent = '(nothing to run)';
      return;
    }

    setRunning(true);
    outputEl.textContent = '';
    exitBadge.classList.add('d-none');

    fetch('/editor/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, stdin }),
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data.error) {
          outputEl.textContent = data.error;
          outputEl.classList.add('has-error');
        } else {
          showOutput(data.stdout, data.stderr, data.exit_code);
        }
      })
      .catch(err => {
        outputEl.textContent = `Network error: ${err.message}`;
        outputEl.classList.add('has-error');
      })
      .finally(() => setRunning(false));
  }

  // ── Button listeners ──────────────────────────────────────────────────────
  runBtn.addEventListener('click', runCode);

  clearBtn.addEventListener('click', () => {
    cm.setValue('');
    cm.focus();
  });

  clearOutBtn.addEventListener('click', () => {
    outputEl.textContent = '';
    outputEl.classList.remove('has-error');
    exitBadge.classList.add('d-none');
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(cm.getValue()).then(() => {
      copyBtn.innerHTML = '<i class="bi bi-clipboard-check"></i>';
      setTimeout(() => { copyBtn.innerHTML = '<i class="bi bi-clipboard"></i>'; }, 1500);
    });
  });
})();
