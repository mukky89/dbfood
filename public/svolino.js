// Obedová pohľadnica má jeden krátky dej. Čas v sekundách riadi kroky, prevzatie aj mince.
(() => {
  const canvas = document.getElementById('runner-scene');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const film = canvas.closest('.runner-film');
  const replay = document.getElementById('runner-replay');
  const speech = document.getElementById('runner-speech');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ink = '#44332b', red = '#963c31', cream = '#fff3db', gold = '#ecc06d';
  const lines = [
    'Jedna minca. To prežijem.',
    'Druhá? To aj lyžicu kupujem?',
    'Tretia?! Tak tú lyžicu si beriem domov!',
  ];
  const paymentStart = 2.75;
  const secondsPerLine = 2.3;
  const end = paymentStart + secondsPerLine * lines.length;
  let shownLine = -1;
  let frame = 0;
  let started = false;

  function path(shape, fill, stroke, width = 2) {
    const p = new Path2D(shape);
    if (fill) { ctx.fillStyle = fill; ctx.fill(p); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(p); }
  }
  function ellipse(x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function phase(time, start, finish) {
    return Math.min(1, Math.max(0, (time - start) / (finish - start)));
  }
  function drawGatehouse() {
    ctx.fillStyle = '#f4e6cf';
    ctx.fillRect(0, 0, 480, 210);
    ellipse(64, 43, 18, 18, '#eac98b');
    path('M0 125 Q44 115 85 123 T180 120 Q235 115 284 121 L284 169 H0Z', '#e7d8bd');
    path('M0 156 L10 154 L10 113 L27 109 V153 L31 153 V120 L106 107 V148 L115 147 V102 L131 99 V146 L198 138 V151 L0 176Z', '#d8c7aa');
    path('M32 127 L105 114 M32 137 L105 124 M32 147 L105 134', null, '#f1e5cf', 2);
    path('M0 174 Q98 163 258 167 T480 162 V210 H0Z', '#e9d8bc');
    path('M14 193 L91 188 M124 185 L173 182 M400 195 L455 193', null, '#c5ad8e', 1);
    path('M309 52 L436 52 L458 64 V169 L435 178 L309 167Z', '#b89373', ink);
    path('M309 52 H436 V177 L309 167Z', '#e6cdaa', ink);
    path('M300 48 H437 L461 59 V66 L436 57 H300Z', red, ink);
    path('M317 75 H428 V124 H317Z', '#778d83', ink);
    path('M317 75 H428 V84 Q369 79 317 92Z', '#62786e');
    path('M366 76 V123', null, cream, 2);
    path('M310 122 H432 V129 H310Z', cream, ink);
    path('M320 138 L423 145 M320 145 L423 152 M320 152 L423 159', null, '#c3a280', 1);
    path('M326 30 H419 V51 H326Z', cream, ink);
    ctx.fillStyle = ink;
    ctx.font = 'bold 14px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('VRÁTNICA', 372, 45);
    // Terminál a malá rolka účtenky na výdajnom pulte.
    path('M383 119 L390 104 L407 105 L404 121Z', ink);
    path('M390 111 L392 107 H403 L402 111Z', '#bad0b5');
  }
  function drawLunch(x, y) {
    ctx.save();
    ctx.translate(x, y);
    path('M-14 -10 Q-15 -24 -6 -24 Q3 -24 3 -10 M-3 -10 Q-3 -24 4 -24 Q11 -24 11 -10', null, ink, 2);
    path('M-20 -12 L8 -12 L15 -15 L20 12 L12 16 L-18 14Z', '#cd955b', ink);
    path('M8 -12 L12 16 L20 12 L15 -15Z', '#b87841', ink, 1.2);
    path('M-13 -2 L2 -2 L0 5 L-10 5Z', cream);
    path('M-11 7 H0', null, cream, 1);
    ctx.restore();
  }
  function drawRunner(x, stride, lift, sadness, paying, collect) {
    ellipse(x, 176, 27, 3, '#d0bd9e');
    ctx.save();
    ctx.translate(x, 172);
    for (const side of [-1, 1]) {
      const hip = side * 5, shoe = hip + side * stride * 15;
      const knee = hip + side * stride * 6 + 3;
      const foot = -Math.max(0, side * stride) * 5;
      path('M'+hip+' -39 Q'+knee+' -20 '+shoe+' '+(foot-3), null, side < 0 ? '#594c40' : ink, 8);
      path('M'+(shoe-3)+' '+foot+' q4 -3 11 0', null, ink, 5);
    }
    ctx.translate(0, -lift);
    // Kabát, šál a uši sú poskladané ako farebná kníhtlač.
    path('M-9 -79 Q-20 -71 -18 -45 L-21 -32 Q-3 -26 17 -34 L13 -66 Q10 -75 4 -78Z', red, ink);
    path('M7 -64 L9 -37 M-14 -45 L-4 -45', null, '#ecc79b', 1.6);
    path('M-9 -76 L4 -81 L13 -73 L6 -68 L-9 -71Z', '#d5a34f', ink, 1.5);
    path('M-10 -74 L-17 -57 L-12 -56 L-5 -72Z', '#d5a34f', ink, 1.5);
    path('M-10 -103 Q-8 -119 6 -118 Q21 -118 23 -104 L27 -95 L23 -93 Q24 -77 10 -77 Q-2 -77 -7 -87 Q-14 -86 -14 -94 Q-14 -98 -10 -98Z', '#efbd92', ink);
    path('M-13 -102 Q-16 -121 0 -124 Q13 -128 21 -117 L20 -111 L-5 -106 L-6 -96 L-10 -96Z', '#534235', ink);
    path('M-13 -106 Q1 -115 24 -115 Q30 -115 28 -111 L-10 -101Z', '#64766a', ink);
    ellipse(15, -100, 1.65, 2.2, ink);
    ellipse(3, -93, 3.4, 1.8, '#d88e76');
    path('M10 '+(-105-sadness*2)+' Q14 '+(-107-sadness*2)+' 19 -105', null, ink, 1.8);
    path('M9 '+(-88+sadness*2)+' Q14 '+(-80-sadness*13)+' 21 '+(-89+sadness*4), null, ink, 2);
    const hand = 9 + 21 * collect;
    const handY = -46 - 10 * collect;
    path('M8 -67 Q10 -49 '+hand+' '+handY, null, ink, 9);
    path('M8 -67 Q10 -49 '+(hand-2)+' '+handY, null, red, 6);
    ellipse(hand, handY, 4.2, 3.8, '#efbd92');
    if (paying > 0) {
      path('M-12 -65 Q-16 -43 -5 -44 L'+(8+paying*8)+' -49', null, ink, 6);
      path('M4 -53 L22 -55 L23 -44 L5 -43Z', '#936447', ink, 1.5);
    }
    ctx.restore();
  }
  function draw(time) {
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawGatehouse();
    const walk = phase(time, 0, 2);
    const x = 48 + 223 * walk;
    const stride = Math.sin(8 * Math.PI * walk);
    const collect = phase(time, 2, 2.65);
    const elapsed = time - paymentStart;
    const line = elapsed < 0 ? -1 : Math.min(lines.length - 1, Math.floor(elapsed / secondsPerLine));
    if (line !== shownLine) {
      speech.textContent = lines[line] || '';
      speech.hidden = line < 0;
      shownLine = line;
    }
    // Každá minca preletí rýchlo, no hláška zostane, kým príde ďalšia.
    const coin = line < 0 ? 0 : phase(elapsed - line * secondsPerLine, 0, .65);
    const pay = line < 0 ? 0 : (line + coin) / lines.length;
    drawRunner(x, stride, Math.abs(stride)*2.5, pay, pay, collect);
    drawLunch(339 - 38 * collect, 105 + 34 * collect - Math.sin(collect * Math.PI) * 5);
    if (line >= 0 && coin < 1) {
      const cx = 293 + 96 * coin, cy = 121 - 11 * coin - 27 * Math.sin(Math.PI * coin);
      ellipse(cx, cy, 6.3, 6.3, ink);
      ellipse(cx, cy, 5, 5, gold);
      path('M'+cx+' '+(cy-2)+' v4', null, ink, 1);
    }
    if (pay > .78) {
      const length = phase(pay, .78, 1) * 22;
      path('M394 105 v-'+length+' l3 1 3 -1 3 1 v'+(length-1)+'Z', cream, ink, 1);
    }
  }
  function finish() {
    cancelAnimationFrame(frame);
    frame = 0;
    draw(end);
  }
  function play() {
    if (reduced.matches) return;
    cancelAnimationFrame(frame);
    started = true;
    const start = performance.now();
    function tick(now) {
      const time = (now - start) / 1000;
      draw(Math.min(time, end));
      frame = time < end ? requestAnimationFrame(tick) : 0;
    }
    frame = requestAnimationFrame(tick);
  }
  function applyPreference() {
    replay.hidden = reduced.matches;
    if (reduced.matches) finish();
    else if (!started) draw(0);
  }
  film.hidden = false;
  applyPreference();
  reduced.addEventListener('change', applyPreference);
  replay.addEventListener('click', play);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) play();
      else if (!entry.isIntersecting && frame) finish();
    }, { threshold: .25 }).observe(canvas);
  }
})();
