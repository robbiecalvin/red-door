import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
export function Sheet({ title, eyebrow, children, onClose, className = "" }: { title: string; eyebrow?: string; children: React.ReactNode; onClose(): void; className?: string }): React.ReactElement {
  const panel = useRef<HTMLElement>(null), close = useRef(onClose), id = useId(); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div className="rd-sheet-backdrop" onClick={() => close.current()}><section className={`rd-sheet ${className}`} ref={panel} role="dialog" aria-modal="true" aria-labelledby={id} onClick={e => e.stopPropagation()} onKeyDown={e => {
    if (e.key === "Escape") { e.stopPropagation(); close.current(); }
    if (e.key === "Tab") {
      const focusable = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }}><div className="rd-sheet-handle" aria-hidden="true" /><header className="rd-sheet-head"><div>{eyebrow ? <div className="rd-eyebrow">{eyebrow}</div> : null}<h2 id={id}>{title}</h2></div><button className="rd-btn rd-sheet-close" type="button" onClick={() => close.current()} aria-label={`Close ${title}`}>✕</button></header><div className="rd-sheet-body">{children}</div></section></div>, document.body);
}
