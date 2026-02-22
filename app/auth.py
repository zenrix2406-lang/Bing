from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from . import db
from .models import User

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')


@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        confirm = request.form.get('confirm_password', '')

        error = None
        if not username or len(username) < 3:
            error = 'Username must be at least 3 characters.'
        elif not email or '@' not in email:
            error = 'A valid email address is required.'
        elif not password or len(password) < 6:
            error = 'Password must be at least 6 characters.'
        elif password != confirm:
            error = 'Passwords do not match.'
        elif User.query.filter_by(username=username).first():
            error = 'Username is already taken.'
        elif User.query.filter_by(email=email).first():
            error = 'Email is already registered.'

        if error:
            flash(error, 'danger')
            return render_template('auth/register.html',
                                   username=username, email=email)

        user = User(
            username=username,
            email=email,
            password_hash=generate_password_hash(password)
        )
        db.session.add(user)
        db.session.commit()

        login_user(user)
        flash(f'Welcome, {username}! Your account has been created.', 'success')
        return redirect(url_for('dashboard'))

    return render_template('auth/register.html', username='', email='')


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        identifier = request.form.get('identifier', '').strip()
        password = request.form.get('password', '')
        remember = request.form.get('remember') == 'on'

        user = User.query.filter(
            (User.username == identifier) | (User.email == identifier.lower())
        ).first()

        if not user or not check_password_hash(user.password_hash, password):
            flash('Invalid username/email or password.', 'danger')
            return render_template('auth/login.html', identifier=identifier)

        login_user(user, remember=remember)
        flash(f'Welcome back, {user.username}!', 'success')

        next_page = request.args.get('next')
        return redirect(next_page or url_for('dashboard'))

    return render_template('auth/login.html', identifier='')


@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('index'))
