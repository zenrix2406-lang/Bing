import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager

db = SQLAlchemy()
login_manager = LoginManager()


def create_app():
    app = Flask(__name__)

    secret_key = os.environ.get('BBB_SECRET_KEY', '')
    if not secret_key:
        import warnings
        secret_key = 'bbb-dev-secret-change-in-production'
        warnings.warn('BBB_SECRET_KEY is not set. Using insecure default.', stacklevel=2)

    app.config['SECRET_KEY'] = secret_key
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
        'BBB_DATABASE_URL',
        'sqlite:///' + os.path.join(app.instance_path, 'bbb.db'),
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    os.makedirs(app.instance_path, exist_ok=True)

    db.init_app(app)

    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Please log in to continue.'
    login_manager.login_message_category = 'warning'

    from .auth import auth_bp
    from .train import train_bp
    from .bigbangboom import bbb_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(train_bp)
    app.register_blueprint(bbb_bp)

    from . import models

    @login_manager.user_loader
    def load_user(user_id):
        return models.User.query.get(int(user_id))

    with app.app_context():
        db.create_all()

    from datetime import datetime as _dt
    from flask import render_template

    @app.context_processor
    def inject_now():
        return {'now': _dt.utcnow()}

    @app.route('/')
    def index():
        return render_template('index.html')

    return app
