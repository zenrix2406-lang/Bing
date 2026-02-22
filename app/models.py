from datetime import datetime
from flask_login import UserMixin
from . import db


class User(db.Model, UserMixin):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)

    # AI Provider API keys (encrypted at rest ideally; stored as text here)
    openai_key = db.Column(db.Text, nullable=True)
    anthropic_key = db.Column(db.Text, nullable=True)
    google_key = db.Column(db.Text, nullable=True)
    groq_key = db.Column(db.Text, nullable=True)
    mistral_key = db.Column(db.Text, nullable=True)

    files = db.relationship('HostedFile', backref='owner', lazy=True, cascade='all, delete-orphan')
    chat_sessions = db.relationship('ChatSession', backref='owner', lazy=True, cascade='all, delete-orphan')
    snippets = db.relationship('CodeSnippet', backref='owner', lazy=True, cascade='all, delete-orphan',
                               foreign_keys='CodeSnippet.user_id')
    run_history = db.relationship('RunHistory', backref='owner', lazy=True, cascade='all, delete-orphan',
                                  foreign_keys='RunHistory.user_id')

    def __repr__(self):
        return f'<User {self.username}>'


class HostedFile(db.Model):
    __tablename__ = 'hosted_files'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    filename = db.Column(db.String(256), nullable=False)       # stored filename (uuid-based)
    original_name = db.Column(db.String(256), nullable=False)  # original upload name
    size = db.Column(db.Integer, nullable=False)               # bytes
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    mimetype = db.Column(db.String(128), nullable=True)

    def __repr__(self):
        return f'<HostedFile {self.original_name}>'

    @property
    def size_human(self):
        size = self.size
        for unit in ('B', 'KB', 'MB', 'GB'):
            if size < 1024:
                return f'{size:.1f} {unit}'
            size /= 1024
        return f'{size:.1f} TB'


class ChatSession(db.Model):
    __tablename__ = 'chat_sessions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    model_name = db.Column(db.String(64), nullable=False)
    title = db.Column(db.String(120), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    messages = db.relationship('ChatMessage', backref='session', lazy=True,
                               cascade='all, delete-orphan', order_by='ChatMessage.created_at')

    def __repr__(self):
        return f'<ChatSession {self.id} {self.model_name}>'

    @property
    def display_title(self):
        if self.title:
            return self.title
        return f'{self.model_name} – {self.created_at.strftime("%b %d %H:%M")}'


class ChatMessage(db.Model):
    __tablename__ = 'chat_messages'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('chat_sessions.id'), nullable=False)
    role = db.Column(db.String(16), nullable=False)   # 'user' or 'assistant'
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<ChatMessage {self.role} in session {self.session_id}>'


class CodeSnippet(db.Model):
    __tablename__ = 'code_snippets'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    code = db.Column(db.Text, nullable=False)
    language = db.Column(db.String(32), default='python')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<CodeSnippet {self.title}>'


class RunHistory(db.Model):
    __tablename__ = 'run_history'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    code = db.Column(db.Text, nullable=False)
    stdin = db.Column(db.Text, nullable=True)
    stdout = db.Column(db.Text, nullable=True)
    stderr = db.Column(db.Text, nullable=True)
    exit_code = db.Column(db.Integer, nullable=True)
    ran_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<RunHistory {self.id}>'
