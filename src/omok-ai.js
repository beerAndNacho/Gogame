import {
  O_BLACK, O_EMPTY, O_WHITE, analyzeOmokMove, cloneOmok,
  lineLengths, omokOpponent, omokPoint, playOmokMove,
} from './omok-engine.js';

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

function rawNearby(state,radius=2){
  const occupied=[];
  for(let i=0;i<state.board.length;i+=1) if(state.board[i]!==O_EMPTY) occupied.push(i);
  if(!occupied.length) return [Math.floor(state.board.length/2)];
  const result=new Set();
  for(const i of occupied){
    const {x,y}=omokPoint(state.size,i);
    for(let dy=-radius;dy<=radius;dy+=1) for(let dx=-radius;dx<=radius;dx+=1){
      if(!dx&&!dy) continue;
      const nx=x+dx,ny=y+dy;
      if(!inBoard(state.size,nx,ny)) continue;
      const point=idx(state.size,nx,ny);
      if(state.board[point]===O_EMPTY) result.add(point);
    }
  }
  return [...result];
}

function candidatePool(state,color,radius=2){
  return rawNearby(state,radius).filter(index=>analyzeOmokMove(state,index,color).legal);
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

function bestCandidates(state,color,limit=16,radius=2){
  return candidatePool(state,color,radius)
    .map(index=>({index,score:candidateValue(state,index,color)}))
    .sort((a,b)=>b.score-a.score)
    .slice(0,limit);
}

function immediateWins(state,color){
  return candidatePool(state,color,2).filter(index=>analyzeOmokMove(state,index,color).win);
}

function extremeMoveValue(state,candidate,color){
  const enemy=omokOpponent(color);
  const next=cloneOmok(state); next.current=color;
  const played=playOmokMove(next,candidate.index);
  if(!played.ok) return -Infinity;
  if(next.gameOver&&next.winner===color) return 9_000_000;

  const ownNextWins=immediateWins(next,color);
  const enemyWins=immediateWins(next,enemy);

  // 다음 차례에 이기는 곳이 두 군데 이상 생기면 사실상 강제승리 포크다.
  if(ownNextWins.length>=2&&enemyWins.length===0) return 7_000_000+candidate.score;
  if(enemyWins.length>=2) return -7_000_000;
  if(enemyWins.length===1) return -2_500_000+candidate.score;

  const replies=bestCandidates(next,enemy,10,2);
  if(!replies.length) return candidate.score+ownNextWins.length*200_000;

  let worstDanger=-Infinity;
  for(const reply of replies){
    const afterReply=cloneOmok(next); afterReply.current=enemy;
    const replyResult=playOmokMove(afterReply,reply.index);
    if(!replyResult.ok) continue;
    if(afterReply.gameOver&&afterReply.winner===enemy){worstDanger=Math.max(worstDanger,8_000_000);continue;}

    const ourWins=immediateWins(afterReply,color);
    if(ourWins.length){
      worstDanger=Math.max(worstDanger,-1_500_000);
      continue;
    }

    const enemyFutureWins=immediateWins(afterReply,enemy);
    let danger=reply.score;
    if(enemyFutureWins.length>=2) danger+=3_000_000;
    else if(enemyFutureWins.length===1) danger+=650_000;

    const follow=bestCandidates(afterReply,color,8,2)[0];
    if(follow) danger-=follow.score*.62;
    worstDanger=Math.max(worstDanger,danger);
  }

  return candidate.score+ownNextWins.length*220_000-worstDanger*.9;
}

export function chooseOmokAiMove(state,difficulty='normal',color=state.current){
  const wins=immediateWins({...state,current:color},color);
  if(wins.length) return wins[0];

  const enemy=omokOpponent(color);
  const enemyWins=immediateWins({...state,current:enemy},enemy);
  if(enemyWins.length){
    const legalBlock=enemyWins.find(index=>analyzeOmokMove(state,index,color).legal);
    if(legalBlock!==undefined) return legalBlock;
  }

  if(difficulty==='extreme'){
    const candidates=bestCandidates(state,color,24,3);
    if(!candidates.length) return null;

    // 먼저 강제승리 포크를 찾는다.
    for(const candidate of candidates){
      const next=cloneOmok(state); next.current=color;
      if(!playOmokMove(next,candidate.index).ok) continue;
      if(next.gameOver&&next.winner===color) return candidate.index;
      const ownNextWins=immediateWins(next,color);
      const opponentImmediate=immediateWins(next,enemy);
      if(ownNextWins.length>=2&&opponentImmediate.length===0) return candidate.index;
    }

    let bestMove=candidates[0].index,bestValue=-Infinity;
    for(const candidate of candidates.slice(0,16)){
      const value=extremeMoveValue(state,candidate,color);
      if(value>bestValue){bestValue=value;bestMove=candidate.index;}
    }
    return bestMove;
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

export function omokDifficultyLabel(value){
  if(value==='easy') return '입문';
  if(value==='hard') return '도전';
  if(value==='extreme') return '극강';
  return '보통';
}
export const OMOK_COLORS={O_BLACK,O_WHITE,O_EMPTY};
