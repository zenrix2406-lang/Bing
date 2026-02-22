"""
Web Terminal — xterm.js frontend + PTY backend via Flask-SocketIO.
Each authenticated user gets their own sandboxed shell session.
"""
import os
import threading
import ptyprocess
from flask import Blueprint, render_template, request, redirect, url_for
from flask_login import current_user
from flask_socketio import SocketIO, emit

terminal_bp = Blueprint('terminal', __name__, url_prefix='/terminal')

# socketio will be set by the app factory
socketio = None

PTY_READ_SIZE = 4096

# Active PTY sessions: { sid -> PtyProcess }
_sessions: dict = {}
_lock = threading.Lock()


def init_socketio(sio: SocketIO):
    global socketio
    socketio = sio
    _register_events(sio)


def _register_events(sio: SocketIO):

    @sio.on('connect', namespace='/terminal')
    def on_connect():
        if not current_user.is_authenticated:
            return False  # reject connection
        sid = request.sid

        env = os.environ.copy()
        env['TERM'] = 'xterm-256color'
        env['PS1'] = r'\u@pyhost:\w\$ '
        user_home = f'/tmp/pyhost_{current_user.id}'
        os.makedirs(user_home, mode=0o700, exist_ok=True)
        env['HOME'] = user_home
        env['USER'] = current_user.username
        env['LOGNAME'] = current_user.username

        try:
            proc = ptyprocess.PtyProcess.spawn(
                ['/bin/bash', '--norc', '--noprofile'],
                env=env,
                dimensions=(24, 80),
            )
        except Exception as e:
            emit('terminal_output', {'data': f'Error starting terminal: {e}\r\n'},
                 namespace='/terminal')
            return

        with _lock:
            _sessions[sid] = proc

        def reader():
            while True:
                try:
                    data = proc.read(PTY_READ_SIZE)
                    sio.emit('terminal_output',
                             {'data': data.decode('utf-8', errors='replace')},
                             to=sid, namespace='/terminal')
                except Exception:
                    break
            sio.emit('terminal_output', {'data': '\r\n[Session ended]\r\n'},
                     to=sid, namespace='/terminal')
            with _lock:
                _sessions.pop(sid, None)

        t = threading.Thread(target=reader, daemon=True)
        t.start()

    @sio.on('terminal_input', namespace='/terminal')
    def on_input(data):
        if not current_user.is_authenticated:
            return
        sid = request.sid
        with _lock:
            proc = _sessions.get(sid)
        if proc and proc.isalive():
            try:
                proc.write(data.get('data', '').encode('utf-8', errors='replace'))
            except Exception:
                pass

    @sio.on('terminal_resize', namespace='/terminal')
    def on_resize(data):
        if not current_user.is_authenticated:
            return
        sid = request.sid
        with _lock:
            proc = _sessions.get(sid)
        if proc and proc.isalive():
            try:
                rows = int(data.get('rows', 24))
                cols = int(data.get('cols', 80))
                proc.setwinsize(rows, cols)
            except Exception:
                pass

    @sio.on('disconnect', namespace='/terminal')
    def on_disconnect():
        sid = request.sid
        with _lock:
            proc = _sessions.pop(sid, None)
        if proc and proc.isalive():
            try:
                proc.terminate(force=True)
            except Exception:
                pass


@terminal_bp.route('/')
def index():
    if not current_user.is_authenticated:
        return redirect(url_for('auth.login'))
    return render_template('terminal/index.html')
