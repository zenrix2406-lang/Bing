from flask import Blueprint, render_template, request, flash, redirect, url_for
from flask_login import login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from . import db
from .models import User

profile_bp = Blueprint('profile', __name__, url_prefix='/profile')


@profile_bp.route('/', methods=['GET', 'POST'])
@login_required
def index():
    if request.method == 'POST':
        action = request.form.get('action')

        if action == 'update_profile':
            username = request.form.get('username', '').strip()
            email = request.form.get('email', '').strip().lower()

            if not username or len(username) < 3:
                flash('Username must be at least 3 characters.', 'danger')
            elif not email or '@' not in email:
                flash('A valid email is required.', 'danger')
            else:
                conflict_user = User.query.filter(
                    User.username == username, User.id != current_user.id
                ).first()
                conflict_email = User.query.filter(
                    User.email == email, User.id != current_user.id
                ).first()
                if conflict_user:
                    flash('Username is already taken.', 'danger')
                elif conflict_email:
                    flash('Email is already in use.', 'danger')
                else:
                    current_user.username = username
                    current_user.email = email
                    db.session.commit()
                    flash('Profile updated successfully.', 'success')

        elif action == 'change_password':
            current_pw = request.form.get('current_password', '')
            new_pw = request.form.get('new_password', '')
            confirm_pw = request.form.get('confirm_password', '')

            if not check_password_hash(current_user.password_hash, current_pw):
                flash('Current password is incorrect.', 'danger')
            elif len(new_pw) < 6:
                flash('New password must be at least 6 characters.', 'danger')
            elif new_pw != confirm_pw:
                flash('New passwords do not match.', 'danger')
            else:
                current_user.password_hash = generate_password_hash(new_pw)
                db.session.commit()
                flash('Password changed successfully.', 'success')

        elif action == 'update_api_keys':
            fields = ['openai_key', 'anthropic_key', 'google_key', 'groq_key', 'mistral_key']
            for field in fields:
                value = request.form.get(field, '').strip()
                # Empty string → set to None (clear key); non-empty → save as-is
                setattr(current_user, field, value if value else None)
            db.session.commit()
            flash('API keys updated successfully.', 'success')

        return redirect(url_for('profile.index'))

    return render_template('profile/index.html')
