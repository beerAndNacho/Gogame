export const O_EMPTY = 0;
export const O_BLACK = 1;
export const O_WHITE = 2;
export const OMOK_SIZE = 15;

const DIRS = [[1,0],[0,1],[1,1],[1,-1]];

export function createOmokGame(rule = 'forbidden') {
  return {
    kind: 'omok',
    size: OMOK_SIZE,
    rule,
    board: Array(OMOK_SIZE * OMOK_SIZE).fill(O_EMPTY),
    current: O_BLACK,
    moveNumber: 0,
    lastMove: null,
    gameOver: false,
    winner: null,
    endReason: '',
    undoStack: [],
  };
}

export function omokOpponent(color) { return color === O_BLACK ? O_WHITE : O_BLACK; }
export function omokPoint(size, index) { return { x: index % size, y: Math.floor(index / size) }; }
export function omokIndex(size, x, y) { return y * size + x; }
export function inOmok(size, x, y) { return x >= 0 && y >= 0 && x < size && y < size; }

export function cloneOmok(state) {
  return {
    ...state,
    board: [...state.board],
    undoStack: state.undoStack.map((entry) => ({ ...entry, board: [...entry.board] })),
  };
}

function snapshot(state) {
  return {
    board: [...state.board], current: state.current, moveNumber: state.moveNumber,
    lastMove: state.lastMove, gameOver: state.gameOver, winner: state.winner,
    endReason: state.endReason,
  };
}

function runLength(board, size, index, color, dx, dy) {
  const { x, y } = omokPoint(size, index);
  let count = 1;
  for (const sign of [-1, 1]) {
    let nx = x + dx * sign, ny = y + dy * sign;
    while (inOmok(size, nx, ny) && board[omokIndex(size, nx, ny)] === color) {
      count += 1; nx += dx * sign; ny += dy * sign;
    }
  }
  return count;
}

export function lineLengths(board, size, index, color) {
  return DIRS.map(([dx,dy]) => runLength(board, size, index, color, dx, dy));
}

function hasExactFive(board, size, index, color) {
  return lineLengths(board, size, index, color).some((length) => length === 5);
}
function hasFiveOrMore(board, size, index, color) {
  return lineLengths(board, size, index, color).some((length) => length >= 5);
}
function hasOverline(board, size, index, color) {
  return lineLengths(board, size, index, color).some((length) => length >= 6);
}

function directionCells(size, index, dx, dy, radius = 5) {
  const { x, y } = omokPoint(size, index);
  const cells = [];
  for (let step = -radius; step <= radius; step += 1) {
    const nx = x + dx * step, ny = y + dy * step;
    if (inOmok(size, nx, ny)) cells.push(omokIndex(size, nx, ny));
  }
  return cells;
}

function exactFiveCompletions(board, size, anchor, color, dx, dy) {
  const completions = [];
  for (const candidate of directionCells(size, anchor, dx, dy, 5)) {
    if (board[candidate] !== O_EMPTY) continue;
    const next = [...board]; next[candidate] = color;
    if (runLength(next, size, candidate, color, dx, dy) === 5) completions.push(candidate);
  }
  return [...new Set(completions)];
}

function fourCount(board, size, index, color) {
  let count = 0;
  for (const [dx,dy] of DIRS) {
    if (exactFiveCompletions(board, size, index, color, dx, dy).length > 0) count += 1;
  }
  return count;
}

function openThreeCount(board, size, index, color) {
  let count = 0;
  for (const [dx,dy] of DIRS) {
    let createsStraightFour = false;
    for (const candidate of directionCells(size, index, dx, dy, 4)) {
      if (board[candidate] !== O_EMPTY) continue;
      const next = [...board]; next[candidate] = color;
      if (hasOverline(next, size, candidate, color)) continue;
      const completions = exactFiveCompletions(next, size, index, color, dx, dy);
      if (completions.length >= 2) { createsStraightFour = true; break; }
    }
    if (createsStraightFour) count += 1;
  }
  return count;
}

export function analyzeOmokMove(state, index, color = state.current) {
  if (state.gameOver) return { legal: false, reason: '대국이 끝났습니다.' };
  if (index < 0 || index >= state.board.length || state.board[index] !== O_EMPTY) {
    return { legal: false, reason: '빈 교차점을 선택해 주세요.' };
  }

  const board = [...state.board]; board[index] = color;
  const exactFive = hasExactFive(board, state.size, index, color);
  const fiveOrMore = hasFiveOrMore(board, state.size, index, color);

  if (state.rule === 'forbidden' && color === O_BLACK && !exactFive) {
    if (hasOverline(board, state.size, index, color)) return { legal: false, reason: '흑 장목(6목 이상)은 금수입니다.', forbidden: 'overline' };
    const fours = fourCount(board, state.size, index, color);
    if (fours >= 2) return { legal: false, reason: '흑 4-4는 금수입니다.', forbidden: 'double-four' };
    const threes = openThreeCount(board, state.size, index, color);
    if (threes >= 2) return { legal: false, reason: '흑 3-3은 금수입니다.', forbidden: 'double-three' };
  }

  const win = state.rule === 'forbidden' && color === O_BLACK ? exactFive : fiveOrMore;
  return { legal: true, win, exactFive, board };
}

export function playOmokMove(state, index) {
  const color = state.current;
  const analysis = analyzeOmokMove(state, index, color);
  if (!analysis.legal) return { ok: false, reason: analysis.reason, forbidden: analysis.forbidden };

  state.undoStack.push(snapshot(state));
  state.board = analysis.board;
  state.lastMove = index;
  state.moveNumber += 1;

  if (analysis.win) {
    state.gameOver = true;
    state.winner = color;
    state.endReason = `${color === O_BLACK ? '흑' : '백'} 오목 완성`;
  } else if (state.moveNumber >= state.board.length) {
    state.gameOver = true;
    state.winner = null;
    state.endReason = '무승부';
  } else {
    state.current = omokOpponent(color);
  }
  return { ok: true, win: analysis.win };
}

export function undoOmok(state) {
  const previous = state.undoStack.pop();
  if (!previous) return false;
  const stack = state.undoStack;
  Object.assign(state, previous);
  state.undoStack = stack;
  return true;
}

export function legalOmokMoves(state, color = state.current) {
  const moves = [];
  for (let i = 0; i < state.board.length; i += 1) {
    if (state.board[i] === O_EMPTY && analyzeOmokMove(state, i, color).legal) moves.push(i);
  }
  return moves;
}

export function winningOmokMoves(state, color = state.current) {
  return legalOmokMoves(state, color).filter((index) => analyzeOmokMove(state, index, color).win);
}

export function omokCoordinate(index) {
  const { x, y } = omokPoint(OMOK_SIZE, index);
  const letters = 'ABCDEFGHJKLMNOP';
  return `${letters[x]}${OMOK_SIZE - y}`;
}
