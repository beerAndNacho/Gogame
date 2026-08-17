import {
  BLACK, EMPTY, WHITE, analyzeMove, atariStones, coordinateLabel, createGame,
  opponent, passTurn, playMove, pointOf, scoreArea, undo,
} from './go-engine.js';
import { chooseAiMove, difficultyLabel, recommendMove } from './ai.js';
import {
  O_BLACK, O_WHITE, analyzeOmokMove, createOmokGame, omokCoordinate,
  omokPoint, playOmokMove, undoOmok,
} from './omok-engine.js';
import { chooseOmokAiMove, omokDifficultyLabel, recommendOmokMove } from './omok-ai.js';

const $ = (id) => document.getElementById(id);
const canvas = $('board');
const ctx = canvas.getContext('2d');
const STORAGE_KEY = 'gogame:match:v2';

let settings = {
  gameType: 'go', mode: 'ai', size: 9, playerColor: BLACK,
  difficulty: 'normal', helpers: true, omokRule: 'forbidden',
};
let goGame = createGame(settings.size);
let omokGame = createOmokGame(settings.omokRule);
let hoverIndex = null;
let hintMove = null;
let aiThinking = false;
let soundEnabled = true;
let audioContext = null;
let metrics = { width: 0, margin: 0, gap: 0 };
let toastTimer = null;

const currentGame = () => settings.gameType === 'go' ? goGame : omokGame;
const isGo = () => settings.gameType === 'go';
const colorName = (color) => color === BLACK ? '흑' : '백';
const otherColor = (color) => color === BLACK ? WHITE : BLACK;
const aiColor = () => otherColor(settings.playerColor);
const isHumanTurn = () => settings.mode === 'pvp' || currentGame().current === settings.playerColor;
const currentDifficultyLabel = () => isGo() ? difficultyLabel(settings.difficulty) : omokDifficultyLabel(settings.difficulty);

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
  oscillator.type = 'sine'; oscillator.frequency.value = frequency;
  volume.gain.setValueAtTime(gain, audioContext.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(volume).connect(audioContext.destination);
  oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
}
function playStoneSound(strong = false) {
  tone(strong ? 170 : 205, strong ? 0.075 : 0.045, strong ? 0.055 : 0.035);
  if (strong) setTimeout(() => tone(270, 0.05, 0.025), 38);
  if (navigator.vibrate) navigator.vibrate(strong ? [18, 22, 24] : 12);
}
function showToast(message) {
  const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}
function coach(message) { $('coachText').textContent = message; }

function starPoints(size) {
  if (!isGo()) return [[3,3],[11,3],[7,7],[3,11],[11,11]];
  if (size === 9) return [[2,2],[6,2],[4,4],[2,6],[6,6]];
  if (size === 13) return [[3,3],[9,3],[6,6],[3,9],[9,9]];
  const points = [];
  for (const y of [3,9,15]) for (const x of [3,9,15]) points.push([x,y]);
  return points;
}
function pointFor(index) { return isGo() ? pointOf(currentGame().size, index) : omokPoint(currentGame().size, index); }
function coordinateFor(index) { return isGo() ? coordinateLabel(currentGame().size, index) : omokCoordinate(index); }
function analyzeCurrent(index) { return isGo() ? analyzeMove(goGame, index) : analyzeOmokMove(omokGame, index); }

function resizeCanvas() {
  const game = currentGame();
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(260, rect.width);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(width * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  metrics.width = width;
  metrics.margin = width * (game.size >= 15 ? 0.052 : 0.065);
  metrics.gap = (width - metrics.margin * 2) / (game.size - 1);
  drawBoard();
}
function pointXY(index) {
  const { x, y } = pointFor(index);
  return { x: metrics.margin + x * metrics.gap, y: metrics.margin + y * metrics.gap };
}
function drawStone(index, color, alpha = 1) {
  const { x, y } = pointXY(index);
  const radius = Math.max(5, metrics.gap * (isGo() ? 0.44 : 0.43));
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(0,0,0,.38)'; ctx.shadowBlur = radius * .32; ctx.shadowOffsetY = radius * .13;
  const gradient = ctx.createRadialGradient(x-radius*.28,y-radius*.3,radius*.08,x,y,radius);
  if (color === BLACK) { gradient.addColorStop(0,'#555951'); gradient.addColorStop(.38,'#22251f'); gradient.addColorStop(1,'#080908'); }
  else { gradient.addColorStop(0,'#ffffff'); gradient.addColorStop(.42,'#f3f0e8'); gradient.addColorStop(1,'#b8b5ac'); }
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.fill(); ctx.restore();
}
function drawBoard() {
  const game = currentGame();
  if (!metrics.width) return;
  const { width, margin, gap } = metrics;
  ctx.clearRect(0,0,width,width);
  const wood = ctx.createLinearGradient(0,0,width,width);
  wood.addColorStop(0,'#d6a85d'); wood.addColorStop(.52,'#c99549'); wood.addColorStop(1,'#b77d37');
  ctx.fillStyle=wood; ctx.fillRect(0,0,width,width);
  ctx.save(); ctx.globalAlpha=.12; ctx.strokeStyle='#6f4724';
  for(let y=14;y<width;y+=18){ctx.beginPath();ctx.moveTo(0,y+Math.sin(y)*2);ctx.bezierCurveTo(width*.3,y-3,width*.66,y+4,width,y-1);ctx.stroke();}
  ctx.restore();
  ctx.strokeStyle='rgba(38,27,16,.78)'; ctx.lineWidth=Math.max(1,gap*.022);
  for(let i=0;i<game.size;i+=1){const p=margin+i*gap;ctx.beginPath();ctx.moveTo(margin,p);ctx.lineTo(width-margin,p);ctx.stroke();ctx.beginPath();ctx.moveTo(p,margin);ctx.lineTo(p,width-margin);ctx.stroke();}
  ctx.fillStyle='rgba(32,22,13,.82)';
  for(const [sx,sy] of starPoints(game.size)){ctx.beginPath();ctx.arc(margin+sx*gap,margin+sy*gap,Math.max(2.2,gap*.065),0,Math.PI*2);ctx.fill();}
  for(let i=0;i<game.board.length;i+=1) if(game.board[i]!==EMPTY) drawStone(i,game.board[i]);

  if (isGo() && settings.helpers) {
    const atari=atariStones(goGame); ctx.strokeStyle='rgba(183,56,45,.9)'; ctx.lineWidth=Math.max(2,gap*.055);
    for(const index of atari){const {x,y}=pointXY(index);ctx.beginPath();ctx.arc(x,y,gap*.47,0,Math.PI*2);ctx.stroke();}
  }
  if(game.lastMove!==null && game.board[game.lastMove]!==EMPTY){
    const {x,y}=pointXY(game.lastMove);ctx.strokeStyle=game.board[game.lastMove]===BLACK?'#d9c9a6':'#70533b';ctx.lineWidth=Math.max(1.5,gap*.04);ctx.beginPath();ctx.arc(x,y,Math.max(3,gap*.105),0,Math.PI*2);ctx.stroke();
  }
  if(hintMove!==null && game.board[hintMove]===EMPTY){const {x,y}=pointXY(hintMove);ctx.save();ctx.strokeStyle='#f0d789';ctx.fillStyle='rgba(240,215,137,.28)';ctx.lineWidth=Math.max(2,gap*.06);ctx.beginPath();ctx.arc(x,y,gap*.25,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();}
  if(hoverIndex!==null && isHumanTurn() && !aiThinking && game.board[hoverIndex]===EMPTY){const analysis=analyzeCurrent(hoverIndex);if(analysis.legal)drawStone(hoverIndex,game.current,.42);}
}
function indexFromPointer(event) {
  const game=currentGame(),rect=canvas.getBoundingClientRect(),px=event.clientX-rect.left,py=event.clientY-rect.top;
  const x=Math.round((px-metrics.margin)/metrics.gap),y=Math.round((py-metrics.margin)/metrics.gap);
  if(x<0||y<0||x>=game.size||y>=game.size)return null;
  const ix=metrics.margin+x*metrics.gap,iy=metrics.margin+y*metrics.gap;
  if(Math.hypot(px-ix,py-iy)>metrics.gap*.48)return null;
  return y*game.size+x;
}

function updateContextLabels() {
  const go=isGo();
  $('gameSubtitle').textContent=go?'바둑 · 한 판 두자':'오목 · 다섯 돌의 승부';
  $('boardSizeField').hidden=!go; $('omokRuleField').hidden=go; $('komiRow').hidden=!go; $('omokRuleRow').hidden=go;
  document.querySelectorAll('.go-only').forEach(el=>{el.hidden=!go;});
  $('blackStatLabel').textContent=go?'잡음':'돌'; $('whiteStatLabel').textContent=go?'잡음':'돌';
  $('helperText').textContent=go?'단수 돌과 추천 위치를 표시합니다.':'추천수와 마지막 착수를 표시합니다.';
  $('setupHint').textContent=go?'판 크기와 AI를 고르세요':'15×15 · 자유룰/금수룰';
  $('omokRuleText').textContent=settings.omokRule==='forbidden'?'흑 3-3 · 4-4 · 장목 금지':'자유룰 · 5목 이상 승리';
  if(go){
    $('rule1Title').textContent='잡기';$('rule1Text').textContent='상대 돌의 활로를 모두 막으면 돌을 잡습니다.';
    $('rule2Title').textContent='패';$('rule2Text').textContent='같은 모양을 즉시 반복하는 되따내기는 금지됩니다.';
    $('rule3Title').textContent='종료';$('rule3Text').textContent='서로 연속 두 번 패스하면 자동으로 계가합니다.';
  }else{
    $('rule1Title').textContent='승리';$('rule1Text').textContent='가로·세로·대각선으로 돌 다섯 개를 먼저 연결하면 승리합니다.';
    $('rule2Title').textContent='금수룰';$('rule2Text').textContent='일반 금수룰에서는 흑의 3-3, 4-4, 6목 이상 장목을 막습니다.';
    $('rule3Title').textContent='자유룰';$('rule3Text').textContent='자유룰에서는 흑과 백 모두 5목 이상을 만들면 승리합니다.';
  }
}
function updateUI() {
  const game=currentGame(),whiteTurn=game.current===WHITE,go=isGo();
  $('turnStone').parentElement.classList.toggle('white',whiteTurn);
  $('turnText').textContent=game.gameOver?(game.winner?`${colorName(game.winner)} 승리`:'대국 종료'):`${colorName(game.current)} 차례`;
  $('moveNumber').textContent=`${game.moveNumber}수`;
  $('lastMoveText').textContent=game.lastMove===null?(go&&game.passes?'방금 패스':'첫 수를 두세요'):`마지막 ${coordinateFor(game.lastMove)}`;
  if(go){$('blackCaptures').textContent=goGame.captures[BLACK];$('whiteCaptures').textContent=goGame.captures[WHITE];}
  else{$('blackCaptures').textContent=omokGame.board.filter(v=>v===O_BLACK).length;$('whiteCaptures').textContent=omokGame.board.filter(v=>v===O_WHITE).length;}
  $('thinking').hidden=!aiThinking; $('helperToggle').checked=settings.helpers;
  $('colorField').hidden=settings.mode!=='ai'; $('difficultyField').hidden=settings.mode!=='ai';
  const label=currentDifficultyLabel();
  if(settings.mode==='ai'){$('blackName').textContent=settings.playerColor===BLACK?'나':`AI · ${label}`;$('whiteName').textContent=settings.playerColor===WHITE?'나':`AI · ${label}`;}
  else{$('blackName').textContent='플레이어 1';$('whiteName').textContent='플레이어 2';}
  [...$('modeSegment').querySelectorAll('button')].forEach(button=>button.classList.toggle('active',button.dataset.mode===settings.mode));
  [...$('gameSwitch').querySelectorAll('button')].forEach(button=>button.classList.toggle('active',button.dataset.game===settings.gameType));
  updateContextLabels(); drawBoard();
}

function persist() {
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify({settings,goGame,omokGame}));$('saveState').textContent='자동 저장됨';}
  catch{$('saveState').textContent='저장 불가';}
}
function restoreSaved() {
  try{
    const raw=localStorage.getItem(STORAGE_KEY); if(!raw)return false;
    const saved=JSON.parse(raw); if(!saved?.settings)return false;
    settings={...settings,...saved.settings};
    if(saved.goGame?.board){goGame=saved.goGame;if(!Array.isArray(goGame.undoStack))goGame.undoStack=[];}
    if(saved.omokGame?.board){omokGame=saved.omokGame;if(!Array.isArray(omokGame.undoStack))omokGame.undoStack=[];}
    $('boardSize').value=String(settings.size||9);$('playerColor').value=String(settings.playerColor);$('difficulty').value=settings.difficulty;$('omokRule').value=settings.omokRule||'forbidden';
    showToast('지난 대국을 이어갑니다.'); return true;
  }catch{return false;}
}
function afterAction(message='') {
  hintMove=null; updateUI(); persist(); if(message)coach(message);
  const game=currentGame();
  if(game.gameOver){if(isGo())showScore(true);else showOmokResult();}
}

function humanMove(index) {
  const game=currentGame();
  if(aiThinking||game.gameOver||!isHumanTurn())return;
  if(isGo()){
    const result=playMove(goGame,index);if(!result.ok){showToast(result.reason);tone(110,.05,.025);return;}
    playStoneSound(result.captured.length>0);
    const note=result.captured.length?`${result.captured.length}개의 돌을 잡았습니다.`:result.liberties===1?'이 돌은 활로가 하나뿐입니다. 단수를 조심하세요.':`${coordinateFor(index)}에 착수했습니다.`;
    afterAction(note);
  }else{
    const result=playOmokMove(omokGame,index);if(!result.ok){showToast(result.reason);tone(110,.05,.025);return;}
    playStoneSound(result.win);
    afterAction(result.win?`${colorName(omokGame.winner)}이 오목을 완성했습니다!`:`${coordinateFor(index)}에 두었습니다. 상대의 3과 4를 먼저 살펴보세요.`);
  }
  if(settings.mode==='ai'&&!currentGame().gameOver)scheduleAiTurn();
}
function occupiedRatio() {const game=currentGame();return game.board.filter(v=>v!==EMPTY).length/game.board.length;}
function shouldAiPass() {return isGo()&&goGame.passes===1&&occupiedRatio()>.54;}
function scheduleAiTurn() {
  const game=currentGame();
  if(settings.mode!=='ai'||game.gameOver||game.current!==aiColor())return;
  const scheduledType=settings.gameType,scheduledGame=game;
  aiThinking=true;updateUI();
  const delay=settings.difficulty==='hard'?520:360;
  setTimeout(()=>{
    if(settings.gameType!==scheduledType||currentGame()!==scheduledGame||scheduledGame.gameOver||settings.mode!=='ai'){aiThinking=false;updateUI();return;}
    if(isGo()){
      let move=shouldAiPass()?null:chooseAiMove(goGame,settings.difficulty,goGame.current);
      if(move===null){passTurn(goGame);aiThinking=false;tone(145,.055,.025);afterAction('AI가 패스했습니다.');return;}
      const result=playMove(goGame,move);aiThinking=false;
      if(result.ok){playStoneSound(result.captured.length>0);afterAction(result.captured.length?`AI가 ${result.captured.length}개의 돌을 잡았습니다.`:`AI가 ${coordinateFor(move)}에 두었습니다.`);}else updateUI();
    }else{
      const move=chooseOmokAiMove(omokGame,settings.difficulty,omokGame.current);aiThinking=false;
      if(move===null){updateUI();return;}
      const result=playOmokMove(omokGame,move);
      if(result.ok){playStoneSound(result.win);afterAction(result.win?`AI가 오목을 완성했습니다.`:`AI가 ${coordinateFor(move)}에 두었습니다.`);}else updateUI();
    }
  },delay);
}

function startNewGame(force=false) {
  const game=currentGame();
  if(!force&&game.moveNumber>3&&!window.confirm(`현재 ${isGo()?'바둑':'오목'} 대국을 끝내고 새 판을 시작할까요?`))return;
  settings.playerColor=Number($('playerColor').value);settings.difficulty=$('difficulty').value;settings.omokRule=$('omokRule').value;
  if(isGo()){settings.size=Number($('boardSize').value);goGame=createGame(settings.size);coach(settings.mode==='ai'?`AI ${difficultyLabel(settings.difficulty)} 난이도입니다. 모서리부터 차분히 시작해 보세요.`:'두 사람이 번갈아 두는 바둑입니다. 흑부터 시작합니다.');}
  else{omokGame=createOmokGame(settings.omokRule);coach(settings.omokRule==='forbidden'?'일반 금수룰입니다. 흑은 3-3, 4-4, 장목을 피하면서 공격하세요.':'자유룰입니다. 먼저 다섯 돌을 연결하세요.');}
  hoverIndex=null;hintMove=null;aiThinking=false;updateUI();persist();resizeCanvas();
  if(settings.mode==='ai'&&settings.playerColor===WHITE)scheduleAiTurn();
}
function doUndo() {
  if(aiThinking){showToast('AI가 생각 중입니다.');return;}
  const game=currentGame();if(!game.undoStack.length){showToast('무를 수가 없습니다.');return;}
  if(isGo()){undo(goGame);if(settings.mode==='ai'&&goGame.undoStack.length&&goGame.current!==settings.playerColor)undo(goGame);}
  else{undoOmok(omokGame);if(settings.mode==='ai'&&omokGame.undoStack.length&&omokGame.current!==settings.playerColor)undoOmok(omokGame);}
  if($('scoreDialog').open)$('scoreDialog').close();if($('omokDialog').open)$('omokDialog').close();afterAction('한 수 전으로 돌아왔습니다. 다른 수를 찾아보세요.');
}
function doPass() {
  if(!isGo()){showToast('오목에는 패스가 없습니다.');return;}
  if(aiThinking||goGame.gameOver||!isHumanTurn())return;
  const result=passTurn(goGame);if(!result.ok)return;
  tone(145,.055,.025);afterAction(result.gameOver?'서로 패스해서 대국이 끝났습니다.':'패스했습니다.');
  if(settings.mode==='ai'&&!goGame.gameOver)scheduleAiTurn();
}
function doHint() {
  const game=currentGame();if(aiThinking||game.gameOver){showToast('지금은 추천수를 볼 수 없습니다.');return;}
  hintMove=isGo()?recommendMove(goGame,game.current):recommendOmokMove(omokGame,game.current);
  if(hintMove===null){showToast('추천할 수가 없습니다.');return;}
  drawBoard();coach(isGo()?`${coordinateFor(hintMove)} 부근을 살펴보세요. 따냄과 활로를 함께 고려한 추천입니다.`:`${coordinateFor(hintMove)}를 추천합니다. 내 공격과 상대의 즉시 위협을 함께 본 수입니다.`);
}
function showScore(final=false) {
  if(!isGo())return;
  const score=scoreArea(goGame);$('scoreKicker').textContent=final?'대국 종료 · 최종 예상':'현재 계가 예상';
  $('blackScore').textContent=score.black.toFixed(1);$('whiteScore').textContent=score.white.toFixed(1);
  $('blackScoreDetail').textContent=`돌 ${score.blackStones} + 집 ${score.blackTerritory}`;$('whiteScoreDetail').textContent=`돌 ${score.whiteStones} + 집 ${score.whiteTerritory} + 덤 ${score.komi}`;
  $('scoreHeadline').textContent=score.winner===EMPTY?'현재 동점입니다':`${colorName(score.winner)}이 ${score.diff.toFixed(1)}집 앞서고 있어요`;
  if(!$('scoreDialog').open)$('scoreDialog').showModal();
}
function showOmokResult() {
  const winner=omokGame.winner;
  $('winnerStone').className=`winner-stone ${winner===O_WHITE?'white':'black'}`;
  $('omokHeadline').textContent=winner?`${colorName(winner)} 승리!`:'무승부';
  $('omokResultText').textContent=winner?`${omokGame.moveNumber}수 만에 다섯 돌을 연결했습니다. ${settings.omokRule==='forbidden'?'일반 금수룰 적용 대국입니다.':'자유룰 대국입니다.'}`:'판이 가득 차 무승부가 되었습니다.';
  if(!$('omokDialog').open)$('omokDialog').showModal();
}
function switchGame(type) {
  if(type===settings.gameType)return;
  aiThinking=false;hoverIndex=null;hintMove=null;settings.gameType=type;
  if(type==='go')$('boardSize').value=String(settings.size);else $('omokRule').value=settings.omokRule;
  updateUI();persist();resizeCanvas();
  const game=currentGame();
  coach(type==='go'?'바둑 대국으로 돌아왔습니다. 집과 활로를 읽어보세요.':'오목 모드입니다. 공격하기 전에 상대의 열린 3과 4부터 확인해 보세요.');
  if(settings.mode==='ai'&&!game.gameOver&&game.current===aiColor())scheduleAiTurn();
}

canvas.addEventListener('pointermove',event=>{hoverIndex=indexFromPointer(event);drawBoard();});
canvas.addEventListener('pointerleave',()=>{hoverIndex=null;drawBoard();});
canvas.addEventListener('pointerup',event=>{const index=indexFromPointer(event);if(index!==null)humanMove(index);});
$('newGameButton').addEventListener('click',()=>startNewGame());$('undoButton').addEventListener('click',doUndo);$('undoButtonMobile').addEventListener('click',doUndo);$('hintButton').addEventListener('click',doHint);$('hintButtonMobile').addEventListener('click',doHint);$('passButton').addEventListener('click',doPass);$('passButtonMobile').addEventListener('click',doPass);$('scoreButton').addEventListener('click',()=>showScore(false));
$('rematchButton').addEventListener('click',()=>setTimeout(()=>startNewGame(true),0));$('omokRematchButton').addEventListener('click',()=>setTimeout(()=>startNewGame(true),0));
$('helperToggle').addEventListener('change',event=>{settings.helpers=event.target.checked;updateUI();persist();});
$('soundButton').addEventListener('click',()=>{soundEnabled=!soundEnabled;$('soundButton').textContent=soundEnabled?'♪':'×';showToast(soundEnabled?'소리를 켰습니다.':'소리를 껐습니다.');});
$('modeSegment').addEventListener('click',event=>{const button=event.target.closest('button[data-mode]');if(!button)return;settings.mode=button.dataset.mode;updateUI();persist();const game=currentGame();if(settings.mode==='ai'&&!game.gameOver&&game.current===aiColor())scheduleAiTurn();});
$('gameSwitch').addEventListener('click',event=>{const button=event.target.closest('button[data-game]');if(button)switchGame(button.dataset.game);});
window.addEventListener('keydown',event=>{if(event.target.matches('input,select,button'))return;const key=event.key.toLowerCase();if(key==='u')doUndo();if(key==='h')doHint();if(key==='p'&&isGo())doPass();if(key==='s'&&isGo())showScore(false);if(key==='n')startNewGame();if(key==='o')switchGame('omok');if(key==='g')switchGame('go');});
window.addEventListener('resize',resizeCanvas);

restoreSaved();
updateUI();
requestAnimationFrame(()=>{resizeCanvas();const game=currentGame();if(settings.mode==='ai'&&!game.gameOver&&game.current===aiColor())scheduleAiTurn();});
