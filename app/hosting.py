import os
import uuid
from datetime import datetime
from flask import (Blueprint, render_template, request, redirect,
                   url_for, flash, send_from_directory, abort, current_app)
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from . import db
from .models import HostedFile

hosting_bp = Blueprint('hosting', __name__, url_prefix='/hosting')


def user_upload_dir(user_id):
    folder = os.path.join(current_app.config['UPLOAD_FOLDER'], str(user_id))
    os.makedirs(folder, exist_ok=True)
    return folder


@hosting_bp.route('/')
@login_required
def index():
    files = (HostedFile.query
             .filter_by(user_id=current_user.id)
             .order_by(HostedFile.uploaded_at.desc())
             .all())
    return render_template('hosting/index.html', files=files)


@hosting_bp.route('/upload', methods=['POST'])
@login_required
def upload():
    if 'file' not in request.files:
        flash('No file selected.', 'warning')
        return redirect(url_for('hosting.index'))

    file = request.files['file']
    if file.filename == '':
        flash('No file selected.', 'warning')
        return redirect(url_for('hosting.index'))

    original_name = secure_filename(file.filename)
    if not original_name:
        flash('Invalid filename.', 'danger')
        return redirect(url_for('hosting.index'))

    # Block dangerous file extensions
    BLOCKED_EXTENSIONS = {
        '.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi', '.com', '.scr',
        '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.pif',
    }
    ext = os.path.splitext(original_name)[1].lower()
    if ext in BLOCKED_EXTENSIONS:
        flash(f'File type "{ext}" is not allowed for security reasons.', 'danger')
        return redirect(url_for('hosting.index'))
    stored_name = f'{uuid.uuid4().hex}{ext}'

    folder = user_upload_dir(current_user.id)
    save_path = os.path.join(folder, stored_name)
    file.save(save_path)

    size = os.path.getsize(save_path)

    hosted = HostedFile(
        user_id=current_user.id,
        filename=stored_name,
        original_name=original_name,
        size=size,
        mimetype=file.mimetype or 'application/octet-stream',
        uploaded_at=datetime.utcnow(),
    )
    db.session.add(hosted)
    db.session.commit()

    flash(f'"{original_name}" uploaded successfully.', 'success')
    return redirect(url_for('hosting.index'))


@hosting_bp.route('/download/<int:file_id>')
@login_required
def download(file_id):
    hosted = HostedFile.query.get_or_404(file_id)
    if hosted.user_id != current_user.id:
        abort(403)
    folder = user_upload_dir(current_user.id)
    return send_from_directory(folder, hosted.filename,
                               as_attachment=True,
                               download_name=hosted.original_name)


@hosting_bp.route('/delete/<int:file_id>', methods=['POST'])
@login_required
def delete(file_id):
    hosted = HostedFile.query.get_or_404(file_id)
    if hosted.user_id != current_user.id:
        abort(403)

    folder = user_upload_dir(current_user.id)
    file_path = os.path.join(folder, hosted.filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    db.session.delete(hosted)
    db.session.commit()
    flash(f'"{hosted.original_name}" has been deleted.', 'info')
    return redirect(url_for('hosting.index'))
