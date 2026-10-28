/* A small scroll driver: which step sits at the trigger line, and how far through it we are. No library. */
window.LL = window.LL || {};

LL.scroller = function (opts) {
  const steps = Array.from(opts.steps);
  let active = -1, raf = 0;
  const triggerFrac = () => (window.innerWidth <= 760 ? 0.9 : 0.55);

  function measure() {
    raf = 0;
    const line = window.innerHeight * triggerFrac();
    let idx = active, prog = 0;
    for (let i = 0; i < steps.length; i++) {
      const r = steps[i].getBoundingClientRect();
      if (r.top <= line && r.bottom > line) { idx = i; prog = (line - r.top) / r.height; break; }
      if (r.top > line) { // the line is in a gap above this step: stay with the previous one, fully done
        if (i > 0) { idx = i - 1; prog = 1; } else { idx = 0; prog = 0; }
        break;
      }
      if (i === steps.length - 1) { idx = i; prog = 1; }
    }
    if (idx !== active) {
      const prev = active; active = idx;
      steps.forEach((s, k) => s.classList.toggle("active", k === idx));
      opts.onEnter && opts.onEnter(steps[idx], idx, prev);
    }
    opts.onProgress && opts.onProgress(steps[idx], idx, Math.max(0, Math.min(1, prog)));
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(measure); }
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  measure();
  return { refresh: schedule, get active() { return active; } };
};
