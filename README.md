# PyHost Platform

A production-quality full-stack web platform built with Flask.  
**Code, Host, and AI-power your Python projects — all in one place.**

## Features

| Feature | Description |
|---|---|
| 🔐 **Auth** | Register / login / logout with PBKDF2-SHA256 password hashing |
| 🐍 **Python Runner** | Browser-based CodeMirror editor; run Python 3 code with sandboxed subprocess |
| 📁 **File Hosting** | Upload, download and delete files (up to 50 MB) per user |
| 🤖 **AI Chat** | Chat with GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, LLaMA 3.3 (Groq), Mistral Large |
| ⚙️ **Profile / Settings** | Change username, email, password and store AI provider API keys |

## Tech Stack

- **Backend:** Python 3 / Flask 3
- **Database:** SQLite via Flask-SQLAlchemy
- **Auth:** Flask-Login + Werkzeug password hashing
- **Frontend:** Jinja2 templates, Bootstrap 5.3 (CDN), CodeMirror 5 (CDN)
- **AI API calls:** `requests` library (no vendor SDKs required)

## Quick Start

```bash
# 1. Clone & enter directory
git clone <repo-url>
cd Bing   # or whatever you named the cloned directory

# 2. Create a virtual environment
python3 -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the development server
python run.py
```

Then open http://localhost:5000 in your browser.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | `dev-secret-key-change-in-production` | Flask session secret key |
| `DATABASE_URL` | `sqlite:///instance/pyhost.db` | SQLAlchemy DB URI |

Example `.env` file (loaded manually or with python-dotenv):

```
SECRET_KEY=your-super-secret-key-here
```

## AI Provider API Keys

Add your API keys in **Profile → Settings** after logging in:

| Provider | Model | Where to get a key |
|---|---|---|
| OpenAI | GPT-4o | https://platform.openai.com/api-keys |
| Anthropic | Claude 3.5 Sonnet | https://console.anthropic.com/ |
| Google | Gemini 1.5 Pro | https://aistudio.google.com/ |
| Groq | LLaMA 3.3 70B | https://console.groq.com/ |
| Mistral | Mistral Large | https://console.mistral.ai/ |

## Project Structure

```
app/
  __init__.py       # App factory, extensions, core routes
  models.py         # SQLAlchemy models (User, HostedFile, ChatSession, ChatMessage)
  auth.py           # /auth blueprint (register, login, logout)
  editor.py         # /editor blueprint (CodeMirror UI, /run endpoint)
  hosting.py        # /hosting blueprint (upload, download, delete)
  ai.py             # /ai blueprint (chat sessions, AI API dispatch)
  profile.py        # /profile blueprint (account info, API keys)
  templates/        # Jinja2 HTML templates
  static/           # CSS & JavaScript
  uploads/          # User file uploads (gitignored)
run.py              # Entry point
requirements.txt
```

## Security Notes

- Passwords hashed with Werkzeug's `generate_password_hash` (PBKDF2-SHA256).
- Code execution uses `subprocess.run(..., timeout=10)` without `shell=True`.
- File uploads use `secure_filename` and are stored per-user in isolated directories.
- API keys are stored in the database; use HTTPS in production.
- In production set a strong `SECRET_KEY` and consider encrypting API key columns.
