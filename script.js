const $ = (id) => document.getElementById(id);
const board = $("board"), menu = $("menu"), hammer = $("hammer"), toast = $("toast");
const MAX_LIVES = 3, HITS_PER_LEVEL = 8;

let holes = [], score, hits, level, combo, lives, running = false, spawnTimer;
let best = 0, muted = false;
try { best = Number(localStorage.getItem("maulwurf-best")) || 0; } catch (e) {}
$("bestMenu").textContent = best;

/* ---------- Sound (synthetisch, keine Dateien nötig) ---------- */
let ac;
function tone(f, d = 0.12, type = "square", slide = 0, vol = 0.08) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d);
  } catch (e) {}
}
const sfx = {
  hit: () => tone(300 + combo * 40, 0.1, "square", 250),
  gold: () => { tone(660, 0.1, "triangle"); setTimeout(() => tone(990, 0.18, "triangle"), 90); },
  miss: () => tone(140, 0.15, "sawtooth", -60),
  bomb: () => tone(120, 0.4, "sawtooth", -80, 0.15),
  level: () => [440, 554, 660, 880].forEach((f, i) => setTimeout(() => tone(f, 0.12, "triangle"), i * 80)),
  over: () => [400, 330, 260, 180].forEach((f, i) => setTimeout(() => tone(f, 0.2, "sawtooth"), i * 150)),
};
$("mute").onclick = () => {
  muted = !muted;
  $("mute").classList.toggle("off", muted);
  $("mute").setAttribute("aria-pressed", muted);
  $("mute").setAttribute("aria-label", muted ? "Ton einschalten" : "Ton ausschalten");
};

/* ---------- Spielfeld ---------- */
for (let i = 0; i < 9; i++) {
  const el = document.createElement("div");
  el.className = "hole"; el.tabIndex = 0;
  el.innerHTML = '<div class="spot"><div class="pit"><div class="back"></div><div class="mole"><span class="eye"></span><span class="eye"></span><span class="nose"></span><span class="teeth"></span></div><div class="lip"></div></div></div>';
  const h = { el, mole: el.querySelector(".mole"), up: false, hit: false, type: "mole", timer: 0 };
  el.addEventListener("pointerdown", (e) => { moveHammer(e); swing(); whack(h, e.clientX, e.clientY); });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const r = el.getBoundingClientRect(); swing(); whack(h, r.left + r.width / 2, r.top); }
  });
  board.appendChild(el); holes.push(h);
}

/* ---------- Hammer-Cursor ---------- */
function moveHammer(e) { hammer.style.left = e.clientX + "px"; hammer.style.top = e.clientY + "px"; hammer.classList.add("show"); }
window.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") moveHammer(e); });
window.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") setTimeout(() => hammer.classList.remove("show"), 250); });
function swing() { hammer.classList.remove("swing"); void hammer.offsetWidth; hammer.classList.add("swing"); }

/* ---------- Schwierigkeit ---------- */
const stayTime = () => Math.max(380, 2000 - level * 150);
const gapTime = () => Math.max(220, 1400 - level * 100);
const maxUp = () => Math.min(3, 1 + Math.floor(level / 4));

function spawn() {
  if (!running) return;
  const free = holes.filter((h) => !h.up);
  if (free.length && holes.length - free.length < maxUp()) {
    const h = free[Math.floor(Math.random() * free.length)];
    const r = Math.random();
    h.type = level >= 3 && r < 0.13 ? "bomb" : r < 0.22 ? "gold" : "mole";
    h.mole.className = "mole " + (h.type === "mole" ? "" : h.type);
    h.up = true; h.hit = false;
    h.el.classList.remove("hit"); h.el.classList.add("up");
    h.timer = setTimeout(() => escape(h), h.type === "gold" ? stayTime() * 0.7 : stayTime());
  }
  spawnTimer = setTimeout(spawn, gapTime() * (0.7 + Math.random() * 0.6));
}

function down(h) { h.up = false; clearTimeout(h.timer); h.el.classList.remove("up", "hit"); }

function escape(h) {
  down(h);
  if (h.type === "mole") { sfx.miss(); resetCombo(); loseLife(); }
}

/* ---------- Treffer ---------- */
function whack(h, x, y) {
  if (!running) return;
  if (!h.up || h.hit) { resetCombo(); return; }
  h.hit = true; h.el.classList.add("hit");
  clearTimeout(h.timer);
  setTimeout(() => down(h), 160);
  burst(x, y, h.type === "gold" ? "#ffc94a" : h.type === "bomb" ? "#ff5a5f" : "#b98560");

  if (h.type === "bomb") {
    sfx.bomb(); pop(x, y, "BUMM!", "#ff5a5f"); shake(); resetCombo(); loseLife(); return;
  }
  combo = Math.min(5, combo + 1);
  const pts = (h.type === "gold" ? 5 : 1) * combo;
  score += pts; hits++;
  h.type === "gold" ? sfx.gold() : sfx.hit();
  pop(x, y, "+" + pts);
  const newLevel = 1 + Math.floor(hits / HITS_PER_LEVEL);
  if (newLevel > level) { level = newLevel; sfx.level(); showToast("Level " + level + "!"); }
  updateHud();
}

function resetCombo() { combo = 0; updateHud(); }
function loseLife() {
  lives--; shake(); updateHud();
  if (lives <= 0) endGame();
}

/* ---------- Effekte ---------- */
function pop(x, y, text, color) {
  const p = document.createElement("div");
  p.className = "pop"; p.textContent = text; p.style.left = x - 20 + "px"; p.style.top = y - 30 + "px";
  if (color) p.style.color = color;
  document.body.appendChild(p);
  p.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(-50px)", opacity: 0 }], { duration: 700, easing: "ease-out" }).onfinish = () => p.remove();
}
function burst(x, y, color) {
  for (let i = 0; i < 9; i++) {
    const b = document.createElement("div");
    b.className = "bit"; b.style.background = color; b.style.left = x + "px"; b.style.top = y + "px";
    document.body.appendChild(b);
    const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 50;
    b.animate([{ transform: "translate(0,0)", opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(.3)`, opacity: 0 }], { duration: 500, easing: "ease-out" }).onfinish = () => b.remove();
  }
}
function shake() { board.classList.remove("shake"); void board.offsetWidth; board.classList.add("shake"); }
function showToast(t) { toast.textContent = t; toast.classList.remove("show"); void toast.offsetWidth; toast.classList.add("show"); }

const HEART = '<svg viewBox="0 0 24 24" class="heart%C"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>';
let shownScore = -1;
function updateHud() {
  const sc = $("score");
  sc.textContent = score;
  if (score !== shownScore && score > 0) { sc.classList.remove("bump"); void sc.offsetWidth; sc.classList.add("bump"); }
  shownScore = score;
  $("level").textContent = level;
  $("bar").style.width = ((hits % HITS_PER_LEVEL) / HITS_PER_LEVEL) * 100 + "%";
  $("combo").textContent = "x" + Math.max(1, combo);
  $("combo").classList.toggle("hot", combo >= 3);
  let hearts = "";
  for (let k = 0; k < MAX_LIVES; k++) hearts += HEART.replace("%C", k < lives ? "" : " lost");
  $("lives").innerHTML = hearts;
}

/* ---------- Ablauf ---------- */
function startGame() {
  holes.forEach(down);
  score = 0; hits = 0; level = 1; combo = 0; lives = MAX_LIVES; running = true;
  updateHud(); menu.classList.add("hidden");
  clearTimeout(spawnTimer); spawnTimer = setTimeout(spawn, 900);
}

function endGame() {
  running = false; clearTimeout(spawnTimer);
  holes.forEach(down); sfx.over();
  const neu = score > best;
  if (neu) { best = score; try { localStorage.setItem("maulwurf-best", best); } catch (e) {} }
  $("bestMenu").textContent = best; $("rBest").textContent = best;
  $("rScore").textContent = score; $("rLevel").textContent = level;
  $("title").innerHTML = neu ? "Neuer<br>Rekord!" : "Game<br>Over";
  $("sub").textContent = neu ? "Stark gespielt!" : "Die Maulwürfe haben gewonnen. Diesmal.";
  $("start").textContent = "Nochmal";
  menu.classList.add("over");
  setTimeout(() => {
    menu.classList.remove("hidden"); $("start").focus();
    if (neu) for (let k = 0; k < 8; k++) setTimeout(() => burst(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * (0.15 + Math.random() * 0.4), k % 2 ? "#ffc94a" : "#ff5a5f"), k * 120);
  }, 500);
}

$("start").onclick = startGame;
updateHud();