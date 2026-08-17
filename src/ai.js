import {
  BLACK,
  EMPTY,
  WHITE,
  analyzeMove,
  cloneGame,
  legalMoves,
  neighbors,
  opponent,
  playMove,
  pointOf,
} from './go-engine.js';

function centerBias(size, index) {
  const { x, y } = pointOf(size, index);
  const center = (size - 1) / 2;
  const distance = Math.abs(x - center) + Math.abs(y - center);
  return Math.max(0, size - distance) * 0.35;
}

function localShapeScore(state, index, color) {
  let friendly = 0;
  let enemy = 0;
  let empty = 0;
  for (const next of neighbors(state.size, index)) {
    if (state.board[next] === color) friendly += 1;
    else if (state.board[next] === opponent(color)) enemy += 1;
    else empty += 1;
  }
  return friendly * 1.1 + enemy * 0.9 + empty * 0.2;
}

function candidateScore(state, index, color) {
  const analysis = analyzeMove(state, index, color);
  if (!analysis.legal) return -Infinity;
  let score = 0;
  score += analysis.captured.length * 32;
  score += Math.min(analysis.liberties, 5) * 2.2;
  score += localShapeScore(state, index, color);
  score += centerBias(state.size, index);

  if (analysis.liberties === 1 && analysis.captured.length === 0) score -= 16;

  const clone = cloneGame(state);
  clone.current = color;
  const result = playMove(clone, index);
  if (result.ok) {
    let endangered = 0;
    for (const next of neighbors(clone.size, index)) {
      if (clone.board[next] === color) endangered += 0.15;
    }
    score += endangered;
  }

  return score;
}

function topCandidates(state, color, limit = 12) {
  return legalMoves(state, color)
    .map((index) => ({ index, score: candidateScore(state, index, color) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function opponentThreatAfter(state, index, color) {
  const next = cloneGame(state);
  next.current = color;
  if (!playMove(next, index).ok) return 999;
  const replyColor = opponent(color);
  const replies = topCandidates(next, replyColor, 8);
  if (!replies.length) return 0;
  return Math.max(...replies.map((reply) => reply.score));
}

export function chooseAiMove(state, difficulty = 'normal', color = state.current) {
  const moves = legalMoves(state, color);
  if (!moves.length) return null;

  if (difficulty === 'easy') {
    const candidates = topCandidates(state, color, Math.min(18, moves.length));
    const pool = candidates.slice(0, Math.max(4, Math.ceil(candidates.length * 0.65)));
    return pool[Math.floor(Math.random() * pool.length)]?.index ?? moves[0];
  }

  const candidates = topCandidates(state, color, difficulty === 'hard' ? 14 : 10);

  if (difficulty === 'normal') {
    const best = candidates[0]?.score ?? 0;
    const nearBest = candidates.filter((candidate) => candidate.score >= best - 3.5);
    return nearBest[Math.floor(Math.random() * nearBest.length)]?.index ?? candidates[0].index;
  }

  let bestMove = candidates[0].index;
  let bestValue = -Infinity;
  for (const candidate of candidates) {
    const threat = opponentThreatAfter(state, candidate.index, color);
    const value = candidate.score - threat * 0.24 + Math.random() * 0.4;
    if (value > bestValue) {
      bestValue = value;
      bestMove = candidate.index;
    }
  }
  return bestMove;
}

export function recommendMove(state, color = state.current) {
  const candidates = topCandidates(state, color, 8);
  if (!candidates.length) return null;
  return candidates[0].index;
}

export function difficultyLabel(value) {
  return value === 'easy' ? '입문' : value === 'hard' ? '도전' : '보통';
}

export const COLORS = { BLACK, WHITE, EMPTY };
