/* The lightbox: click a period picture (or the patent, or the LiDAR image) to see it large.
   While it is open the page does not scroll: a wheel, trackpad, touch or key gesture instead fades it out,
   shrinking back toward where it came from, and once it is gone the story is exactly where it was.
   Click outside, the close button or Esc close it at once. */
window.LL = window.LL || {};

LL.lightbox = (function () {
  const RM = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const box = document.createElement("div");
  box.className = "lightbox"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.hidden = true;
  box.innerHTML = '<button class="lb-close" aria-label="Close">&times;</button><figure><img alt=""><figcaption></figcaption></figure><p class="lb-hint">scroll to return to the story</p>';
  document.body.appendChild(box);
  const img = box.querySelector("img"), cap = box.querySelector("figcaption"), fig = box.querySelector("figure");
  let open = false, prog = 0, from = null, touchY = null, lastFocus = null, closing = 0;
  const DIST = 300;
  let idle = 0, swallowUntil = 0; // the tail of a gesture (trackpad momentum) after it closed is not a scroll

  function paint() {
    const p = Math.max(0, Math.min(1, prog));
    box.style.opacity = String(1 - p);
    if (!RM && from) {
      const r = fig.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const s = 1 - p * (1 - Math.min(1, from.width / Math.max(1, r.width)));
      fig.style.transform = `translate(${(from.left + from.width / 2 - cx) * p}px, ${(from.top + from.height / 2 - cy) * p}px) scale(${s})`;
    }
    if (p >= 1) finish(true);
  }
  function show(o) {
    img.src = o.src; img.alt = o.alt || "";
    cap.innerHTML = o.caption || "";
    from = o.from || null; prog = 0; open = true; clearTimeout(closing);
    lastFocus = document.activeElement;
    box.hidden = false; box.classList.remove("in"); fig.style.transform = ""; box.style.opacity = "";
    requestAnimationFrame(() => box.classList.add("in"));
    box.querySelector(".lb-close").focus({ preventScroll: true });
  }
  function finish(byGesture) {
    if (byGesture) swallowUntil = Date.now() + 300;
    open = false; box.hidden = true; box.classList.remove("in"); box.style.opacity = ""; fig.style.transform = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function close(byGesture) { // at once, with a short fade
    if (!open) return; open = false; box.classList.remove("in"); box.style.opacity = "0";
    if (byGesture) swallowUntil = Date.now() + 500;
    closing = setTimeout(() => finish(byGesture), RM ? 0 : 220);
  }
  // a gesture moves the fade; when the gesture stops part-way, it finishes closing past a third, else springs back
  function step(d) {
    prog += Math.abs(d) / DIST; paint();
    clearTimeout(idle);
    if (open) idle = setTimeout(() => { if (!open) return; if (prog > 0.33) close(true); else { prog = 0; fig.style.transition = "transform .25s ease"; paint(); setTimeout(() => fig.style.transition = "", 260); } }, 260);
  }

  addEventListener("wheel", e => {
    if (!open && Date.now() < swallowUntil) { e.preventDefault(); swallowUntil = Date.now() + 200; return; }
    if (!open) return; e.preventDefault(); step(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY || e.deltaX); }, { passive: false, capture: true });
  addEventListener("touchstart", e => { if (open) touchY = e.touches[0].clientY; }, { passive: true, capture: true });
  addEventListener("touchmove", e => { if (!open) return; e.preventDefault(); const y = e.touches[0].clientY; if (touchY != null) step(y - touchY); touchY = y; }, { passive: false, capture: true });
  addEventListener("keydown", e => {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); close(false); return; }
    const k = { ArrowDown: 120, ArrowUp: 120, PageDown: 400, PageUp: 400, " ": 400, Home: 400, End: 400 }[e.key];
    if (k) { e.preventDefault(); e.stopPropagation(); step(k); }
  }, { capture: true });
  box.addEventListener("click", e => { if (e.target === box || e.target.closest(".lb-close") || e.target.closest(".lb-hint")) close(false); });

  // anything with data-enlarge, or a figure/img the page marks, opens it
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-enlarge]"); if (!t || open) return;
    e.preventDefault();
    const o = t._enlarge ? t._enlarge() : { src: t.getAttribute("href") || t.src, alt: t.getAttribute("alt") || "", caption: t.dataset.caption || "" };
    const im = t.tagName === "IMG" ? t : t.querySelector("img");
    o.from = (im || t).getBoundingClientRect();
    if (o.src) show(o);
  });
  return { show, close, get open() { return open; } };
})();
