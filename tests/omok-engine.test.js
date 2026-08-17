import test from 'node:test';
import assert from 'node:assert/strict';
import {
  O_BLACK, O_WHITE, analyzeOmokMove, createOmokGame, omokIndex,
  playOmokMove, undoOmok,
} from '../src/omok-engine.js';
import { chooseOmokAiMove } from '../src/omok-ai.js';

function place(state, x, y, color) {
  state.board[omokIndex(state.size,x,y)] = color;
}

test('five in a row wins', () => {
  const state = createOmokGame('freestyle');
  for(let x=3;x<7;x+=1) place(state,x,7,O_BLACK);
  state.current=O_BLACK;
  const result=playOmokMove(state,omokIndex(state.size,7,7));
  assert.equal(result.ok,true);
  assert.equal(state.gameOver,true);
  assert.equal(state.winner,O_BLACK);
});

test('black overline is forbidden in forbidden rule', () => {
  const state=createOmokGame('forbidden');
  for(let x=3;x<=7;x+=1) place(state,x,7,O_BLACK);
  state.current=O_BLACK;
  const result=analyzeOmokMove(state,omokIndex(state.size,8,7),O_BLACK);
  assert.equal(result.legal,false);
  assert.equal(result.forbidden,'overline');
});

test('white may make overline in forbidden rule', () => {
  const state=createOmokGame('forbidden');
  for(let x=3;x<=7;x+=1) place(state,x,7,O_WHITE);
  state.current=O_WHITE;
  const result=analyzeOmokMove(state,omokIndex(state.size,8,7),O_WHITE);
  assert.equal(result.legal,true);
  assert.equal(result.win,true);
});

test('undo restores previous position', () => {
  const state=createOmokGame();
  const point=omokIndex(state.size,7,7);
  assert.equal(playOmokMove(state,point).ok,true);
  assert.equal(state.board[point],O_BLACK);
  assert.equal(undoOmok(state),true);
  assert.equal(state.board[point],0);
  assert.equal(state.current,O_BLACK);
});

test('AI returns a legal move', () => {
  const state=createOmokGame('forbidden');
  playOmokMove(state,omokIndex(state.size,7,7));
  const move=chooseOmokAiMove(state,'normal',state.current);
  assert.ok(Number.isInteger(move));
  assert.equal(analyzeOmokMove(state,move,state.current).legal,true);
});

test('AI blocks an immediate enemy win', () => {
  const state=createOmokGame('freestyle');
  for(let x=4;x<=7;x+=1) place(state,x,7,O_BLACK);
  state.current=O_WHITE;
  const move=chooseOmokAiMove(state,'hard',O_WHITE);
  assert.ok([omokIndex(state.size,3,7),omokIndex(state.size,8,7)].includes(move));
});

test('extreme AI blocks an immediate enemy win', () => {
  const state=createOmokGame('freestyle');
  for(let x=4;x<=7;x+=1) place(state,x,7,O_BLACK);
  state.current=O_WHITE;
  const move=chooseOmokAiMove(state,'extreme',O_WHITE);
  assert.ok([omokIndex(state.size,3,7),omokIndex(state.size,8,7)].includes(move));
  assert.equal(analyzeOmokMove(state,move,O_WHITE).legal,true);
});
