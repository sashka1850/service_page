(() => {
  const root = document.querySelector('.process-player');
  if (!root) return;
  const slides = [...root.querySelectorAll('.process-slide')];
  const buttons = [...root.querySelectorAll('.process-step')];
  const fills = buttons.map(button => button.querySelector('.process-track > span'));
  const pause = root.querySelector('.process-pause');
  const stage = root.querySelector('.process-stage');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = 0, elapsed = 0, last = 0, paused = reduced, visible = false, changing = false, generation = 0;
  const duration = 5000;
  function paint() {
    buttons.forEach((button, i) => {
      button.setAttribute('aria-pressed', String(i === current));
      fills[i].style.transform = `scaleX(${i < current ? 1 : i === current ? elapsed / duration : 0})`;
    });
  }
  function updatePause() {
    pause.textContent = paused ? '▶' : 'Ⅱ';
    pause.setAttribute('aria-pressed', String(paused));
    pause.setAttribute('aria-label', paused ? 'Продолжить показ' : 'Приостановить показ');
  }
  async function select(next) {
    const token = ++generation;
    changing = true;
    slides[current].classList.remove('is-current');
    slides[current].setAttribute('aria-hidden', 'true');
    // Fade completely to black before swapping the photo and text.
    await new Promise(resolve => setTimeout(resolve, reduced ? 0 : 580));
    if (token !== generation) return;
    const img = slides[next].querySelector('img');
    try { await img.decode(); } catch (_) { /* Retain readable text if a photo fails. */ }
    if (token !== generation) return;
    current = next; elapsed = 0;
    stage.textContent = buttons[current].querySelector('.process-label').textContent;
    slides[current].setAttribute('aria-hidden', 'false');
    slides[current].classList.add('is-current');
    paint();
    await new Promise(resolve => setTimeout(resolve, reduced ? 0 : 550));
    if (token === generation) { changing = false; last = 0; }
  }
  buttons.forEach((button, i) => button.addEventListener('click', () => select(i)));
  pause.addEventListener('click', () => { paused = !paused; last = 0; updatePause(); });
  root.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault(); select((current + (event.key === 'ArrowRight' ? 1 : slides.length - 1)) % slides.length);
    }
  });
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; last = 0; }, { threshold: .25 }).observe(root);
  document.addEventListener('visibilitychange', () => { last = 0; });
  function tick(now) {
    if (visible && !paused && !changing && !document.hidden) {
      if (last) elapsed = Math.min(duration, elapsed + Math.min(now - last, 100));
      paint();
      if (elapsed >= duration) select((current + 1) % slides.length);
    }
    last = now; requestAnimationFrame(tick);
  }
  updatePause(); paint(); requestAnimationFrame(tick);
})();
