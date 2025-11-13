/* ===========================================
   CodeSnake — Chaos Edition v2.4
   Merged, production-clean, full-featured game.js
   (DOMContentLoaded guarded to avoid blank-screen issues)
   =========================================== */

document.addEventListener('DOMContentLoaded', () => {
  /* === CONSTANTS & CANVAS SETUP (initialized after DOM ready) === */
  const canvas = document.getElementById('game');
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  const BOX = 24;
  const GRID_W = canvas ? Math.floor(canvas.width / BOX) : 20;
  const GRID_H = canvas ? Math.floor(canvas.height / BOX) : 20;

  /* === SAFE DOM LOOKUPS === */
  const $ = id => document.getElementById(id);
  const particleCountMul = $('particleCountMul');
  const countMulLabel = $('countMulLabel');
  const particleSize = $('particleSize');
  const sizeLabel = $('sizeLabel');
  const trailToggle = $('trailToggle');
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const volRange = $('vol');

  const introOverlay = $('introOverlay');
  const introText = $('introText');
  const levelOverlay = $('levelOverlay');
  const gameOverOverlay = $('gameOverOverlay');
  const finalScore = $('finalScore');
  const bestScore = $('bestScore');
  const playAgainBtn = $('playAgainBtn');
  const backToLevelBtn = $('backToLevelBtn');
  const themeSelect = $('themeSelect');
  const levelSelectBg = $('levelSelectBg');

  const pauseBtn = $('pauseBtn');
  const musicBtn = $('musicBtn');
  const trapPulse = $('trapPulse');
  const trapContainer = $('trapContainer');
  const bgParticlesEl = $('bgParticles');
  const bgGradientEl = $('bgGradient');

  const scoreBoard = $('scoreBoard');
  const bestBoard = $('bestBoard');
  let comboBox = $('comboBox');

  /* Defensive fallback for comboBox to avoid runtime errors */
  if (!comboBox) {
    comboBox = document.createElement('div');
    comboBox.id = 'comboBox';
    comboBox.className = 'comboBadge';
    comboBox.style.display = 'none';
    comboBox.style.fontFamily = "'Press Start 2P', monospace";
    comboBox.textContent = '';
    // Attach to HUD area if possible
    const hud = document.querySelector('.hud');
    if (hud) hud.appendChild(comboBox);
  }

  /* === GAME STATE === */
  let snake = [];
  let direction = 'RIGHT';
  let foods = [];
  const DEFAULT_FOOD_COUNT = 2;
  let score = 0;
  let baseSpeed = 160;
  let speed = 160;
  let intervalId = null;
  let paused = false;
  let activeLevelLabel = 'NORMAL';

  /* === PARTICLES CONFIG === */
  let particles = [], trailParticles = [];
  let particleConfig = {
    countMul: particleCountMul ? Number(particleCountMul.value) : 1,
    size: particleSize ? Number(particleSize.value) : 3,
    colorMode: 'mixed',
    trail: trailToggle ? trailToggle.checked : true
  };

  /* === POPUPS, COMBO, POWERUPS === */
  let popups = [];
  let combo = 0, lastEatTime = 0, comboWindow = 2500, comboTimeoutId = null;
  let powerupEffects = [], borderTraps = [];
  let bgModeTimer = null;

  /* === FOOD SETTINGS === */
  const PREMIUM_CHANCE = 0.12, RARE_CHANCE = 0.04;
  const FOOD_LIFESPAN = 5500, FOOD_FADE_START = 4000;

  /* === BEST SCORE === */
  const BEST_KEY = 'codesnake_best_v5';
  function getBest() { return Number(localStorage.getItem(BEST_KEY) || 0); }
  function setBest(v) { localStorage.setItem(BEST_KEY, String(v)); }
  if (bestBoard) bestBoard.textContent = `Best: ${getBest()}`;
  if (bestScore) bestScore.textContent = `Best: ${getBest()}`;

  /* ===========================================
     AUDIO SYSTEM — lightweight synth + type sound
  ============================================ */
  let audioCtx = null, masterGain = null, musicGain = null;
  let isMusicPlaying = false, musicNodes = [];

  function ensureAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(audioCtx.destination);
    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.14;
    musicGain.connect(masterGain);
  }

  function startMusicLoop() {
    ensureAudio();
    stopMusicLoop();

    const o1 = audioCtx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 110;
    const o2 = audioCtx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 220;
    const g = audioCtx.createGain(); g.gain.value = 0.001;
    o1.connect(g); o2.connect(g); g.connect(musicGain);

    const lfo = audioCtx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.12;
    const lfoGain = audioCtx.createGain(); lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);

    const now = audioCtx.currentTime;
    o1.start(now); o2.start(now); lfo.start(now);

    const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1300;
    g.disconnect(); g.connect(filter); filter.connect(musicGain);

    musicNodes = [o1, o2, lfo, g, filter];
    isMusicPlaying = true;
  }

  function stopMusicLoop() {
    if (!audioCtx) return;
    try { musicNodes.forEach(n => { if (n && n.stop) n.stop(); }); } catch (e) {}
    musicNodes = []; isMusicPlaying = false;
  }

  function toggleMusic() {
    if (!audioCtx) ensureAudio();
    if (isMusicPlaying) {
      stopMusicLoop();
      if (musicBtn) musicBtn.textContent = '🔇';
    } else {
      startMusicLoop();
      if (musicBtn) musicBtn.textContent = '🎵';
    }
  }

  function clack() {
    if (!audioCtx) ensureAudio();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator(); osc.type = 'square'; osc.frequency.value = 880;
    const g = audioCtx.createGain(); g.gain.value = 0.001;
    osc.connect(g); g.connect(masterGain);
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.08 * (volRange ? volRange.value / 100 : 0.8), now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.start(now); osc.stop(now + 0.06);
  }

  /* ===========================================
     INTRO & TYPEWRITER TEXT
  ============================================ */
  const introLines = [
    "Uh… hey. You there?",
    "Cool. I wasn’t sure this code would actually run.",
    "Anyway — welcome, brave human, to CodeSnake!",
    "It’s not your average snake game. It’s *self-aware*.",
    "I mean… I know I’m just a few lines of JavaScript, but I have dreams too.",
    "Dreams of neon lights, 8-bit glory, and maybe… world domination?",
    "Use your ARROWS or WASD to move. You know, like every other snake game ever.",
    "Try not to crash. The pixels have families.",
    "Press START when you're ready — or just stare dramatically at the screen. I’ll wait."
  ];
  let lineIdx = 0, charIdx = 0, acc = '', typingTimers = [], typingInProgress = true;

  function sched(fn, t) { const id = setTimeout(fn, t); typingTimers.push(id); return id; }
  function clearTyping() { typingTimers.forEach(i => clearTimeout(i)); typingTimers = []; }

  function typeNext() {
    if (lineIdx >= introLines.length) { typingInProgress = false; return; }
    const line = introLines[lineIdx];
    if (charIdx < line.length) {
      acc += line.charAt(charIdx);
      if (introText) introText.innerHTML = acc + "<span style='opacity:0.85'>&#9608;</span>";
      charIdx++; clack();
      sched(typeNext, 60 + Math.random() * 40);
    } else {
      acc += "\n";
      if (introText) introText.innerHTML = acc;
      charIdx = 0; lineIdx++;
      sched(typeNext, 500 + Math.random() * 300);
    }
  }

  /* Only start typewriter if introText exists */
  if (introText) sched(typeNext, 600);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (!introOverlay) return;
    if (getComputedStyle(introOverlay).display === 'none') return;
    if (typingInProgress) {
      clearTyping();
      acc = introLines.join("\n") + "\n";
      if (introText) introText.innerHTML = acc;
      typingInProgress = false;
      if (!audioCtx) ensureAudio();
      return;
    } else {
      showLevelSelect();
      return;
    }
  });

  function showLevelSelect() {
    if (introOverlay) introOverlay.style.display = 'none';
    if (levelOverlay) levelOverlay.style.display = 'flex';
  }

  /* ===========================================
     LEVEL SELECTION & THEME HANDLING
  ============================================ */
  document.querySelectorAll('.levelBtn').forEach(b => {
    b.addEventListener('click', () => {
      baseSpeed = Number(b.dataset.speed);
      activeLevelLabel = b.textContent.trim();
      applyTheme(themeSelect ? themeSelect.value : 'retro');
      if (levelOverlay) levelOverlay.style.display = 'none';
      startGame();
    });
  });

  function applyTheme(name) {
    document.body.classList.remove('retro', 'modern');
    document.body.classList.add(name === 'modern' ? 'modern' : 'retro');
    if (trapPulse) {
      trapPulse.classList.remove('retro', 'modern');
      trapPulse.classList.add(name === 'modern' ? 'modern' : 'retro');
    }
    startBgCycle();
    updateSwatchBorders();
  }

  if (themeSelect) themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));

  /* ===========================================
     FOOD GENERATION & UTILITIES
  ============================================ */
  function cellKey(p) { return `${p.x},${p.y}`; }

  function randomFreeCellUnique(existingSet) {
    let tries = 0;
    while (true) {
      const pos = { x: Math.floor(Math.random() * GRID_W), y: Math.floor(Math.random() * GRID_H) };
      const k = cellKey(pos);
      if (existingSet.has(k)) { if (++tries > 600) return pos; else continue; }
      const collSnake = snake.some(s => s.x === pos.x && s.y === pos.y);
      if (collSnake) { if (++tries > 600) return pos; else continue; }
      return pos;
    }
  }

  function spawnFoods() {
    const target = DEFAULT_FOOD_COUNT;
    const existing = new Set(); foods.forEach(f => existing.add(cellKey(f)));
    while (foods.length < target) {
      const pos = randomFreeCellUnique(existing); existing.add(cellKey(pos));
      const roll = Math.random(); let points = 1;
      if (roll < RARE_CHANCE) points = 3;
      else if (roll < RARE_CHANCE + PREMIUM_CHANCE) points = 2;
      const power = Math.random() < 0.06 ? pickRandomPower() : null;
      foods.push({ x: pos.x, y: pos.y, points, life: FOOD_LIFESPAN, created: Date.now(), alpha: 1, power });
    }
  }

  function respawnFoodAtIndex(idx) {
    if (idx < 0 || idx >= foods.length) return;
    const existing = new Set();
    for (let i = 0; i < foods.length; i++) if (i !== idx) existing.add(cellKey(foods[i]));
    for (const s of snake) existing.add(cellKey(s));
    let tries = 0, newPos;
    do {
      newPos = randomFreeCellUnique(existing);
      tries++;
      if (tries > 600) break;
    } while (newPos.x === foods[idx].x && newPos.y === foods[idx].y);
    const roll = Math.random(); let points = 1;
    if (roll < RARE_CHANCE) points = 3;
    else if (roll < RARE_CHANCE + PREMIUM_CHANCE) points = 2;
    const power = Math.random() < 0.04 ? pickRandomPower() : null;
    foods[idx] = { x: newPos.x, y: newPos.y, points, life: FOOD_LIFESPAN, created: Date.now(), alpha: 1, power };
  }

  function pickRandomPower() {
    const powers = ['glitch', 'wave', 'dizzy'];
    return powers[Math.floor(Math.random() * powers.length)];
  }

  /* ===========================================
     PARTICLES, TRAIL, POPUPS
  ============================================ */
  function pickParticleColor(isTrail = false) {
    const m = particleConfig.colorMode;
    if (m === 'mixed') {
      const arr = ['#ff66ff', '#33ffd6', '#ffd166', '#66ff88'];
      return arr[Math.floor(Math.random() * arr.length)];
    }
    return m;
  }

  function spawnParticles(px, py) {
    const baseCount = 12;
    const count = Math.max(1, Math.round(baseCount * particleConfig.countMul));
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 2.2;
      particles.push({
        x: px, y: py,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 0.6,
        life: 30 + Math.random() * 30,
        size: particleConfig.size + Math.random() * 1.5,
        color: pickParticleColor()
      });
    }
  }

  function spawnTrailBurst(px, py) {
    const count = Math.max(2, Math.round(6 * particleConfig.countMul));
    for (let i = 0; i < count; i++) {
      trailParticles.push({
        x: px + (Math.random() - 0.5) * 8,
        y: py + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.8) * 0.6,
        life: 20 + Math.random() * 30,
        size: Math.max(0.6, particleConfig.size * 0.6),
        color: pickParticleColor(true)
      });
    }
  }

  function spawnTrailAtSnake() {
    if (!particleConfig.trail || !snake.length) return;
    const head = snake[0];
    const px = (head.x + 0.5) * BOX;
    const py = (head.y + 0.5) * BOX;
    const c = Math.max(1, Math.round(3 * particleConfig.countMul));
    for (let i = 0; i < c; i++) {
      trailParticles.push({
        x: px + (Math.random() - 0.5) * 6,
        y: py + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        life: 10 + Math.random() * 10,
        size: Math.max(0.6, particleConfig.size * 0.5),
        color: pickParticleColor(true)
      });
    }
  }

  function spawnPopup(px, py, txt, comboLevel) {
    popups.push({ x: px, y: py, txt: txt, life: 50, scale: 1 + Math.min(0.6, comboLevel * 0.06) });
  }

  function drawParticles() {
    // update and prune particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.06;
      p.vx *= 0.98; p.vy *= 0.98;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = trailParticles.length - 1; i >= 0; i--) {
      const p = trailParticles[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.03;
      p.vx *= 0.98; p.vy *= 0.98;
      p.life--;
      if (p.life <= 0) trailParticles.splice(i, 1);
    }

    particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / 60);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    trailParticles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / 60) * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawPopups() {
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      ctx.save();
      const prog = p.life / 50;
      ctx.globalAlpha = Math.max(0, prog);
      const yoff = (1 - prog) * 30;
      ctx.translate(p.x, p.y - yoff);
      ctx.scale(p.scale, p.scale);
      ctx.font = "bold 14px 'Press Start 2P'";
      ctx.textAlign = "center";
      ctx.fillStyle = document.body.classList.contains('modern') ? '#111827' : '#fff';
      ctx.fillText(p.txt, 0, 0);
      ctx.restore();
      p.life--;
      if (p.life <= 0) popups.splice(i, 1);
    }
  }

  /* ===========================================
     TRAPS (DOM render + canvas traces)
  ============================================ */
  function scheduleTrapWithWarning() {
    if (activeLevelLabel.toLowerCase() !== 'insane') return;
    if (score < 35 && Math.random() < 0.6) return;
    const sides = ['top', 'bottom', 'left', 'right'];
    const side = sides[Math.floor(Math.random() * sides.length)];
    const lengthCells = Math.floor(Math.random() * ((side === 'top' || side === 'bottom') ? (GRID_W / 2) : (GRID_H / 2))) + Math.floor(((side === 'top' || side === 'bottom') ? GRID_W / 6 : GRID_H / 6));
    const startIndex = Math.floor(Math.random() * (((side === 'top' || side === 'bottom') ? (GRID_W - lengthCells) : (GRID_H - lengthCells))));
    const duration = 3500 + Math.floor(Math.random() * 1500);
    showTrapPulse();
    setTimeout(() => {
      hideTrapPulse();
      createTrap(side, startIndex, lengthCells, duration);
    }, 1000);
  }

  function showTrapPulse() {
    if (!trapPulse) return;
    trapPulse.classList.add('show');
    trapPulse.classList.add(document.body.classList.contains('modern') ? 'modern' : 'retro');
  }
  function hideTrapPulse() {
    if (!trapPulse) return;
    trapPulse.classList.remove('show'); trapPulse.classList.remove('modern'); trapPulse.classList.remove('retro');
  }

  function createTrap(side, startIdx, lengthCells, duration) {
    const trap = { side, start: startIdx, length: lengthCells, expires: Date.now() + duration, created: Date.now() };
    borderTraps.push(trap);
    renderTrapDOM(trap);
    setTimeout(() => { try { if (trap._el) trap._el.remove(); } catch(e) {} }, duration + 300);
  }

  function renderTrapDOM(trap) {
    if (!trapContainer || !canvas) return;
    const el = document.createElement('div');
    el.classList.add('trap-glow');
    el.classList.add(document.body.classList.contains('modern') ? 'mod' : 'retro');
    const pxPerCell = (canvas.width / GRID_W);
    const pyPerCell = (canvas.height / GRID_H);

    if (document.body.classList.contains('retro')) {
      el.classList.add('retro');
      if (trap.side === 'top' || trap.side === 'bottom') {
        const w = trap.length * pxPerCell;
        const left = trap.start * pxPerCell + 18;
        const top = trap.side === 'top' ? 18 : (18 + canvas.height - 10);
        el.style.left = left + 'px';
        el.style.top = (top - (trap.side === 'top' ? 8 : 0)) + 'px';
        el.style.width = w + 'px';
        el.style.height = '8px';
      } else {
        const h = trap.length * pyPerCell;
        const top = trap.start * pyPerCell + 18;
        const left = trap.side === 'left' ? 18 : (18 + canvas.height - 10);
        el.style.left = (left) + 'px';
        el.style.top = top + 'px';
        el.style.width = '8px';
        el.style.height = h + 'px';
      }
    } else {
      el.classList.add('mod');
      if (trap.side === 'top' || trap.side === 'bottom') {
        const w = trap.length * pxPerCell;
        const left = trap.start * pxPerCell + 18;
        const top = trap.side === 'top' ? 18 : (18 + canvas.height - 10);
        el.style.left = left + 'px';
        el.style.top = top + 'px';
        el.style.width = w + 'px';
        el.style.height = '10px';
      } else {
        const h = trap.length * pyPerCell;
        const top = trap.start * pyPerCell + 18;
        const left = trap.side === 'left' ? 18 : (18 + canvas.height - 10);
        el.style.left = (left) + 'px';
        el.style.top = top + 'px';
        el.style.width = '10px';
        el.style.height = h + 'px';
      }
    }
    trap._el = el;
    trapContainer.appendChild(el);
  }

  function drawBorderTraps() {
    if (!canvas) return;
    for (const t of borderTraps) {
      const alpha = Math.max(0, (t.expires - Date.now()) / 1000);
      ctx.save();
      ctx.globalAlpha = 0.9 * Math.min(1, alpha);
      ctx.fillStyle = document.body.classList.contains('modern') ? 'rgba(30,30,30,0.25)' : 'rgba(255,20,140,0.14)';
      if (t.side === 'top') ctx.fillRect(t.start * BOX, 0, t.length * BOX, 6);
      if (t.side === 'bottom') ctx.fillRect(t.start * BOX, canvas.height - 6, t.length * BOX, 6);
      if (t.side === 'left') ctx.fillRect(0, t.start * BOX, 6, t.length * BOX);
      if (t.side === 'right') ctx.fillRect(canvas.width - 6, t.start * BOX, 6, t.length * BOX);
      ctx.restore();
    }
  }

  function pointInTrap(point, t) {
    if (!t) return false;
    if (t.side === 'top') { if (point.y === 0 && point.x >= t.start && point.x < t.start + t.length) return true; }
    if (t.side === 'bottom') { if (point.y === GRID_H - 1 && point.x >= t.start && point.x < t.start + t.length) return true; }
    if (t.side === 'left') { if (point.x === 0 && point.y >= t.start && point.y < t.start + t.length) return true; }
    if (t.side === 'right') { if (point.x === GRID_W - 1 && point.y >= t.start && point.y < t.start + t.length) return true; }
    return false;
  }

  /* ===========================================
     COMBO LOGIC
  ============================================ */
  function handleComboAndPlay() {
    const now = Date.now();
    if (now - lastEatTime <= comboWindow) combo++;
    else combo = 1;
    lastEatTime = now;
    showCombo();
    playComboChime(combo);
    if (comboTimeoutId) clearTimeout(comboTimeoutId);
    comboTimeoutId = setTimeout(() => { combo = 0; hideCombo(); }, comboWindow + 400);
  }

  function showCombo() {
    if (combo <= 1) { comboBox.style.display = 'none'; return; }
    comboBox.textContent = `x${combo}`;
    comboBox.style.display = 'inline-block';
    comboBox.style.transform = 'scale(1.12)';
    setTimeout(() => comboBox.style.transform = 'scale(1)', 120);
  }
  function hideCombo() { comboBox.style.display = 'none'; }

  function playComboChime(comboLevel) {
    if (!audioCtx) ensureAudio();
    if (!audioCtx) return;
    const vol = (volRange ? volRange.value / 100 : 0.8);
    const rate = Math.min(2.0, 1 + (comboLevel - 1) * 0.06);
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660 * rate, now);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    osc.connect(g); g.connect(masterGain);
    g.gain.exponentialRampToValueAtTime(0.06 * vol, now + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.start(now); osc.stop(now + 0.16);
  }

  /* ===========================================
     POWERUPS
  ============================================ */
  function triggerPower(type) {
    spawnPopup((snake[0].x + 0.5) * BOX, (snake[0].y + 0.5) * BOX, `!${type}`, combo);
    const effect = { type, remain: type === 'glitch' ? 600 : (type === 'wave' ? 1200 : 1400) };
    powerupEffects.push(effect);
    applyEffect(type);
  }

  function applyEffect(type) {
    if (!canvas) return;
    if (type === 'glitch') canvas.classList.add('canvas-glitch');
    if (type === 'wave') canvas.classList.add('canvas-wave');
    if (type === 'dizzy') canvas.classList.add('canvas-dizzy');
  }

  function removeEffect(type) {
    if (!canvas) return;
    if (type === 'glitch') canvas.classList.remove('canvas-glitch');
    if (type === 'wave') canvas.classList.remove('canvas-wave');
    if (type === 'dizzy') canvas.classList.remove('canvas-dizzy');
  }

  /* ===========================================
     DRAW & STEP (core)
  ============================================ */
  function init() {
    snake = [{ x: Math.floor(GRID_W / 2), y: Math.floor(GRID_H / 2) }];
    direction = 'RIGHT';
    foods = []; spawnFoods();
    score = 0; speed = baseSpeed;
    updateScoreDisplays();
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';
    combo = 0; hideCombo();
    particles = []; trailParticles = []; popups = [];
    powerupEffects = []; borderTraps = [];
    paused = false;
    if (pauseBtn) pauseBtn.textContent = 'PAUSE';
    clearInterval(intervalId); intervalId = null;
    startBgCycle(); draw();
  }

  function draw() {
    if (!ctx || !canvas) return;
    ctx.fillStyle = document.body.classList.contains('modern') ? '#f7f8fa' : '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.lineWidth = 1;
    ctx.strokeStyle = document.body.classList.contains('modern') ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
    for (let gx = 0; gx < GRID_W; gx++) { ctx.beginPath(); ctx.moveTo(gx * BOX, 0); ctx.lineTo(gx * BOX, canvas.height); ctx.stroke(); }
    for (let gy = 0; gy < GRID_H; gy++) { ctx.beginPath(); ctx.moveTo(0, gy * BOX); ctx.lineTo(canvas.width, gy * BOX); ctx.stroke(); }

    // Foods
    for (const f of foods) {
      const lifeElapsed = Date.now() - f.created;
      if (lifeElapsed > FOOD_FADE_START) f.alpha = Math.max(0.08, Math.min(1, (f.life - (lifeElapsed - FOOD_FADE_START)) / (FOOD_LIFESPAN - FOOD_FADE_START)));
      else f.alpha = 1;
      ctx.save(); ctx.globalAlpha = f.alpha;
      let fill = document.body.classList.contains('modern') ? '#6b7280' : '#33ffcc';
      if (f.power === 'glitch') fill = '#ff66ff';
      if (f.power === 'wave') fill = '#ffd166';
      if (f.power === 'dizzy') fill = '#66ff88';
      ctx.fillStyle = fill;
      ctx.shadowBlur = document.body.classList.contains('modern') ? 6 * f.alpha : 10 * f.alpha;
      ctx.shadowColor = ctx.fillStyle;
      const inset = Math.round((1 - f.alpha) * 6);
      ctx.fillRect(f.x * BOX + 2 + inset / 2, f.y * BOX + 2 + inset / 2, BOX - 4 - inset, BOX - 4 - inset);
      if (f.power) {
        ctx.font = "10px 'Press Start 2P'";
        ctx.fillStyle = document.body.classList.contains('modern') ? '#fff' : '#000';
        ctx.textAlign = "center";
        ctx.fillText(f.power[0].toUpperCase(), f.x * BOX + BOX / 2, f.y * BOX + BOX / 2 + 4);
      }
      ctx.restore();
    }

    // Snake
    for (let i = 0; i < snake.length; i++) {
      ctx.save();
      ctx.fillStyle = i === 0
        ? (document.body.classList.contains('modern') ? '#111827' : '#ff66ff')
        : (document.body.classList.contains('modern') ? '#374151' : '#802080');
      ctx.shadowBlur = document.body.classList.contains('modern') ? 0 : 10;
      ctx.shadowColor = '#ff33cc';
      ctx.fillRect(snake[i].x * BOX, snake[i].y * BOX, BOX - 1, BOX - 1);
      ctx.restore();
    }

    drawParticles();
    drawPopups();
    drawBorderTraps();
  }

  function step() {
    if (paused) return;

    // Food expiration and respawn
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      const elapsed = Date.now() - f.created;
      f.life = Math.max(0, FOOD_LIFESPAN - elapsed);
      if (f.life <= 0) respawnFoodAtIndex(i);
    }

    // Effects expiration
    for (let i = powerupEffects.length - 1; i >= 0; i--) {
      powerupEffects[i].remain -= Math.max(16, speed);
      if (powerupEffects[i].remain <= 0) {
        removeEffect(powerupEffects[i].type);
        powerupEffects.splice(i, 1);
      }
    }

    // Border traps expiry removal
    for (let i = borderTraps.length - 1; i >= 0; i--) {
      if (Date.now() > borderTraps[i].expires) {
        if (borderTraps[i]._el) try { borderTraps[i]._el.remove(); } catch(e) {}
        borderTraps.splice(i, 1);
      }
    }

    // Move head
    const head = { ...snake[0] };
    if (direction === 'UP') head.y--;
    if (direction === 'DOWN') head.y++;
    if (direction === 'LEFT') head.x--;
    if (direction === 'RIGHT') head.x++;
    head.x = (head.x + GRID_W) % GRID_W;
    head.y = (head.y + GRID_H) % GRID_H;

    // Trap collision
    if (borderTraps.length > 0) {
      for (const t of borderTraps) if (pointInTrap(head, t)) return gameOver();
    }

    // Self collision
    if (snake.some(p => p.x === head.x && p.y === head.y)) return gameOver();

    // Food collision
    let eatenIndex = -1;
    for (let i = 0; i < foods.length; i++) if (head.x === foods[i].x && head.y === foods[i].y) { eatenIndex = i; break; }

    if (eatenIndex >= 0) {
      const eaten = foods[eatenIndex];
      score += eaten.points;
      updateScoreDisplays();
      const px = (eaten.x + 0.5) * BOX, py = (eaten.y + 0.5) * BOX;
      handleComboAndPlay();
      spawnParticles(px, py);
      spawnPopup(px, py, `+${eaten.points}`, combo);
      if (particleConfig.trail) spawnTrailBurst(px, py);
      if (eaten.power) triggerPower(eaten.power);
      applyDifficultyScaling();
      respawnFoodAtIndex(eatenIndex);
    } else {
      snake.pop();
    }

    snake.unshift(head);
    if (particleConfig.trail) spawnTrailAtSnake();
    draw();
  }

  /* ===========================================
     CONTROLS & INPUT
  ============================================ */
  const keyMap = {
    ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
    w: 'UP', a: 'LEFT', s: 'DOWN', d: 'RIGHT',
    W: 'UP', A: 'LEFT', S: 'DOWN', D: 'RIGHT'
  };

  document.addEventListener('keydown', e => {
    if (e.key === 'p' || e.key === 'P') togglePause();
    const nd = keyMap[e.key];
    if (nd) {
      if ((direction === 'UP' && nd === 'DOWN') || (direction === 'DOWN' && nd === 'UP') || (direction === 'LEFT' && nd === 'RIGHT') || (direction === 'RIGHT' && nd === 'LEFT')) return;
      direction = nd;
    }
  });

  // touch swipe control
  let tsX = 0, tsY = 0;
  if (canvas) {
    canvas.addEventListener('touchstart', e => {
      const t = e.changedTouches[0];
      tsX = t.clientX; tsY = t.clientY;
    }, { passive: true });

    canvas.addEventListener('touchend', e => {
      const t = e.changedTouches[0];
      const dx = t.clientX - tsX, dy = t.clientY - tsY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 24) { dx > 0 ? trySetDir('RIGHT') : trySetDir('LEFT'); }
      else if (Math.abs(dy) > 24) { dy > 0 ? trySetDir('DOWN') : trySetDir('UP'); }
    }, { passive: true });
  }

  function trySetDir(nd) {
    if ((direction === 'UP' && nd === 'DOWN') || (direction === 'DOWN' && nd === 'UP') || (direction === 'LEFT' && nd === 'RIGHT') || (direction === 'RIGHT' && nd === 'LEFT')) return;
    direction = nd;
  }

  /* Pause / resume */
  if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
  function togglePause() {
    paused = !paused;
    if (paused) {
      if (pauseBtn) pauseBtn.textContent = 'RESUME';
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    } else {
      if (pauseBtn) pauseBtn.textContent = 'PAUSE';
      restartInterval();
    }
  }

  /* Particle / UI bindings */
  if (particleCountMul) particleCountMul.addEventListener('input', () => {
    particleConfig.countMul = Number(particleCountMul.value);
    if (countMulLabel) countMulLabel.textContent = particleConfig.countMul.toFixed(2);
  });
  if (particleSize) particleSize.addEventListener('input', () => {
    particleConfig.size = Number(particleSize.value); if (sizeLabel) sizeLabel.textContent = particleConfig.size.toFixed(1);
  });
  if (trailToggle) trailToggle.addEventListener('change', () => { particleConfig.trail = trailToggle.checked; });
  colorSwatches.forEach(s => {
    s.addEventListener('click', () => {
      particleConfig.colorMode = s.dataset.color;
      colorSwatches.forEach(x => x.classList.remove('selected'));
      s.classList.add('selected');
      updateSwatchBorders();
    });
  });
  if (colorSwatches[0]) colorSwatches[0].classList.add('selected');
  if (volRange) volRange.addEventListener('input', () => { if (masterGain) masterGain.gain.value = (volRange.value / 100); });

  function updateSwatchBorders() {
    colorSwatches.forEach(x => x.classList.remove('selected'));
    for (const s of colorSwatches) if (s.dataset.color === particleConfig.colorMode) { s.classList.add('selected'); break; }
  }

  /* ===========================================
     DIFFICULTY & INTERVAL MANAGEMENT
  ============================================ */
  function applyDifficultyScaling() {
    const steps = Math.floor(score / 30);
    const factor = Math.pow(0.94, steps);
    const newSpeed = Math.max(38, Math.round(baseSpeed * factor));
    if (newSpeed !== speed) { speed = newSpeed; restartInterval(); }
  }

  function startGame() {
    init();
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(step, speed);
  }
  function restartInterval() {
    if (intervalId) clearInterval(intervalId);
    if (!paused) intervalId = setInterval(step, speed);
  }
  function restartGame() {
    if (intervalId) clearInterval(intervalId);
    init();
    startGame();
  }

  /* ===========================================
     GAME OVER FLOW
  ============================================ */
  function gameOver() {
    if (intervalId) clearInterval(intervalId);
    if (finalScore) finalScore.textContent = `Score: ${score}`;
    if (score > getBest()) setBest(score);
    if (bestScore) bestScore.textContent = `Best: ${getBest()}`;
    if (bestBoard) bestBoard.textContent = `Best: ${getBest()}`;
    if (gameOverOverlay) gameOverOverlay.style.display = 'flex';
  }

 // if (playAgainBtn) playAgainBtn.addEventListener('click', () => {
   // if (gameOverOverlay) gameOverOverlay.style.display = 'none';
    //init();
    //startGame();
  //});

  if (backToLevelBtn) backToLevelBtn.addEventListener('click', () => {
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';
    setTimeout(() => { if (levelOverlay) levelOverlay.style.display = 'flex'; }, 300);
  });

  /* scoreboard update */
  function updateScoreDisplays() {
    if (scoreBoard) scoreBoard.textContent = `Score: ${score}`;
    if (bestBoard) bestBoard.textContent = `Best: ${getBest()}`;
  }

  /* scheduling: maintain foods, occasional powerups and traps */
  setInterval(() => {
    if (paused) return;
    if (foods.length < DEFAULT_FOOD_COUNT) spawnFoods();
    if (Math.random() < 0.03 && foods.length < 3) {
      const existing = new Set(foods.map(f => cellKey(f)));
      const pos = randomFreeCellUnique(existing);
      foods.push({ x: pos.x, y: pos.y, points: 1, life: FOOD_LIFESPAN, created: Date.now(), alpha: 1, power: pickRandomPower() });
    }
    if (activeLevelLabel.toLowerCase() === 'insane' && Math.random() < 0.18) scheduleTrapWithWarning();
  }, 1400);

  /* ===========================================
     BACKGROUND CYCLE / MODES
  ============================================ */
  function startBgCycle() {
    if (bgParticlesEl) bgParticlesEl.innerHTML = '';
    if (bgGradientEl) bgGradientEl.innerHTML = '';
    const mode = ['A','B','C'][Math.floor(Math.random()*3)];
    applyBgMode(mode);
    if (bgModeTimer) clearTimeout(bgModeTimer);
    bgModeTimer = setTimeout(startBgCycle, 6000 + Math.random()*8000);
  }

  function applyBgMode(mode) {
    if (!bgParticlesEl || !bgGradientEl) return;
    bgParticlesEl.innerHTML = ''; bgGradientEl.innerHTML = '';
    if (mode === 'A') {
      bgGradientEl.style.background = 'linear-gradient(120deg, rgba(255,20,140,0.06), rgba(51,255,214,0.04))';
      bgGradientEl.style.position = 'absolute'; bgGradientEl.style.inset = '0'; bgGradientEl.style.filter = 'blur(28px)';
    } else if (mode === 'B') {
      for (let i = 0; i < 16; i++) {
        const p = document.createElement('div'); const size = 6 + Math.random() * 18;
        p.style.position = 'absolute'; p.style.left = `${Math.random()*100}%`; p.style.top = `${Math.random()*100}%`;
        p.style.width = `${size}px`; p.style.height = `${size}px`; p.style.borderRadius = '50%';
        p.style.opacity = 0.06 + Math.random() * 0.14;
        p.style.background = Math.random() < 0.5 ? 'rgba(255,20,140,0.9)' : 'rgba(51,255,214,0.9)';
        p.style.animation = `floaty ${8 + Math.random()*8}s ease-in-out ${Math.random()*2}s infinite`;
        bgParticlesEl.appendChild(p);
      }
    } else {
      const g = document.createElement('div');
      g.style.position = 'absolute'; g.style.inset = '0';
      g.style.backgroundImage = `linear-gradient(0deg, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`;
      g.style.backgroundSize = '24px 24px'; g.style.opacity = '0.07';
      g.style.animation = 'gradientShift 10s linear infinite';
      bgGradientEl.appendChild(g);
    }
  }

  /* ===========================================
     SAFE INIT
  ============================================ */
  if (countMulLabel) countMulLabel.textContent = particleConfig.countMul.toFixed(2);
  if (sizeLabel) sizeLabel.textContent = particleConfig.size.toFixed(1);
  applyTheme('retro');
  init();
  draw();

  /* window focus/blur safety */
  window.addEventListener('blur', () => { if (intervalId) clearInterval(intervalId); });
  window.addEventListener('focus', () => { if (!paused && !intervalId) restartInterval(); });

}); // end DOMContentLoaded

