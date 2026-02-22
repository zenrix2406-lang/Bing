import json
import requests as http_requests
from datetime import datetime
from flask import (Blueprint, render_template, request, jsonify,
                   redirect, url_for, flash, abort)
from flask_login import login_required, current_user
from . import db
from .models import ChatSession, ChatMessage

ai_bp = Blueprint('ai', __name__, url_prefix='/ai')

MODELS = [
    {'id': 'gpt-4o',                      'label': 'OpenAI GPT-4o',             'provider': 'openai'},
    {'id': 'claude-3-5-sonnet-20241022',   'label': 'Anthropic Claude 3.5 Sonnet','provider': 'anthropic'},
    {'id': 'gemini-1.5-pro',               'label': 'Google Gemini 1.5 Pro',     'provider': 'google'},
    {'id': 'llama-3.3-70b-versatile',      'label': 'Meta LLaMA 3.3 70B (Groq)', 'provider': 'groq'},
    {'id': 'mistral-large-latest',         'label': 'Mistral Large',             'provider': 'mistral'},
]

PROVIDER_KEY_ATTR = {
    'openai':    'openai_key',
    'anthropic': 'anthropic_key',
    'google':    'google_key',
    'groq':      'groq_key',
    'mistral':   'mistral_key',
}


def get_model_info(model_id):
    return next((m for m in MODELS if m['id'] == model_id), None)


def get_user_key(provider):
    attr = PROVIDER_KEY_ATTR.get(provider)
    if not attr:
        return None
    return getattr(current_user, attr, None)


def call_openai(api_key, model_id, messages):
    url = 'https://api.openai.com/v1/chat/completions'
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }
    payload = {'model': model_id, 'messages': messages}
    resp = http_requests.post(url, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return data['choices'][0]['message']['content']


def call_anthropic(api_key, model_id, messages):
    url = 'https://api.anthropic.com/v1/messages'
    headers = {
        'x-api-key': api_key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
    }
    # Anthropic separates system prompt from messages
    system_msgs = [m['content'] for m in messages if m['role'] == 'system']
    chat_msgs = [m for m in messages if m['role'] != 'system']
    payload = {
        'model': model_id,
        'max_tokens': 4096,
        'messages': chat_msgs,
    }
    if system_msgs:
        payload['system'] = '\n'.join(system_msgs)
    resp = http_requests.post(url, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return data['content'][0]['text']


def call_google(api_key, model_id, messages):
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent?key={api_key}'
    contents = []
    for m in messages:
        if m['role'] == 'system':
            continue
        role = 'user' if m['role'] == 'user' else 'model'
        contents.append({'role': role, 'parts': [{'text': m['content']}]})
    payload = {'contents': contents}
    resp = http_requests.post(url, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return data['candidates'][0]['content']['parts'][0]['text']


def call_groq(api_key, model_id, messages):
    url = 'https://api.groq.com/openai/v1/chat/completions'
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }
    payload = {'model': model_id, 'messages': messages}
    resp = http_requests.post(url, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return data['choices'][0]['message']['content']


def call_mistral(api_key, model_id, messages):
    url = 'https://api.mistral.ai/v1/chat/completions'
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }
    payload = {'model': model_id, 'messages': messages}
    resp = http_requests.post(url, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return data['choices'][0]['message']['content']


PROVIDER_CALLERS = {
    'openai':    call_openai,
    'anthropic': call_anthropic,
    'google':    call_google,
    'groq':      call_groq,
    'mistral':   call_mistral,
}


@ai_bp.route('/')
@login_required
def index():
    sessions = (ChatSession.query
                .filter_by(user_id=current_user.id)
                .order_by(ChatSession.created_at.desc())
                .all())
    return render_template('ai/index.html', models=MODELS, sessions=sessions,
                           active_session=None, messages=[])


@ai_bp.route('/session/new', methods=['POST'])
@login_required
def new_session():
    model_id = request.form.get('model_id', MODELS[0]['id'])
    if not any(m['id'] == model_id for m in MODELS):
        model_id = MODELS[0]['id']

    session = ChatSession(
        user_id=current_user.id,
        model_name=model_id,
        created_at=datetime.utcnow(),
    )
    db.session.add(session)
    db.session.commit()
    return redirect(url_for('ai.session_view', session_id=session.id))


@ai_bp.route('/session/<int:session_id>')
@login_required
def session_view(session_id):
    chat_session = ChatSession.query.get_or_404(session_id)
    if chat_session.user_id != current_user.id:
        abort(403)

    sessions = (ChatSession.query
                .filter_by(user_id=current_user.id)
                .order_by(ChatSession.created_at.desc())
                .all())
    messages = chat_session.messages

    return render_template('ai/index.html', models=MODELS, sessions=sessions,
                           active_session=chat_session, messages=messages)


@ai_bp.route('/session/<int:session_id>/send', methods=['POST'])
@login_required
def send_message(session_id):
    chat_session = ChatSession.query.get_or_404(session_id)
    if chat_session.user_id != current_user.id:
        abort(403)

    data = request.get_json(force=True, silent=True) or {}
    user_text = (data.get('message') or '').strip()
    if not user_text:
        return jsonify({'error': 'Empty message.'}), 400

    model_info = get_model_info(chat_session.model_name)
    if not model_info:
        return jsonify({'error': 'Unknown model.'}), 400

    api_key = get_user_key(model_info['provider'])
    if not api_key:
        return jsonify({
            'error': 'No API key set for this provider. Go to Profile > Settings.'
        }), 400

    # Save user message
    user_msg = ChatMessage(
        session_id=chat_session.id,
        role='user',
        content=user_text,
        created_at=datetime.utcnow(),
    )
    db.session.add(user_msg)
    db.session.commit()

    # Build message history for the API call
    history = [
        {'role': m.role, 'content': m.content}
        for m in chat_session.messages
    ]

    # Set session title from first user message
    if not chat_session.title:
        chat_session.title = user_text[:80]
        db.session.commit()

    caller = PROVIDER_CALLERS[model_info['provider']]
    try:
        reply_text = caller(api_key, chat_session.model_name, history)
    except http_requests.Timeout:
        db.session.delete(user_msg)
        db.session.commit()
        return jsonify({'error': 'The AI provider took too long to respond. Please try again.'}), 504
    except http_requests.HTTPError as exc:
        try:
            err_body = exc.response.json()
            err_msg = (err_body.get('error', {}) or {}).get('message') or str(exc)
        except Exception:
            err_msg = str(exc)
        # Remove the user message we already saved so the session stays consistent
        db.session.delete(user_msg)
        db.session.commit()
        return jsonify({'error': f'API error: {err_msg}'}), 502
    except Exception as exc:
        db.session.delete(user_msg)
        db.session.commit()
        return jsonify({'error': f'Unexpected error: {exc}'}), 500

    assistant_msg = ChatMessage(
        session_id=chat_session.id,
        role='assistant',
        content=reply_text,
        created_at=datetime.utcnow(),
    )
    db.session.add(assistant_msg)
    db.session.commit()

    return jsonify({'reply': reply_text})


@ai_bp.route('/session/<int:session_id>/delete', methods=['POST'])
@login_required
def delete_session(session_id):
    chat_session = ChatSession.query.get_or_404(session_id)
    if chat_session.user_id != current_user.id:
        abort(403)
    db.session.delete(chat_session)
    db.session.commit()
    flash('Chat session deleted.', 'info')
    return redirect(url_for('ai.index'))
