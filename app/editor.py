import subprocess
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required

editor_bp = Blueprint('editor', __name__, url_prefix='/editor')

TIMEOUT_SECONDS = 10


@editor_bp.route('/')
@login_required
def index():
    return render_template('editor/index.html')


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

    try:
        result = subprocess.run(
            ['python3', '-c', code],
            input=stdin_data,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
            # No shell=True — prevents shell injection
        )
        return jsonify({
            'stdout': result.stdout,
            'stderr': result.stderr,
            'exit_code': result.returncode,
        })
    except subprocess.TimeoutExpired:
        return jsonify({
            'stdout': '',
            'stderr': f'Execution timed out after {TIMEOUT_SECONDS} seconds.',
            'exit_code': -1,
        })
    except Exception as exc:
        return jsonify({
            'stdout': '',
            'stderr': f'Server error: {exc}',
            'exit_code': -1,
        })
