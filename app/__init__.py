import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_socketio import SocketIO

db = SQLAlchemy()
login_manager = LoginManager()
socketio = SocketIO()


def create_app():
    app = Flask(__name__)

    secret_key = os.environ.get('SECRET_KEY', '')
    if not secret_key:
        import warnings
        secret_key = 'dev-secret-key-change-in-production'
        warnings.warn(
            'SECRET_KEY is not set. Using an insecure default — '
            'set the SECRET_KEY environment variable before deploying.',
            stacklevel=2,
        )
    app.config['SECRET_KEY'] = secret_key
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
        'DATABASE_URL', 'sqlite:///' + os.path.join(app.instance_path, 'pyhost.db')
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024
    app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')

    os.makedirs(app.instance_path, exist_ok=True)
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    db.init_app(app)

    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Please log in to access this page.'
    login_manager.login_message_category = 'warning'

    # SocketIO — use threading mode (stable; works without eventlet)
    allowed_origins = os.environ.get('CORS_ALLOWED_ORIGINS', '*')
    socketio.init_app(app, async_mode='threading',
                      cors_allowed_origins=allowed_origins,
                      logger=False, engineio_logger=False)

    from .auth import auth_bp
    from .editor import editor_bp
    from .hosting import hosting_bp
    from .ai import ai_bp
    from .profile import profile_bp
    from .terminal import terminal_bp, init_socketio
    from .editor import init_editor_socketio

    app.register_blueprint(auth_bp)
    app.register_blueprint(editor_bp)
    app.register_blueprint(hosting_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(profile_bp)
    app.register_blueprint(terminal_bp)

    init_socketio(socketio)
    init_editor_socketio(socketio)

    from . import models

    @login_manager.user_loader
    def load_user(user_id):
        return models.User.query.get(int(user_id))

    with app.app_context():
        db.create_all()

    from datetime import datetime as _dt
    from flask import render_template
    from flask_login import current_user

    @app.context_processor
    def inject_now():
        return {'now': _dt.utcnow()}

    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/dashboard')
    def dashboard():
        from flask import redirect, url_for
        if not current_user.is_authenticated:
            return redirect(url_for('auth.login'))
        file_count = models.HostedFile.query.filter_by(user_id=current_user.id).count()
        session_count = models.ChatSession.query.filter_by(user_id=current_user.id).count()
        snippet_count = models.CodeSnippet.query.filter_by(user_id=current_user.id).count()
        recent_runs = models.RunHistory.query.filter_by(user_id=current_user.id).order_by(
            models.RunHistory.ran_at.desc()).limit(5).all()
        return render_template('dashboard.html',
                               file_count=file_count,
                               session_count=session_count,
                               snippet_count=snippet_count,
                               recent_runs=recent_runs)

    return app
