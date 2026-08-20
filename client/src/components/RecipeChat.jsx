import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../api';
import './RecipeChat.css';

const QUICK_CHIPS = [
  'What went wrong?',
  'How can I improve this next time?',
  'What can I substitute?',
  'Why does this recipe do that?',
];

export default function RecipeChat({ recipe, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const esRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close EventSource on unmount
  useEffect(() => () => esRef.current?.close(), []);

  const handleClose = useCallback(() => {
    esRef.current?.close();
    onClose();
  }, [onClose]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose]);

  async function sendMessage(text) {
    const content = text.trim();
    if (!content || streaming) return;

    const userMsg = { role: 'user', content };
    const outgoing = [...messages, userMsg];
    setMessages([...outgoing, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);
    setError(null);

    try {
      const { job_id } = await api.startChat(recipe.id, outgoing);

      const es = new EventSource(api.chatStreamUrl(recipe.id, job_id));
      esRef.current = es;

      es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.token) {
          setMessages((msgs) => {
            const updated = [...msgs];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = { ...last, content: last.content + data.token };
            return updated;
          });
        }
        if (data.done || data.error) {
          es.close();
          esRef.current = null;
          setStreaming(false);
          if (data.error) setError('AI error: ' + data.error);
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        setStreaming(false);
        setError('Connection lost. Please try again.');
      };
    } catch (err) {
      setStreaming(false);
      setError(err.message);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-text">
          <span className="chat-label">Ask AI</span>
          <span className="chat-recipe-name">{recipe.title}</span>
        </div>
        <div className="chat-header-actions">
          {messages.length > 0 && (
            <button
              className="chat-clear-btn"
              onClick={() => { setMessages([]); setError(null); }}
              title="Clear conversation"
            >
              Clear
            </button>
          )}
          <button className="chat-close-btn" onClick={handleClose} title="Close">×</button>
        </div>
      </div>

      <div className="chat-body">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>Ask about this recipe — substitutions, techniques, what went wrong, how to improve it next time.</p>
          </div>
        ) : (
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg chat-msg--${msg.role}`}>
                <span className="chat-msg-content">
                  {msg.content}
                  {streaming && i === messages.length - 1 && msg.role === 'assistant' && !msg.content && (
                    <span className="chat-cursor" />
                  )}
                </span>
              </div>
            ))}
            {error && <div className="chat-error">{error}</div>}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="chat-input-area">
        {messages.length === 0 && (
          <div className="chat-chips">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip}
                className="chat-chip"
                onClick={() => sendMessage(chip)}
                disabled={streaming}
              >
                {chip}
              </button>
            ))}
          </div>
        )}
        <div className="chat-input-row">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask something… (Enter to send, Shift+Enter for newline)"
            rows={2}
            disabled={streaming}
          />
          <button
            className="chat-send-btn"
            onClick={() => sendMessage(input)}
            disabled={streaming || !input.trim()}
            title="Send"
          >
            {streaming ? '…' : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
}
