import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLACK,
  EMPTY,
  WHITE,
  analyzeMove,
  boardKey,
  createGame,
  indexOf,
  passTurn,
  playMove,
  scoreArea,
  undo,
} from '../src/go-engine.js';
import { chooseAiMove } from '../src/ai.js';

test('상대 돌의 활로를 모두 막으면 잡힌다', () => {
  const game = createGame(9);
  const p = (x, y) => indexOf(9, x, y);
  playMove(game, p(0, 1));
  playMove(game, p(1, 1));
  playMove(game, p(1, 0));
  playMove(game, p(8, 8));
  playMove(game, p(2, 1));
  playMove(game, p(8, 7));
  const result = playMove(game, p(1, 2));
  assert.equal(result.ok, true);
  assert.equal(result.captured.length, 1);
  assert.equal(game.board[p(1, 1)], EMPTY);
  assert.equal(game.captures[BLACK], 1);
});

test('자살수는 금지된다', () => {
  const game = createGame(9);
  const p = (x, y) => indexOf(9, x, y);
  for (const index of [p(0,1), p(1,0), p(2,1), p(1,2)]) game.board[index] = WHITE;
  game.positionHistory = [boardKey(game.board)];
  game.current = BLACK;
  const result = analyzeMove(game, p(1,1));
  assert.equal(result.legal, false);
  assert.match(result.reason, /자살수/);
});

test('단순 패는 즉시 되따내기를 막는다', () => {
  const game = createGame(9);
  const p = (x, y) => indexOf(9, x, y);
  for (const index of [p(0,1), p(2,1), p(1,0)]) game.board[index] = BLACK;
  for (const index of [p(1,1), p(0,2), p(2,2), p(1,3)]) game.board[index] = WHITE;
  game.current = BLACK;
  game.positionHistory = [boardKey(game.board)];

  const capture = playMove(game, p(1,2));
  assert.equal(capture.ok, true);
  assert.equal(capture.captured.length, 1);

  const recapture = analyzeMove(game, p(1,1));
  assert.equal(recapture.legal, false);
  assert.match(recapture.reason, /패 규칙/);
});

test('두 번 연속 패스하면 대국이 종료된다', () => {
  const game = createGame(9);
  assert.equal(passTurn(game).gameOver, false);
  assert.equal(passTurn(game).gameOver, true);
  assert.equal(game.gameOver, true);
});

test('무르기는 직전 상태를 정확히 복구한다', () => {
  const game = createGame(9);
  const move = indexOf(9, 4, 4);
  playMove(game, move);
  assert.equal(game.board[move], BLACK);
  assert.equal(undo(game), true);
  assert.equal(game.board[move], EMPTY);
  assert.equal(game.current, BLACK);
  assert.equal(game.moveNumber, 0);
});

test('중국식 면적 계가는 돌과 둘러싼 빈점을 센다', () => {
  const game = createGame(9, 6.5);
  game.board.fill(BLACK);
  const score = scoreArea(game);
  assert.equal(score.black, 81);
  assert.equal(score.white, 6.5);
  assert.equal(score.winner, BLACK);
});

test('AI는 현재 판에서 합법수만 선택한다', () => {
  const game = createGame(9);
  playMove(game, indexOf(9, 4, 4));
  const move = chooseAiMove(game, 'hard', WHITE);
  assert.equal(Number.isInteger(move), true);
  assert.equal(analyzeMove(game, move, WHITE).legal, true);
});

test('극강 바둑 AI도 합법수만 선택한다', () => {
  const game = createGame(9);
  playMove(game, indexOf(9, 4, 4));
  playMove(game, indexOf(9, 2, 2));
  playMove(game, indexOf(9, 6, 6));
  game.current = WHITE;
  const move = chooseAiMove(game, 'extreme', WHITE);
  assert.equal(Number.isInteger(move), true);
  assert.equal(analyzeMove(game, move, WHITE).legal, true);
});
