import {
  BLACK,
  EMPTY,
  WHITE,
  analyzeMove,
  atariStones,
  coordinateLabel,
  createGame,
  opponent,
  passTurn,
  playMove,
  pointOf,
  scoreArea,
  undo,
} from './go-engine.js';
import { chooseAiMove, difficultyLabel, recommendMove } from './ai.js';

const $ = (id) => document.getElementById(id);
const canvas = $('board');
const ctx = canvas.getContext('2d');
const STORAGE_KEY = 'gogame:match:v1';

let settings = {
  mode: 'ai',
  size: 9,
  playerColor: BLACK,
  difficulty: 'normal',
  helpers: true,
};
let game = createGame(settings.size);
let hoverIndex = null;
let hintMove = null;
let aiThinking = false;
let soundEnabled = true;
let audioContext = null;
let metrics = { width: 0, margin: 0, gap: 0 };
let toastTimer = null;

function colorName(color) { return color === BLACK ? '흑' : '백'; }
function isHumanTurn() { return settings.mode === 'pvp' || game.current === settings.playerColor; }
function aiColor() { return opponent(settings.playerColor); }
function occupiedRatio() { return game.board.filter((value) => value !== EMPTY).length / game.board.length; }

function ensureAudio() {
  if (!audioContext && 'AudioContext' in window) audioContext = new AudioContext();
  if (audioContext?.state === 'suspended') audioContext.resume();
}

function tone(frequency = 220, duration = 0.045, gain = 0.035) {
  if (!soundEnabled) return;
  ensureAudio();
  if (!audioContext) return;
  const oscillator = audioContext.createOscillator();
  const volume = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  volume.gain.setValueAtTime(gain, audioContext.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(volume).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function playStoneSound(captured = 0) {
  tone(captured ? 170 : 205, captured ? 0.075 : 0.045, captured ? 0.055 : 0.035);
  if (captured) setTimeout(() => tone(270, 0.05, 0.025), 38);
  if (navigator.vibrate) navigator.vibrate(captured ? [18, 22, 24] : 12);
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function coach(message) { $('coachText').textContent = message; }

function starPoints(size) {
  if (size === 9) return [[2,2],[6,2],[4,4],[2,6],[6,6]];
  if (size === 13) return [[3,3],[9,3],[6,6],[3,9],[9,9]];
  const points = [];
  for (const y of [3,9,15]) for (const x of [3,9,15]) points.push([x,y]);
  return points;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(260, rect.width);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(width * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  metrics.width = width;
  metrics.margin = width * (game.size === 19 ? 0.052 : 0.065);
  metrics.gap = (width - metrics.margin * 2) / (game.size - 1);
  drawBoard();
}

function pointXY(index) {
  const { x, y } = pointOf(game.size, index);
  return { x: metrics.margin + x * metrics.gap, y: metrics.margin + y * metrics.gap };
}

function drawStone(index, color, alpha = 1) {
  const { x, y } = pointXY(index);
  const radius = Math.max(5, metrics.gap * 0.44);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(0,0,0,.38)';
  ctx.shadowBlur = radius * 0.32;
  ctx.shadowOffsetY = radius * 0.13;
  const gradient = ctx.createRadialGradient(x - radius * .28, y - radius * .3, radius * .08, x, y, radius);
  if (color === BLACK) {
    gradient.addColorStop(0, '#555951'); gradient.addColorStop(.38, '#22251f'); gradient.addColorStop(1, '#080908');
  } else {
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.42, '#f3f0e8'); gradient.addColorStop(1, '#b8b5ac');
  }
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBoard() {
  if (!metrics.width) return;
  const { width, margin, gap } = metrics;
  ctx.clearRect(0, 0, width, width);

  const wood = ctx.createLinearGradient(0, 0, width, width);
  wood.addColorStop(0, '#d6a85d'); wood.addColorStop(.52, '#c99549'); wood.addColorStop(1, '#b77d37');
  ctx.fillStyle = wood; ctx.fillRect(0, 0, width, width);

  ctx.save();
  ctx.globalAlpha = .12;
  ctx.strokeStyle = '#6f4724';
  for (let y = 14; y < width; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(y) * 2);
    ctx.bezierCurveTo(width * .3, y - 3, width * .66, y + 4, width, y - 1);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(38,27,16,.78)';
  ctx.lineWidth = Math.max(1, gap * .022);
  for (let i = 0; i < game.size; i += 1) {
    const p = margin + i * gap;
    ctx.beginPath(); ctx.moveTo(margin, p); ctx.lineTo(width - margin, p); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p, margin); ctx.lineTo(p, width - margin); ctx.stroke();
  }

  ctx.fillStyle = 'rgba(32,22,13,.82)';
  for (const [sx, sy] of starPoints(game.size)) {
    ctx.beginPath();
    ctx.arc(margin + sx * gap, margin + sy * gap, Math.max(2.2, gap * .065), 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < game.board.length; i += 1) {
    if (game.board[i] !== EMPTY) drawStone(i, game.board[i]);
  }

  if (settings.helpers) {
    const atari = atariStones(game);
    ctx.strokeStyle = 'rgba(183,56,45,.9)';
    ctx.lineWidth = Math.max(2, gap * .055);
    for (const index of atari) {
      const { x, y } = pointXY(index);
      ctx.beginPath(); ctx.arc(x, y, gap * .47, 0, Math.PI * 2); ctx.stroke();
    }
  }

  if (game.lastMove !== null && game.board[game.lastMove] !== EMPTY) {
    const { x, y } = pointXY(game.lastMove);
    ctx.strokeStyle = game.board[game.lastMove] === BLACK ? '#d9c9a6' : '#70533b';
    ctx.lineWidth = Math.max(1.5, gap * .04);
    ctx.beginPath(); ctx.arc(x, y, Math.max(3, gap * .105), 0, Math.PI * 2); ctx.stroke();
  }

  if (hintMove !== null && game.board[hintMove] === EMPTY) {
    const { x, y } = pointXY(hintMove);
    ctx.save();
    ctx.strokeStyle = '#f0d789'; ctx.fillStyle = 'rgba(240,215,137,.28)'; ctx.lineWidth = Math.max(2, gap * .06);
    ctx.beginPath(); ctx.arc(x, y, gap * .25, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  if (hoverIndex !== null && isHumanTurn() && !aiThinking && game.board[hoverIndex] === EMPTY) {
    const analysis = analyzeMove(game, hoverIndex);
    if (analysis.legal) drawStone(hoverIndex, game.current, .42);
  }
}

function indexFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  const x = Math.round((px - metrics.margin) / metrics.gap);
  const y = Math.round((py - metrics.margin) / metrics.gap);
  if (x < 0 || y < 0 || x >= game.size || y >= game.size) return null;
  const ix = metrics.margin + x * metrics.gap;
  const iy = metrics.margin + y * metrics.gap;
  if (Math.hypot(px - ix, py - iy) > metrics.gap * .48) return null;
  return y * game.size + x;
}

function updateUI() {
  const whiteTurn = game.current === WHITE;
  $('turnStone').parentElement.classList.toggle('white', whiteTurn);
  $('turnText').textContent = game.gameOver ? '대국 종료' : `${colorName(game.current)} 차례`;
  $('moveNumber').textContent = `${game.moveNumber}수`;
  $('lastMoveText').textContent = game.lastMove === null ? (game.passes ? '방금 패스' : '첫 수를 두세요') : `마지막 ${coordinateLabel(game.size, game.lastMove)}`;
  $('blackCaptures').textContent = game.captures[BLACK];
  $('whiteCaptures').textContent = game.captures[WHITE];
  $('thinking').hidden = !aiThinking;
  $('helperToggle').checked = settings.helpers;

  const aiMode = settings.mode === 'ai';
  $('colorField').hidden = !aiMode;
  $('difficultyField').hidden = !aiMode;
  if (aiMode) {
    const human = settings.playerColor;
    $('blackName').textContent = human === BLACK ? '나' : `AI · ${difficultyLabel(settings.difficulty)}`;
    $('whiteName').textContent = human === WHITE ? '나' : `AI · ${difficultyLabel(settings.difficulty)}`;
  } else {
    $('blackName').textContent = '플레이어 1'; $('whiteName').textContent = '플레이어 2';
  }

  drawBoard();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, game }));
    $('saveState').textContent = '자동 저장됨';
  } catch { $('saveState').textContent = '저장 불가'; }
}

function restoreSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved?.game?.board || ![9,13,19].includes(saved.game.size)) return false;
    settings = { ...settings, ...saved.settings };
    game = saved.game;
    if (!Array.isArray(game.undoStack)) game.undoStack = [];
    $('boardSize').value = String(settings.size);
    $('playerColor').value = String(settings.playerColor);
    $('difficulty').value = settings.difficulty;
    [...$('modeSegment').querySelectorAll('button')].forEach((button) => button.classList.toggle('active', button.dataset.mode === settings.mode));
    showToast('지난 대국을 이어갑니다.');
    return true;
  } catch { return false; }
}

function afterAction(message = '') {
  hintMove = null;
  updateUI();
  persist();
  if (message) coach(message);
  if (game.gameOver) showScore(true);
}

function humanMove(index) {
  if (aiThinking || game.gameOver || !isHumanTurn()) return;
  const result = playMove(game, index);
  if (!result.ok) { showToast(result.reason); tone(110, .05, .025); return; }
  playStoneSound(result.captured.length);
  const note = result.captured.length
    ? `${result.captured.length}개의 돌을 잡았습니다. 흐름이 좋아요.`
    : result.liberties === 1
      ? '이 돌은 활로가 하나뿐입니다. 단수에 몰리지 않게 살펴보세요.'
      : `${coordinateLabel(game.size, index)}에 착수했습니다. 상대의 다음 수를 읽어보세요.`;
  afterAction(note);
  if (settings.mode === 'ai') scheduleAiTurn();
}

function shouldAiPass() {
  if (game.passes === 1 && occupiedRatio() > .54) return true;
  return false;
}

function scheduleAiTurn() {
  if (settings.mode !== 'ai' || game.gameOver || game.current !== aiColor()) return;
  aiThinking = true; updateUI();
  const delay = settings.difficulty === 'hard' ? 520 : 360;
  setTimeout(() => {
    if (game.gameOver || settings.mode !== 'ai') { aiThinking = false; updateUI(); return; }
    let move = null;
    if (!shouldAiPass()) move = chooseAiMove(game, settings.difficulty, game.current);
    if (move === null) {
      passTurn(game);
      tone(145, .055, .025);
      aiThinking = false;
      afterAction('AI가 패스했습니다. 서로 한 번 더 패스하면 대국이 끝납니다.');
      return;
    }
    const result = playMove(game, move);
    aiThinking = false;
    if (result.ok) {
      playStoneSound(result.captured.length);
      afterAction(result.captured.length ? `AI가 ${result.captured.length}개의 돌을 잡았습니다. 연결과 활로를 확인해 보세요.` : `AI가 ${coordinateLabel(game.size, move)}에 두었습니다.`);
    } else updateUI();
  }, delay);
}

function startNewGame(force = false) {
  if (!force && game.moveNumber > 3 && !window.confirm('현재 대국을 끝내고 새 판을 시작할까요?')) return;
  settings.size = Number($('boardSize').value);
  settings.playerColor = Number($('playerColor').value);
  settings.difficulty = $('difficulty').value;
  game = createGame(settings.size);
  hoverIndex = null; hintMove = null; aiThinking = false;
  coach(settings.mode === 'ai' ? `AI ${difficultyLabel(settings.difficulty)} 난이도입니다. 모서리부터 차분히 시작해 보세요.` : '두 사람이 번갈아 두는 모드입니다. 흑부터 시작합니다.');
  updateUI(); persist(); resizeCanvas();
  if (settings.mode === 'ai' && settings.playerColor === WHITE) scheduleAiTurn();
}

function doUndo() {
  if (aiThinking) { showToast('AI가 수를 읽고 있습니다.'); return; }
  if (!game.undoStack.length) { showToast('무를 수가 없습니다.'); return; }
  undo(game);
  if (settings.mode === 'ai' && game.undoStack.length && game.current !== settings.playerColor) undo(game);
  game.gameOver = false;
  afterAction('한 수 전으로 돌아왔습니다. 다른 길을 찾아보세요.');
}

function doPass() {
  if (aiThinking || game.gameOver || !isHumanTurn()) return;
  const result = passTurn(game);
  if (!result.ok) return;
  tone(145, .055, .025);
  afterAction(game.gameOver ? '서로 두 번 패스했습니다. 계가합니다.' : `${colorName(result.color)}이 패스했습니다.`);
  if (!game.gameOver && settings.mode === 'ai') scheduleAiTurn();
}

function doHint() {
  if (aiThinking || game.gameOver || !isHumanTurn()) return;
  hintMove = recommendMove(game, game.current);
  if (hintMove === null) { showToast('추천할 합법수가 없습니다. 패스를 고려하세요.'); return; }
  drawBoard();
  coach(`추천수는 ${coordinateLabel(game.size, hintMove)}입니다. 정답이라기보다 따냄·활로·형태를 고려한 후보수예요.`);
  showToast(`추천수 · ${coordinateLabel(game.size, hintMove)}`);
}

function showScore(final = false) {
  const score = scoreArea(game);
  $('scoreKicker').textContent = final ? 'FINAL SCORE' : '현재 계가 예상';
  $('blackScore').textContent = score.black.toFixed(1).replace('.0','');
  $('whiteScore').textContent = score.white.toFixed(1).replace('.0','');
  $('blackScoreDetail').textContent = `돌 ${score.blackStones} + 집 ${score.blackTerritory}`;
  $('whiteScoreDetail').textContent = `돌 ${score.whiteStones} + 집 ${score.whiteTerritory} + 덤 ${score.komi}`;
  $('scoreHeadline').textContent = score.winner === EMPTY ? '현재 동점입니다.' : `${colorName(score.winner)}이 ${score.diff.toFixed(1)}집 앞서고 있어요.`;
  const dialog = $('scoreDialog');
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open','');
}

function setMode(mode) {
  settings.mode = mode;
  [...$('modeSegment').querySelectorAll('button')].forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  updateUI();
}

canvas.addEventListener('pointermove', (event) => { hoverIndex = indexFromPointer(event); drawBoard(); });
canvas.addEventListener('pointerleave', () => { hoverIndex = null; drawBoard(); });
canvas.addEventListener('pointerup', (event) => {
  ensureAudio();
  const index = indexFromPointer(event);
  if (index !== null) humanMove(index);
});

$('modeSegment').addEventListener('click', (event) => { const button = event.target.closest('button[data-mode]'); if (button) setMode(button.dataset.mode); });
$('newGameButton').addEventListener('click', () => startNewGame());
$('undoButton').addEventListener('click', doUndo); $('undoButtonMobile').addEventListener('click', doUndo);
$('hintButton').addEventListener('click', doHint); $('hintButtonMobile').addEventListener('click', doHint);
$('passButton').addEventListener('click', doPass); $('passButtonMobile').addEventListener('click', doPass);
$('scoreButton').addEventListener('click', () => showScore(false));
$('helperToggle').addEventListener('change', (event) => { settings.helpers = event.target.checked; hintMove = null; updateUI(); persist(); });
$('soundButton').addEventListener('click', () => { soundEnabled = !soundEnabled; $('soundButton').textContent = soundEnabled ? '♪' : '×'; showToast(soundEnabled ? '소리를 켰습니다.' : '소리를 껐습니다.'); });
$('rematchButton').addEventListener('click', () => setTimeout(() => startNewGame(true), 0));

window.addEventListener('keydown', (event) => {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
  if (event.key.toLowerCase() === 'u') doUndo();
  if (event.key.toLowerCase() === 'h') doHint();
  if (event.key.toLowerCase() === 'p') doPass();
  if (event.key.toLowerCase() === 's') showScore(false);
  if (event.key.toLowerCase() === 'n') startNewGame();
});
window.addEventListener('resize', resizeCanvas);

restoreSaved();
updateUI();
requestAnimationFrame(resizeCanvas);
if (settings.mode === 'ai' && settings.playerColor === WHITE && game.moveNumber === 0) scheduleAiTurn();
