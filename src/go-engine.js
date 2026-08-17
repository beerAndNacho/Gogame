export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export function opponent(color) {
  return color === BLACK ? WHITE : BLACK;
}

export function createGame(size = 9, komi = 6.5) {
  if (![9, 13, 19].includes(size)) throw new Error('지원하는 바둑판은 9, 13, 19입니다.');
  const board = Array(size * size).fill(EMPTY);
  return {
    size,
    komi,
    board,
    current: BLACK,
    captures: { [BLACK]: 0, [WHITE]: 0 },
    passes: 0,
    moveNumber: 0,
    lastMove: null,
    gameOver: false,
    positionHistory: [boardKey(board)],
    undoStack: [],
  };
}

function snapshot(state) {
  return {
    size: state.size,
    komi: state.komi,
    board: [...state.board],
    current: state.current,
    captures: { ...state.captures },
    passes: state.passes,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
    gameOver: state.gameOver,
    positionHistory: [...state.positionHistory],
  };
}

export function cloneGame(state) {
  return { ...snapshot(state), undoStack: [] };
}

function restore(state, saved) {
  state.size = saved.size;
  state.komi = saved.komi;
  state.board = [...saved.board];
  state.current = saved.current;
  state.captures = { ...saved.captures };
  state.passes = saved.passes;
  state.moveNumber = saved.moveNumber;
  state.lastMove = saved.lastMove;
  state.gameOver = saved.gameOver;
  state.positionHistory = [...saved.positionHistory];
}

export function boardKey(board) {
  return board.join('');
}

export function indexOf(size, x, y) {
  return y * size + x;
}

export function pointOf(size, index) {
  return { x: index % size, y: Math.floor(index / size) };
}

export function neighbors(size, index) {
  const { x, y } = pointOf(size, index);
  const points = [];
  if (x > 0) points.push(index - 1);
  if (x < size - 1) points.push(index + 1);
  if (y > 0) points.push(index - size);
  if (y < size - 1) points.push(index + size);
  return points;
}

export function groupInfo(board, size, start) {
  const color = board[start];
  if (color === EMPTY) return { color: EMPTY, stones: [], liberties: new Set() };

  const stones = [];
  const liberties = new Set();
  const seen = new Set([start]);
  const stack = [start];

  while (stack.length) {
    const index = stack.pop();
    stones.push(index);
    for (const next of neighbors(size, index)) {
      const value = board[next];
      if (value === EMPTY) liberties.add(next);
      else if (value === color && !seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }

  return { color, stones, liberties };
}

export function analyzeMove(state, index, color = state.current) {
  if (state.gameOver) return { legal: false, reason: '대국이 종료되었습니다.' };
  if (!Number.isInteger(index) || index < 0 || index >= state.board.length) {
    return { legal: false, reason: '바둑판 밖입니다.' };
  }
  if (state.board[index] !== EMPTY) return { legal: false, reason: '이미 돌이 놓여 있습니다.' };

  const board = [...state.board];
  board[index] = color;
  const enemy = opponent(color);
  const captured = [];
  const checked = new Set();

  for (const next of neighbors(state.size, index)) {
    if (board[next] !== enemy || checked.has(next)) continue;
    const group = groupInfo(board, state.size, next);
    group.stones.forEach((stone) => checked.add(stone));
    if (group.liberties.size === 0) {
      captured.push(...group.stones);
      group.stones.forEach((stone) => { board[stone] = EMPTY; });
    }
  }

  const ownGroup = groupInfo(board, state.size, index);
  if (ownGroup.liberties.size === 0) {
    return { legal: false, reason: '자살수는 둘 수 없습니다.' };
  }

  const key = boardKey(board);
  const twoMovesAgo = state.positionHistory[state.positionHistory.length - 2];
  if (twoMovesAgo && key === twoMovesAgo) {
    return { legal: false, reason: '패 규칙 때문에 바로 되잡을 수 없습니다.' };
  }

  return {
    legal: true,
    board,
    key,
    captured,
    liberties: ownGroup.liberties.size,
  };
}

export function playMove(state, index) {
  const analysis = analyzeMove(state, index, state.current);
  if (!analysis.legal) return { ok: false, reason: analysis.reason };

  state.undoStack.push(snapshot(state));
  const playedColor = state.current;
  state.board = analysis.board;
  state.captures[playedColor] += analysis.captured.length;
  state.current = opponent(state.current);
  state.passes = 0;
  state.moveNumber += 1;
  state.lastMove = index;
  state.positionHistory.push(analysis.key);

  return {
    ok: true,
    color: playedColor,
    index,
    captured: analysis.captured,
    liberties: analysis.liberties,
  };
}

export function passTurn(state) {
  if (state.gameOver) return { ok: false, reason: '대국이 종료되었습니다.' };
  state.undoStack.push(snapshot(state));
  const color = state.current;
  state.current = opponent(state.current);
  state.passes += 1;
  state.moveNumber += 1;
  state.lastMove = null;
  state.positionHistory.push(boardKey(state.board));
  if (state.passes >= 2) state.gameOver = true;
  return { ok: true, color, gameOver: state.gameOver };
}

export function undo(state) {
  const saved = state.undoStack.pop();
  if (!saved) return false;
  restore(state, saved);
  return true;
}

export function legalMoves(state, color = state.current) {
  if (state.gameOver) return [];
  const result = [];
  for (let i = 0; i < state.board.length; i += 1) {
    if (state.board[i] === EMPTY && analyzeMove(state, i, color).legal) result.push(i);
  }
  return result;
}

export function atariStones(state, color = null) {
  const stones = new Set();
  const visited = new Set();
  for (let i = 0; i < state.board.length; i += 1) {
    if (state.board[i] === EMPTY || visited.has(i)) continue;
    if (color && state.board[i] !== color) continue;
    const group = groupInfo(state.board, state.size, i);
    group.stones.forEach((stone) => visited.add(stone));
    if (group.liberties.size === 1) group.stones.forEach((stone) => stones.add(stone));
  }
  return stones;
}

export function scoreArea(state) {
  const { board, size, komi } = state;
  let blackStones = 0;
  let whiteStones = 0;
  let blackTerritory = 0;
  let whiteTerritory = 0;
  let neutral = 0;
  const visited = new Set();

  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === BLACK) blackStones += 1;
    if (board[i] === WHITE) whiteStones += 1;
  }

  for (let i = 0; i < board.length; i += 1) {
    if (board[i] !== EMPTY || visited.has(i)) continue;
    const region = [];
    const borderColors = new Set();
    const stack = [i];
    visited.add(i);

    while (stack.length) {
      const point = stack.pop();
      region.push(point);
      for (const next of neighbors(size, point)) {
        if (board[next] === EMPTY && !visited.has(next)) {
          visited.add(next);
          stack.push(next);
        } else if (board[next] !== EMPTY) {
          borderColors.add(board[next]);
        }
      }
    }

    if (borderColors.size === 1 && borderColors.has(BLACK)) blackTerritory += region.length;
    else if (borderColors.size === 1 && borderColors.has(WHITE)) whiteTerritory += region.length;
    else neutral += region.length;
  }

  const black = blackStones + blackTerritory;
  const white = whiteStones + whiteTerritory + komi;
  const diff = Math.abs(black - white);
  const winner = black === white ? EMPTY : black > white ? BLACK : WHITE;

  return {
    black,
    white,
    winner,
    diff,
    blackStones,
    whiteStones,
    blackTerritory,
    whiteTerritory,
    neutral,
    komi,
  };
}

export function coordinateLabel(size, index) {
  const { x, y } = pointOf(size, index);
  const letters = 'ABCDEFGHJKLMNOPQRST';
  return `${letters[x]}${size - y}`;
}
