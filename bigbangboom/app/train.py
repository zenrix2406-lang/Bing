from datetime import datetime
from flask import (Blueprint, render_template, request, redirect,
                   url_for, flash, abort)
from flask_login import login_required, current_user
from . import db
from .models import TrainingPrompt

train_bp = Blueprint('train', __name__, url_prefix='/train')


@train_bp.route('/')
@login_required
def index():
    prompts = (TrainingPrompt.query
               .filter_by(user_id=current_user.id)
               .order_by(TrainingPrompt.updated_at.desc())
               .all())
    return render_template('train/index.html', prompts=prompts)


@train_bp.route('/new', methods=['GET', 'POST'])
@login_required
def new_prompt():
    if request.method == 'POST':
        title = request.form.get('title', '').strip()
        content = request.form.get('content', '').strip()
        is_active = request.form.get('is_active') == 'on'

        if not title:
            flash('A title is required.', 'danger')
        elif not content:
            flash('Prompt content cannot be empty.', 'danger')
        else:
            prompt = TrainingPrompt(
                user_id=current_user.id,
                title=title,
                content=content,
                is_active=is_active,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.session.add(prompt)
            db.session.commit()
            flash('Training prompt saved!', 'success')
            return redirect(url_for('train.index'))

    return render_template('train/form.html', prompt=None)


@train_bp.route('/<int:prompt_id>/edit', methods=['GET', 'POST'])
@login_required
def edit_prompt(prompt_id):
    prompt = TrainingPrompt.query.get_or_404(prompt_id)
    if prompt.user_id != current_user.id:
        abort(403)

    if request.method == 'POST':
        title = request.form.get('title', '').strip()
        content = request.form.get('content', '').strip()
        is_active = request.form.get('is_active') == 'on'

        if not title:
            flash('A title is required.', 'danger')
        elif not content:
            flash('Prompt content cannot be empty.', 'danger')
        else:
            prompt.title = title
            prompt.content = content
            prompt.is_active = is_active
            db.session.commit()
            flash('Prompt updated!', 'success')
            return redirect(url_for('train.index'))

    return render_template('train/form.html', prompt=prompt)


@train_bp.route('/<int:prompt_id>/delete', methods=['POST'])
@login_required
def delete_prompt(prompt_id):
    prompt = TrainingPrompt.query.get_or_404(prompt_id)
    if prompt.user_id != current_user.id:
        abort(403)
    db.session.delete(prompt)
    db.session.commit()
    flash('Prompt deleted.', 'info')
    return redirect(url_for('train.index'))


@train_bp.route('/<int:prompt_id>/toggle', methods=['POST'])
@login_required
def toggle_prompt(prompt_id):
    prompt = TrainingPrompt.query.get_or_404(prompt_id)
    if prompt.user_id != current_user.id:
        abort(403)
    prompt.is_active = not prompt.is_active
    db.session.commit()
    return redirect(url_for('train.index'))
