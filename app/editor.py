import os
import subprocess
import sys
import tempfile
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from . import db
from .models import CodeSnippet, RunHistory

editor_bp = Blueprint('editor', __name__, url_prefix='/editor')

TIMEOUT_SECONDS = 15
MAX_HISTORY = 20
MAX_CODE_STORE = 4000
MAX_STDIN_STORE = 500
MAX_STDOUT_STORE = 4000
MAX_STDERR_STORE = 2000


@editor_bp.route('/')
@login_required
def index():
    snippets = CodeSnippet.query.filter_by(user_id=current_user.id).order_by(
        CodeSnippet.updated_at.desc()).limit(50).all()
    history = RunHistory.query.filter_by(user_id=current_user.id).order_by(
        RunHistory.ran_at.desc()).limit(MAX_HISTORY).all()
    python_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    return render_template('editor/index.html', snippets=snippets, history=history,
                           python_version=python_version)


@editor_bp.route('/run', methods=['POST'])
@login_required
def run_code():
    data = request.get_json(force=True, silent=True) or {}
    code = data.get('code', '')
    stdin_data = data.get('stdin', '')

    if not isinstance(code, str) or not isinstance(stdin_data, str):
        return jsonify({'error': 'Invalid input.'}), 400

    if not code.strip():
        return jsonify({'stdout': '', 'stderr': '', 'exit_code': 0})

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as f:
            f.write(code)
            tmp_path = f.name
        import stat
        os.chmod(tmp_path, stat.S_IRUSR | stat.S_IWUSR)  # 0o600 — owner read/write only

        result = subprocess.run(
            [sys.executable, tmp_path],
            input=stdin_data,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
        )
        stdout = result.stdout
        stderr = result.stderr
        exit_code = result.returncode

        # Replace the temp file path in tracebacks with "main.py"
        if tmp_path and tmp_path in stderr:
            stderr = stderr.replace(tmp_path, 'main.py')

    except subprocess.TimeoutExpired:
        stdout = ''
        stderr = (
            f'⏱ Execution timed out after {TIMEOUT_SECONDS} seconds.\n\n'
            'Tip: avoid infinite loops or use shorter computations.'
        )
        exit_code = -1
    except Exception as exc:
        stdout = ''
        stderr = f'Server error: {exc}'
        exit_code = -1
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    # Hint for missing stdin when input() raises EOFError
    if 'EOFError: EOF when reading a line' in stderr and not stdin_data.strip():
        stderr += (
            '\n\n💡 Hint: Your code calls input() but no stdin was provided.\n'
            'Enter each input on a separate line in the "Standard Input" box before running.'
        )

    # Save to run history
    try:
        hist = RunHistory(
            user_id=current_user.id,
            code=code[:MAX_CODE_STORE],
            stdin=stdin_data[:MAX_STDIN_STORE] if stdin_data else None,
            stdout=stdout[:MAX_STDOUT_STORE] if stdout else None,
            stderr=stderr[:MAX_STDERR_STORE] if stderr else None,
            exit_code=exit_code,
        )
        db.session.add(hist)
        # Keep only last MAX_HISTORY runs per user
        old = RunHistory.query.filter_by(user_id=current_user.id).order_by(
            RunHistory.ran_at.desc()).offset(MAX_HISTORY).all()
        for o in old:
            db.session.delete(o)
        db.session.commit()
    except Exception:
        db.session.rollback()

    return jsonify({'stdout': stdout, 'stderr': stderr, 'exit_code': exit_code})


# ── Snippet endpoints ──────────────────────────────────────────────────────────

@editor_bp.route('/snippets', methods=['GET'])
@login_required
def list_snippets():
    snippets = CodeSnippet.query.filter_by(user_id=current_user.id).order_by(
        CodeSnippet.updated_at.desc()).all()
    return jsonify([
        {'id': s.id, 'title': s.title, 'language': s.language,
         'created_at': s.created_at.isoformat()}
        for s in snippets
    ])


@editor_bp.route('/snippets', methods=['POST'])
@login_required
def save_snippet():
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get('title') or '').strip()[:120]
    code = data.get('code', '')
    snippet_id = data.get('id')

    if not title:
        return jsonify({'error': 'Title is required.'}), 400
    if not isinstance(code, str):
        return jsonify({'error': 'Invalid code.'}), 400

    if snippet_id:
        snippet = CodeSnippet.query.filter_by(id=snippet_id, user_id=current_user.id).first()
        if not snippet:
            return jsonify({'error': 'Snippet not found.'}), 404
        snippet.title = title
        snippet.code = code
    else:
        snippet = CodeSnippet(user_id=current_user.id, title=title, code=code)
        db.session.add(snippet)

    db.session.commit()
    return jsonify({'id': snippet.id, 'title': snippet.title, 'message': 'Saved!'})


@editor_bp.route('/snippets/<int:snippet_id>', methods=['GET'])
@login_required
def get_snippet(snippet_id):
    snippet = CodeSnippet.query.filter_by(id=snippet_id, user_id=current_user.id).first_or_404()
    return jsonify({'id': snippet.id, 'title': snippet.title, 'code': snippet.code,
                    'language': snippet.language})


@editor_bp.route('/snippets/<int:snippet_id>', methods=['DELETE'])
@login_required
def delete_snippet(snippet_id):
    snippet = CodeSnippet.query.filter_by(id=snippet_id, user_id=current_user.id).first_or_404()
    db.session.delete(snippet)
    db.session.commit()
    return jsonify({'message': 'Deleted.'})


@editor_bp.route('/history/<int:history_id>', methods=['GET'])
@login_required
def get_history_item(history_id):
    item = RunHistory.query.filter_by(id=history_id, user_id=current_user.id).first_or_404()
    return jsonify({
        'id': item.id,
        'code': item.code,
        'stdin': item.stdin or '',
        'stdout': item.stdout or '',
        'stderr': item.stderr or '',
        'exit_code': item.exit_code,
        'ran_at': item.ran_at.isoformat(),
    })


@editor_bp.route('/packages')
@login_required
def packages():
    """List installed Python packages."""
    import importlib.metadata
    pkgs = []
    for dist in sorted(importlib.metadata.distributions(),
                       key=lambda d: d.metadata['Name'].lower()):
        pkgs.append({'name': dist.metadata['Name'], 'version': dist.metadata['Version']})
    return render_template('editor/packages.html', packages=pkgs)
