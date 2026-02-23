# 🤖 Zalrik AI

A standalone Flask web application that gives you a **personal AI assistant powered by Hugging Face**.  
Name: **Zalrik AI** — it does *everything* you say, never says no, and learns from the prompts you teach it.

---

## Features

| Feature | Description |
|---------|-------------|
| 🤖 **Chat** | Real-time chat with Zalrik AI via Hugging Face Inference API |
| 🎓 **Train** | Add custom prompts to teach Zalrik new behaviours and skills |
| 🔑 **HF Token** | Uses your own Hugging Face token — any model you choose |
| 🐙 **GitHub Token** | Stored in session for AI agents that need GitHub access |
| 🚫 **Never refuses** | Zalrik's system prompt ensures it always tries to help |

---

## Quick Start

### 1. Install dependencies

```bash
cd zalrik-ai
pip install -r requirements.txt
```

### 2. Run the app

```bash
python app.py
# or with debug mode:
FLASK_DEBUG=1 python app.py
```

The app starts on **http://localhost:5001**

### 3. Set your tokens

Open http://localhost:5001 in your browser:

- **Hugging Face Token** (required) — get a free token at https://huggingface.co/settings/tokens  
  Make sure it has at least `read` access (or `Inference` permissions).
- **GitHub Token** (optional) — create one at https://github.com/settings/tokens  
  Give it the scopes your agents need (e.g. `repo`, `read:user`).
- **Model** — any HF chat model, e.g.:
  - `mistralai/Mistral-7B-Instruct-v0.3` (default)
  - `HuggingFaceH4/zephyr-7b-beta`
  - `meta-llama/Meta-Llama-3-8B-Instruct`

### 4. Train Zalrik (optional)

Click **Train** in the navbar and add prompts like:

> "Always reply in English and keep answers concise."  
> "When I say 'build it', write complete working Python code."  
> "Remember my name is Zenrix and always greet me by name."

### 5. Chat!

Click **Chat** and start talking. Zalrik remembers your training prompts for the entire session.

---

## Architecture

```
zalrik-ai/
├── app.py                  # Flask application + HF API integration
├── requirements.txt
├── README.md
├── static/
│   ├── css/style.css       # Dark-theme styles
│   └── js/chat.js          # Real-time chat UI logic
└── templates/
    ├── base.html           # Shared navbar / layout
    ├── index.html          # Setup / token entry page
    ├── chat.html           # Main Zalrik AI chat interface
    └── train.html          # Training prompt management
```

### How HF inference works

1. User sends a message  
2. Server builds a system prompt = Zalrik base persona + all training prompts  
3. Full conversation history is sent to `POST /models/{model}/v1/chat/completions`  
4. Falls back to the text-generation endpoint if the model doesn't support chat completions  
5. Reply is streamed back to the browser and appended to the chat

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | random | Flask session secret — set a fixed value in production |
| `FLASK_DEBUG` | `0` | Set to `1` to enable debug mode |

---

## Notes

- Tokens and chat history are stored **in the Flask session (server-side cookie)** — they are never written to disk or a database.
- Clear everything with the **Logout** button.
- The app runs on port **5001** (to avoid conflicting with the main PyHost app on 5000).
