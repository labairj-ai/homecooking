import { useState, useEffect, useMemo, useRef } from 'react';
import './CookMode.css';

function parseSteps(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const steps = [];
  Array.from(doc.body.children).forEach((el) => {
    if (el.tagName === 'UL' || el.tagName === 'OL') {
      el.querySelectorAll('li').forEach((li) =>
        steps.push({ html: li.innerHTML, type: 'step' })
      );
    } else if (el.textContent.trim()) {
      const isHeading = /^H[123]$/.test(el.tagName);
      steps.push({ html: el.innerHTML, type: isHeading ? 'heading' : 'step' });
    }
  });
  return steps;
}

function parseStepSeconds(html) {
  const text = html.replace(/<[^>]*>/g, ' ');
  const h = text.match(/\b(\d+)\s*(?:to\s+\d+\s+)?hours?\b/i);
  const m = text.match(/\b(\d+)\s*(?:to\s+\d+\s+)?min(?:utes?)?\b/i);
  const s = text.match(/\b(\d+)\s*(?:to\s+\d+\s+)?sec(?:onds?)?\b/i);
  const total = (h ? parseInt(h[1]) * 3600 : 0) + (m ? parseInt(m[1]) * 60 : 0) + (s ? parseInt(s[1]) : 0);
  return total > 0 ? total : null;
}

function formatTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.4, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    });
  } catch {}
}

export default function CookMode({ instructions, title, onClose }) {
  const steps = useMemo(() => parseSteps(instructions), [instructions]);
  const [idx, setIdx] = useState(0);
  const [timer, setTimer] = useState(null); // { total, remaining, running }
  const intervalRef = useRef(null);

  // Wake Lock
  useEffect(() => {
    let lock;
    if (navigator.wakeLock) {
      navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    }
    return () => { lock?.release(); };
  }, []);

  // Escape to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Countdown interval
  useEffect(() => {
    if (!timer?.running) return;
    intervalRef.current = setInterval(() => {
      setTimer((t) => {
        if (!t || !t.running) return t;
        if (t.remaining <= 1) {
          clearInterval(intervalRef.current);
          beep();
          return { ...t, remaining: 0, running: false, done: true };
        }
        return { ...t, remaining: t.remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [timer?.running]);

  function startTimer(seconds) {
    clearInterval(intervalRef.current);
    setTimer({ total: seconds, remaining: seconds, running: true, done: false });
  }

  function toggleTimer() {
    setTimer((t) => t ? { ...t, running: !t.running } : t);
  }

  function resetTimer() {
    clearInterval(intervalRef.current);
    setTimer((t) => t ? { ...t, remaining: t.total, running: false, done: false } : t);
  }

  if (!steps.length) {
    return (
      <div className="cook-overlay">
        <div className="cook-top">
          <span className="cook-title">{title}</span>
          <button className="cook-close" onClick={onClose}>×</button>
        </div>
        <div className="cook-body">
          <p style={{ color: 'var(--text-muted)' }}>No steps to display.</p>
        </div>
      </div>
    );
  }

  const current = steps[idx];
  const stepSteps = steps.filter((s) => s.type === 'step');
  const stepNumber = steps.slice(0, idx + 1).filter((s) => s.type === 'step').length;
  const isHeading = current.type === 'heading';
  const stepSeconds = !isHeading ? parseStepSeconds(current.html) : null;

  return (
    <div className="cook-overlay">
      <div className="cook-top">
        <span className="cook-title">{title}</span>
        {timer && (
          <div className={`cook-timer-badge${timer.done ? ' cook-timer-badge--done' : ''}`}>
            <span className="cook-timer-time">{timer.done ? 'Done!' : formatTime(timer.remaining)}</span>
            {!timer.done && (
              <button className="cook-timer-toggle" onClick={toggleTimer}>
                {timer.running ? '⏸' : '▶'}
              </button>
            )}
            <button className="cook-timer-reset" onClick={resetTimer}>↺</button>
          </div>
        )}
        <button className="cook-close" onClick={onClose}>×</button>
      </div>

      <div className="cook-body">
        {!isHeading && (
          <div className="cook-counter">
            Step {stepNumber} of {stepSteps.length}
          </div>
        )}
        <div
          className={`cook-step${isHeading ? ' cook-step--heading' : ''}`}
          dangerouslySetInnerHTML={{ __html: current.html }}
        />
        {stepSeconds && (
          <button
            className="cook-timer-start"
            onClick={() => startTimer(stepSeconds)}
          >
            ⏱ {formatTime(stepSeconds)} timer
          </button>
        )}
      </div>

      <div className="cook-nav">
        <button
          className="cook-btn cook-btn--prev"
          onClick={() => setIdx((i) => i - 1)}
          disabled={idx === 0}
        >
          ← Back
        </button>
        <button
          className="cook-btn cook-btn--next"
          onClick={() => setIdx((i) => i + 1)}
          disabled={idx === steps.length - 1}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
