from datetime import datetime
from flask_login import UserMixin
from . import db


class User(db.Model, UserMixin):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)

    # Which external AI provider + key to use for BigBangBoom
    ai_provider = db.Column(db.String(32), default='openai')
    ai_api_key = db.Column(db.Text, nullable=True)

    training_prompts = db.relationship(
        'TrainingPrompt', backref='owner', lazy=True, cascade='all, delete-orphan'
    )
    bbb_sessions = db.relationship(
        'BBBSession', backref='owner', lazy=True, cascade='all, delete-orphan'
    )

    def __repr__(self):
        return f'<User {self.username}>'


class TrainingPrompt(db.Model):
    """Prompts the user writes to shape BigBangBoom AI's behaviour."""
    __tablename__ = 'training_prompts'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    content = db.Column(db.Text, nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<TrainingPrompt {self.title}>'


class BBBSession(db.Model):
    """A BigBangBoom AI chat session."""
    __tablename__ = 'bbb_sessions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(160), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    messages = db.relationship(
        'BBBMessage', backref='session', lazy=True,
        cascade='all, delete-orphan', order_by='BBBMessage.created_at',
    )

    @property
    def display_title(self):
        if self.title:
            return self.title
        return f'Chat – {self.created_at.strftime("%b %d %H:%M")}'

    def __repr__(self):
        return f'<BBBSession {self.id}>'


class BBBMessage(db.Model):
    """A single message inside a BigBangBoom AI chat session."""
    __tablename__ = 'bbb_messages'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('bbb_sessions.id'), nullable=False)
    role = db.Column(db.String(16), nullable=False)   # 'user' | 'assistant' | 'system'
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<BBBMessage {self.role} session={self.session_id}>'
