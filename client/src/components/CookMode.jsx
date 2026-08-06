import { useState, useEffect, useMemo } from 'react';
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

export default function CookMode({ instructions, title, onClose }) {
  const steps = useMemo(() => parseSteps(instructions), [instructions]);
  const [idx, setIdx] = useState(0);

  // Wake Lock — keep screen on
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

  return (
    <div className="cook-overlay">
      <div className="cook-top">
        <span className="cook-title">{title}</span>
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
