# BigBangBoom AI

A standalone full-stack AI assistant web application with two AI engines:

1. **Training AI** — Write plain-English prompts to shape BigBangBoom AI's behaviour.
2. **BigBangBoom AI** — The main unrestricted AI chat assistant that executes every request completely.

## Features

| Feature | Description |
|---|---|
| 🔐 **Auth** | Register / login / logout with secure password hashing |
| 🧠 **Training AI** | Create, edit, activate/deactivate training prompts |
| 💥 **BigBangBoom AI** | Unrestricted AI chat powered by YOUR prompts |
| ⚙️ **Settings** | Choose AI provider and add your API key |
| 🎨 **Dark UI** | Custom deep-space dark theme with neon violet/cyan accents |

## Quick Start

```bash
# 1. Enter the bigbangboom folder
cd bigbangboom

# 2. Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the development server
python run.py
```

Open http://localhost:5001 in your browser.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BBB_SECRET_KEY` | (insecure default) | Flask session secret key |
| `BBB_DATABASE_URL` | `sqlite:///instance/bbb.db` | SQLAlchemy DB URI |
| `FLASK_DEBUG` | `0` | Set to `1` to enable debug mode |

## Supported AI Providers

Add your API key in **Settings** after logging in:

| Provider | Model | Key URL |
|---|---|---|
| OpenAI | GPT-4o | https://platform.openai.com/api-keys |
| Groq | LLaMA 3.3 70B | https://console.groq.com/ |
| Mistral | Mistral Large | https://console.mistral.ai/ |
| Anthropic | Claude 3.5 Sonnet | https://console.anthropic.com/ |
| Google | Gemini 1.5 Pro | https://aistudio.google.com/ |

## How Training Prompts Work

1. Go to **Training AI** in the nav bar.
2. Click **New Training Prompt**.
3. Write a plain-English instruction (e.g., *"Always respond as a senior Python developer and provide full runnable code."*).
4. Mark it **Active** and save.
5. Every BigBangBoom AI conversation will now include this instruction.

You can stack multiple prompts, toggle them on/off instantly, and edit/delete them anytime.

## Project Structure

```
bigbangboom/
  run.py                  — Entry point (port 5001)
  requirements.txt
  app/
    __init__.py           — App factory
    models.py             — User, TrainingPrompt, BBBSession, BBBMessage
    auth.py               — /auth blueprint
    train.py              — /train blueprint (Training AI)
    bigbangboom.py        — /chat blueprint (BigBangBoom AI)
    templates/
      base.html
      index.html          — Landing page
      auth/login.html
      auth/register.html
      train/index.html    — Prompt manager
      train/form.html     — Create/edit prompt
      bigbangboom/chat.html     — Main AI chat UI
      bigbangboom/settings.html — Provider + API key settings
    static/
      css/style.css       — Full custom dark theme
      js/chat.js          — Chat JS (typing indicator, markdown)
```
