(() => {
  const root = document.documentElement;
  const expedition = document.getElementById('rc-expedition');
  const trail = document.getElementById('rc-trail');
  const car = document.getElementById('rc-car');
  const particles = document.getElementById('rc-particles');
  const status = document.getElementById('rc-status');
  const toggle = document.getElementById('rc-toggle');
  const soundToggle = document.getElementById('rc-sound');
  const reset = document.getElementById('rc-reset');
  const color = document.getElementById('rc-color');
  if (!expedition || !trail || !car) return;

  const keys = { up:false, down:false, left:false, right:false, boost:false };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let enabled = localStorage.getItem('fob_rc_enabled') !== '0';
  let soundEnabled = localStorage.getItem('fob_rc_sound') !== '0';
  let audioCtx, engineGain, engineFilter, engineLow, engineHigh;
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
  function syncSound() {
    soundToggle.setAttribute('aria-pressed', String(soundEnabled));
    soundToggle.textContent = soundEnabled ? '🔊 Zvuk motora' : '🔇 Motor stíšený';
  }
  function ensureEngine() {
    if (!soundEnabled || audioCtx) { if (audioCtx?.state === 'suspended') audioCtx.resume(); return; }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    engineGain = audioCtx.createGain(); engineGain.gain.value = .0001;
    engineFilter = audioCtx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 360;
    engineLow = audioCtx.createOscillator(); engineLow.type = 'sawtooth'; engineLow.frequency.value = 46;
    engineHigh = audioCtx.createOscillator(); engineHigh.type = 'square'; engineHigh.frequency.value = 92;
    const highGain = audioCtx.createGain(); highGain.gain.value = .16;
    engineLow.connect(engineFilter); engineHigh.connect(highGain).connect(engineFilter); engineFilter.connect(engineGain).connect(audioCtx.destination);
    engineLow.start(); engineHigh.start();
  }
  function updateEngine() {
    if (!audioCtx || !engineGain) return;
    const now = audioCtx.currentTime, moving = active() && (Math.abs(speed) > .015 || keys.up || keys.down);
    const rev = Math.min(1, Math.abs(speed) * 1.8 + (keys.up || keys.down ? .18 : 0) + (keys.boost ? .32 : 0));
    engineLow.frequency.setTargetAtTime(42 + rev * 72, now, .05);
    engineHigh.frequency.setTargetAtTime(84 + rev * 144, now, .05);
    engineFilter.frequency.setTargetAtTime(260 + rev * 720, now, .06);
    engineGain.gain.setTargetAtTime(soundEnabled && moving ? .035 + rev * .045 : .0001, now, .08);
  }
  function setKey(name, pressed) { if (name in keys) keys[name] = pressed; }
  const keyMap = { ArrowUp:'up', w:'up', W:'up', ArrowDown:'down', s:'down', S:'down', ArrowLeft:'left', a:'left', A:'left', ArrowRight:'right', d:'right', D:'right', ' ':'boost' };
  addEventListener('keydown', e => {
    const key = keyMap[e.key]; if (!key || !active() || isTyping()) return;
    e.preventDefault(); ensureEngine(); setKey(key, true);
  }, { passive:false });
  addEventListener('keyup', e => { const key = keyMap[e.key]; if (key) setKey(key, false); });
  addEventListener('blur', () => Object.keys(keys).forEach(k => keys[k] = false));

  expedition.querySelectorAll('[data-key]').forEach(button => {
    const name = button.dataset.key;
    const press = e => { e.preventDefault(); ensureEngine(); setKey(name, true); };
    const release = e => { e.preventDefault(); setKey(name, false); };
    button.addEventListener('pointerdown', press); button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release); button.addEventListener('pointerleave', release);
  });
  toggle.addEventListener('click', () => { enabled = !enabled; localStorage.setItem('fob_rc_enabled', enabled ? '1' : '0'); syncToggle(); });
  soundToggle.addEventListener('click', () => { soundEnabled = !soundEnabled; localStorage.setItem('fob_rc_sound', soundEnabled ? '1' : '0'); if (soundEnabled) ensureEngine(); syncSound(); updateEngine(); });
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
      // Viacnasobna serpentina: auto kopiruje zakruty a nataca sa podla sklonu trate.
      y = 18 + x*.68 + Math.sin(x*.34)*10 + Math.sin(x*.13 + .8)*7;
      const slope = .68 + Math.cos(x*.34)*3.4 + Math.cos(x*.13 + .8)*.91;
      const trailAngle = Math.atan(slope/10) * 38;
      car.style.left=`${x}%`; car.style.bottom=`${y}px`; car.style.transform=`rotate(${angle + trailAngle}deg) scaleX(${speed < -.02 ? -1 : 1})`;
      dust(now); checkpoints();
    }
    updateEngine();
    frame=requestAnimationFrame(loop);
  }
  syncToggle(); syncSound(); updateStatus(); frame=requestAnimationFrame(loop);
  addEventListener('pagehide',()=>cancelAnimationFrame(frame),{once:true});
})();
