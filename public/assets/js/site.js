(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];

  if (root.classList.contains('intro')) {
    try { sessionStorage.setItem('dv', '1'); } catch (e) {}
    setTimeout(() => root.classList.remove('intro'), 2800);
  }

  // menu
  const toggle = $('[data-menu-toggle]'), panel = $('#navLinks');
  const setMenu = open => {
    if (!toggle || !panel) return;
    panel.classList.toggle('open', open); toggle.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'tutup menu' : 'buka menu');
  };
  if (toggle && panel) {
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    panel.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('click', e => { if (panel.classList.contains('open') && !toggle.contains(e.target) && !panel.contains(e.target)) setMenu(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
    addEventListener('resize', () => { if (innerWidth > 800) setMenu(false); }, { passive: true });
  }

  // reveal + nav spy
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(el => io.observe(el));
    const links = $$('[data-nav]');
    const spy = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) links.forEach(a => a.classList.toggle('active', a.dataset.nav === e.target.id));
    }), { rootMargin: '-45% 0px -50% 0px' });
    ['top', 'platform', 'cara', 'kenapa'].map(id => document.getElementById(id)).filter(Boolean).forEach(s => spy.observe(s));
  } else reveals.forEach(el => el.classList.add('in'));

  // scroll-driven: progress bar + pinned story
  const bar = $('.progress i'), story = $('#cara'), rail = $('.rail i'), steps = $$('.steps2 .s');
  let curStep = -1;
  const setStep = n => {
    if (n === curStep || !story) return;
    curStep = n; story.dataset.step = n;
    steps.forEach((s, i) => s.classList.toggle('on', i === n - 1));
  };
  const onScroll = () => {
    const max = Math.max(1, root.scrollHeight - innerHeight);
    if (bar) bar.parentNode.style.setProperty('--p', Math.min(1, scrollY / max).toFixed(4));
    if (story) {
      if (reduce) { setStep(3); return; }
      const r = story.getBoundingClientRect(), span = Math.max(1, r.height - innerHeight);
      const p = Math.min(1, Math.max(0, -r.top / span));
      setStep(p < .08 && r.top > 0 ? 0 : p < .36 ? 1 : p < .68 ? 2 : 3);
      if (rail) rail.style.setProperty('--sp', p.toFixed(3));
    }
  };
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll, { passive: true }); onScroll();

  // hero stage parallax
  const stage = $('#stage');
  if (stage && !reduce) {
    addEventListener('pointermove', e => {
      const r = stage.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / innerWidth * 2, y = (e.clientY - (r.top + r.height / 2)) / innerHeight * 2;
      stage.style.setProperty('--mx', Math.max(-1, Math.min(1, x)).toFixed(2));
      stage.style.setProperty('--my', Math.max(-1, Math.min(1, y)).toFixed(2));
    }, { passive: true });
  }

  // orbit: core shows the platform you point at
  const core = $('#coreName'), tiles = $$('.tile');
  if (core && tiles.length) {
    let i = 0, hold = false;
    const show = t => { tiles.forEach(x => x.classList.toggle('hot', x === t)); core.textContent = t.dataset.n; };
    tiles.forEach(t => { t.addEventListener('pointerenter', () => { hold = true; show(t); }); t.addEventListener('pointerleave', () => { hold = false; }); });
    if (!reduce) setInterval(() => { if (!hold) show(tiles[i++ % tiles.length]); }, 1600);
  }

  // bento tilt + spotlight
  if (!reduce) $$('.bc[data-tilt]').forEach(el => {
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--ry', ((x - .5) * 6).toFixed(2) + 'deg'); el.style.setProperty('--rx', ((.5 - y) * 6).toFixed(2) + 'deg');
      el.style.setProperty('--fx', (x * r.width) + 'px'); el.style.setProperty('--fy', (y * r.height) + 'px');
    }, { passive: true });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
  });

  // magnetic button
  if (!reduce) $$('.magnetic').forEach(el => {
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${((e.clientX - r.left) / r.width - .5) * 14}px,${((e.clientY - r.top) / r.height - .5) * 10}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
})();
