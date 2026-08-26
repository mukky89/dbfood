(() => {
  const root = document.documentElement;
  const expedition = document.getElementById('rc-expedition');
  const trail = document.getElementById('rc-trail');
  const car = document.getElementById('rc-car');
  const particles = document.getElementById('rc-particles');
  const status = document.getElementById('rc-status');
  const toggle = document.getElementById('rc-toggle');
  const reset = document.getElementById('rc-reset');
  const color = document.getElementById('rc-color');
  if (!expedition || !trail || !car) return;

  const keys = { up:false, down:false, left:false, right:false, boost:false };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let enabled = localStorage.getItem('fob_rc_enabled') !== '0';
  let x = 4, y = 20, speed = 0, angle = 0, reached = new Set(), lastDust = 0, frame;
  const savedColor = localStorage.getItem('fob_rc_color') || '#526b3f';
  color.value = savedColor; expedition.style.setProperty('--rc-car-color', savedColor);

  function isTyping() { return /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable; }
  function active() { return root.classList.contains('theme-rc') && enabled; }
  function syncToggle() {
    expedition.classList.toggle('rc-disabled', !enabled);
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = enabled ? '◉ RC režim zapnutý' : '○ Zapnúť RC režim';
  }
  function setKey(name, pressed) { if (name in keys) keys[name] = pressed; }
  const keyMap = { ArrowUp:'up', w:'up', W:'up', ArrowDown:'down', s:'down', S:'down', ArrowLeft:'left', a:'left', A:'left', ArrowRight:'right', d:'right', D:'right', ' ':'boost' };
  addEventListener('keydown', e => {
    const key = keyMap[e.key]; if (!key || !active() || isTyping()) return;
    e.preventDefault(); setKey(key, true);
  }, { passive:false });
  addEventListener('keyup', e => { const key = keyMap[e.key]; if (key) setKey(key, false); });
  addEventListener('blur', () => Object.keys(keys).forEach(k => keys[k] = false));

  expedition.querySelectorAll('[data-key]').forEach(button => {
    const name = button.dataset.key;
    const press = e => { e.preventDefault(); setKey(name, true); };
    const release = e => { e.preventDefault(); setKey(name, false); };
    button.addEventListener('pointerdown', press); button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release); button.addEventListener('pointerleave', release);
  });
  toggle.addEventListener('click', () => { enabled = !enabled; localStorage.setItem('fob_rc_enabled', enabled ? '1' : '0'); syncToggle(); });
  reset.addEventListener('click', () => { x=4; y=20; speed=0; angle=0; reached.clear(); expedition.querySelectorAll('.rc-checkpoint').forEach(c=>c.classList.remove('reached')); updateStatus(); });
  color.addEventListener('input', () => { expedition.style.setProperty('--rc-car-color', color.value); localStorage.setItem('fob_rc_color', color.value); });

  function updateStatus(message) { status.textContent = message || `${reached.size ? 'TRAIL' : 'BASE CAMP'} · ${reached.size}/3`; }
  function dust(now) {
    if (reducedMotion || Math.abs(speed) < .12 || now-lastDust < 110) return;
    lastDust = now; const p = document.createElement('i'); p.className='rc-dust';
    p.style.left=`${x+6}%`; p.style.bottom=`${y+16}px`; particles.appendChild(p); setTimeout(()=>p.remove(),750);
  }
  function checkpoints() {
    [[1,27],[2,56],[3,84]].forEach(([id,at]) => {
      if (x >= at && !reached.has(id)) {
        reached.add(id); expedition.querySelector(`[data-checkpoint="${id}"]`)?.classList.add('reached');
        updateStatus(id===3 ? 'TRAIL DOKONČENÝ · MUD MASTER!' : `CHECKPOINT ${id}/3`);
      }
    });
  }
  function loop(now) {
    if (active()) {
      const throttle = (keys.up?1:0) - (keys.down?1:0);
      const boost = keys.boost ? 1.7 : 1;
      speed += throttle * .018 * boost; speed *= throttle ? .985 : .94; speed = Math.max(-.38,Math.min(.62*boost,speed));
      const steering = (keys.right?1:0) - (keys.left?1:0); angle += steering * Math.min(2.2,Math.abs(speed)*5.2); angle *= .88;
      x += speed; x = Math.max(1,Math.min(89,x)); if (x===1||x===89) speed*=.3;
      y = 18 + x*.72 + Math.sin(x*.18)*5;
      car.style.left=`${x}%`; car.style.bottom=`${y}px`; car.style.transform=`rotate(${angle + Math.sin(x*.25)*1.4}deg) scaleX(${speed < -.02 ? -1 : 1})`;
      dust(now); checkpoints();
    }
    frame=requestAnimationFrame(loop);
  }
  syncToggle(); updateStatus(); frame=requestAnimationFrame(loop);
  addEventListener('pagehide',()=>cancelAnimationFrame(frame),{once:true});
})();
