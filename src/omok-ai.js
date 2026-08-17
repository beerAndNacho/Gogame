import {
  O_BLACK, O_EMPTY, O_WHITE, analyzeOmokMove, cloneOmok, legalOmokMoves,
  lineLengths, omokOpponent, omokPoint, playOmokMove, winningOmokMoves,
} from './omok-engine.js';

const DIRS = [[1,0],[0,1],[1,1],[1,-1]];

function inBoard(size,x,y){return x>=0&&y>=0&&x<size&&y<size;}
function idx(size,x,y){return y*size+x;}

function proximity(state,index){
  const {x,y}=omokPoint(state.size,index);
  let score=0;
  for(let dy=-2;dy<=2;dy+=1) for(let dx=-2;dx<=2;dx+=1){
    if(!dx&&!dy) continue;
    const nx=x+dx,ny=y+dy;
    if(!inBoard(state.size,nx,ny)) continue;
    if(state.board[idx(state.size,nx,ny)]!==O_EMPTY) score += Math.max(0,4-(Math.abs(dx)+Math.abs(dy)));
  }
  const center=(state.size-1)/2;
  score += Math.max(0,8-(Math.abs(x-center)+Math.abs(y-center)))*.25;
  return score;
}

function shapeValue(board,size,index,color){
  const lengths=lineLengths(board,size,index,color);
  let total=0;
  for(const len of lengths){
    if(len>=5) total+=100000;
    else if(len===4) total+=9000;
    else if(len===3) total+=850;
    else if(len===2) total+=90;
  }
  return total;
}

function candidateValue(state,index,color){
  const own=analyzeOmokMove(state,index,color);
  if(!own.legal) return -Infinity;
  let score=proximity(state,index);
  if(own.win) return 1_000_000;
  score += shapeValue(own.board,state.size,index,color);

  const enemy=omokOpponent(color);
  const enemyView={...state,current:enemy};
  const threat=analyzeOmokMove(enemyView,index,enemy);
  if(threat.legal){
    if(threat.win) score += 500_000;
    score += shapeValue(threat.board,state.size,index,enemy)*.78;
  }
  return score;
}

function nearbyMoves(state,color){
  const all=legalOmokMoves(state,color);
  if(state.moveNumber===0) return [Math.floor(state.board.length/2)];
  const filtered=all.filter((index)=>proximity(state,index)>0);
  return filtered.length?filtered:all;
}

function bestCandidates(state,color,limit=16){
  return nearbyMoves(state,color)
    .map(index=>({index,score:candidateValue(state,index,color)}))
    .sort((a,b)=>b.score-a.score)
    .slice(0,limit);
}

export function chooseOmokAiMove(state,difficulty='normal',color=state.current){
  const wins=winningOmokMoves({...state,current:color},color);
  if(wins.length) return wins[0];

  const enemy=omokOpponent(color);
  const enemyWins=winningOmokMoves({...state,current:enemy},enemy);
  if(enemyWins.length){
    const legalBlock=enemyWins.find(index=>analyzeOmokMove(state,index,color).legal);
    if(legalBlock!==undefined) return legalBlock;
  }

  const candidates=bestCandidates(state,color,difficulty==='hard'?18:difficulty==='easy'?12:15);
  if(!candidates.length) return null;

  if(difficulty==='easy'){
    const pool=candidates.slice(0,Math.min(7,candidates.length));
    return pool[Math.floor(Math.random()*pool.length)].index;
  }
  if(difficulty==='normal'){
    const best=candidates[0].score;
    const pool=candidates.filter(c=>c.score>=best*.82-30).slice(0,5);
    return pool[Math.floor(Math.random()*pool.length)].index;
  }

  let bestMove=candidates[0].index,bestValue=-Infinity;
  for(const candidate of candidates.slice(0,10)){
    const next=cloneOmok(state); next.current=color;
    if(!playOmokMove(next,candidate.index).ok) continue;
    if(next.gameOver) return candidate.index;
    const reply=bestCandidates(next,enemy,8)[0];
    const value=candidate.score-(reply?.score||0)*.72+Math.random()*3;
    if(value>bestValue){bestValue=value;bestMove=candidate.index;}
  }
  return bestMove;
}

export function recommendOmokMove(state,color=state.current){
  return bestCandidates(state,color,1)[0]?.index ?? null;
}

export function omokDifficultyLabel(value){return value==='easy'?'입문':value==='hard'?'도전':'보통';}
export const OMOK_COLORS={O_BLACK,O_WHITE,O_EMPTY};
