const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const POS=['GK','DF','MF','FW'];
let data=null,days=[],dayIndex=0;

function ratingOf(p){
  const v=Number(p?.stats?.rating?.value);
  return Number.isFinite(v)?v:null;
}
function dayKey(m){
  if(m?.date)return String(m.date);
  const id=String(m?.gameId||m?.matchId||'');
  const x=id.match(/^(\d{4})(\d{2})(\d{2})/);
  return x?`${x[1]}-${x[2]}-${x[3]}`:id.slice(0,8);
}
function officialMatches(){
  return (data?.matches||[]).filter(m=>m.includeOverall!==false && m.category!=='exhibition');
}
function buildDays(){
  const set=new Set(officialMatches().map(dayKey).filter(Boolean));
  days=[...set].sort();
}
function rowsForDay(day){
  return officialMatches().filter(m=>dayKey(m)===day);
}
function candidatesForDay(day){
  const matches=rowsForDay(day);
  const buckets=new Map();
  for(const m of matches){
    for(const p of m.players||[]){
      const pos=String(p.position||'').toUpperCase();
      if(!POS.includes(pos))continue;
      const rating=ratingOf(p);
      if(rating===null)continue;
      const key=`${p.playerId}|${pos}`;
      const b=buckets.get(key)||{playerId:p.playerId,name:p.currentName||p.name||p.playerId,pos,games:0,ratings:[],matchIds:[]};
      b.games++;
      b.ratings.push(rating);
      b.matchIds.push(m.gameId||m.matchId||'');
      buckets.set(key,b);
    }
  }
  const byPos={GK:[],DF:[],MF:[],FW:[]};
  for(const b of buckets.values()){
    if(b.games<2)continue;
    b.avg=b.ratings.reduce((a,x)=>a+x,0)/b.ratings.length;
    b.min=Math.min(...b.ratings); b.max=Math.max(...b.ratings);
    byPos[b.pos].push(b);
  }
  for(const pos of POS)byPos[pos].sort((a,b)=>b.avg-a.avg||b.games-a.games||a.name.localeCompare(b.name));
  return byPos;
}

function initialFormation(cands){
  const counts={DF:2,MF:2,FW:2};
  const notes=[];
  let best=null;
  for(const gainPos of ['DF','MF','FW']){
    const third=cands[gainPos][2];
    if(!third)continue;
    for(const losePos of ['DF','MF','FW']){
      if(losePos===gainPos)continue;
      const second=cands[losePos][1];
      if(!second)continue;
      const diff=third.avg-second.avg;
      if(diff>=0.5 && (!best||diff>best.diff)){
        best={gainPos,losePos,diff,third,second};
      }
    }
  }
  if(best){
    counts[best.gainPos]=3;
    counts[best.losePos]=1;
    notes.push(`${best.gainPos}3位 ${best.third.name}（${best.third.avg.toFixed(2)}）が${best.losePos}2位 ${best.second.name}（${best.second.avg.toFixed(2)}）を${best.diff.toFixed(2)}上回ったため、${best.gainPos}を3名・${best.losePos}を1名に変更。`);
  }else{
    notes.push('FPは基本フォーメーションの2-2-2で選出。3位と他ポジション2位に0.50以上の差がないため変更なし。');
  }
  return {counts,notes};
}

function resolveUnique(cands,formation){
  const needs={GK:1,...formation.counts};
  const selected={GK:[],DF:[],MF:[],FW:[]};
  const cursors={GK:0,DF:0,MF:0,FW:0};

  // Fill requested slots, then repeatedly resolve duplicate players by keeping
  // the position where that player's average rating is higher.
  for(const pos of POS){
    while(selected[pos].length<needs[pos] && cursors[pos]<cands[pos].length){
      selected[pos].push(cands[pos][cursors[pos]++]);
    }
  }

  const notes=[];
  let guard=0;
  while(guard++<50){
    const occurrences=new Map();
    for(const pos of POS)for(const x of selected[pos]){
      if(!occurrences.has(x.playerId))occurrences.set(x.playerId,[]);
      occurrences.get(x.playerId).push({pos,x});
    }
    const dup=[...occurrences.entries()].find(([,arr])=>arr.length>1);
    if(!dup)break;

    const [playerId,arr]=dup;
    arr.sort((a,b)=>b.x.avg-a.x.avg||b.x.games-a.x.games);
    const keep=arr[0];
    for(const remove of arr.slice(1)){
      selected[remove.pos]=selected[remove.pos].filter(x=>x!==remove.x);
      notes.push(`${remove.x.name}は${keep.pos} ${keep.x.avg.toFixed(2)}の方が${remove.pos} ${remove.x.avg.toFixed(2)}より高いため、${keep.pos}で優先選出。`);
      while(selected[remove.pos].length<needs[remove.pos] && cursors[remove.pos]<cands[remove.pos].length){
        const cand=cands[remove.pos][cursors[remove.pos]++];
        const already=POS.some(p=>selected[p].some(x=>x.playerId===cand.playerId));
        if(!already){selected[remove.pos].push(cand);break;}
      }
    }
  }
  return {selected,notes,needs};
}

function card(x,pos){
  if(!x)return `<div class="best7-player missing"><span>${pos}</span><b>選出なし</b><small>資格者不足</small></div>`;
  return `<a class="best7-player pos-${pos.toLowerCase()}" href="player.html?id=${encodeURIComponent(x.playerId)}">
    <span class="best7-pos">${pos}</span>
    <b>${esc(x.name)}</b>
    <strong>${x.avg.toFixed(2)}</strong>
    <small>${x.games}試合</small>
  </a>`;
}
function renderLine(id,pos,list,count){
  const host=$(id);
  const arr=[...list];
  while(arr.length<count)arr.push(null);
  host.dataset.count=count;
  host.innerHTML=arr.map(x=>card(x,pos)).join('');
}

function renderCandidates(cands,selected){
  $('candidateColumns').innerHTML=POS.map(pos=>{
    const chosen=new Set(selected[pos].map(x=>x.playerId));
    const rows=cands[pos];
    return `<div class="candidate-column"><div class="candidate-head pos-${pos.toLowerCase()}"><b>${pos}</b><span>${rows.length}人</span></div>
      <div class="candidate-list">${rows.length?rows.map((x,i)=>`<a href="player.html?id=${encodeURIComponent(x.playerId)}" class="${chosen.has(x.playerId)?'is-selected':''}">
        <span class="candidate-rank">${i+1}</span><b>${esc(x.name)}</b><strong>${x.avg.toFixed(2)}</strong><small>${x.games}試合</small>
      </a>`).join(''):'<div class="candidate-empty">資格者なし</div>'}</div></div>`;
  }).join('');
}

function render(){
  if(!days.length){
    $('status').textContent='対象となる通常試合がありません。';
    return;
  }
  const day=days[dayIndex];
  $('daySelect').value=day;
  const matches=rowsForDay(day);
  const cands=candidatesForDay(day);
  const formation=initialFormation(cands);
  const resolved=resolveUnique(cands,formation);
  const sel=resolved.selected;

  $('sectionDate').textContent=day;
  $('sectionGames').textContent=`${matches.length}試合`;
  $('formation').textContent=`1-${formation.counts.DF}-${formation.counts.MF}-${formation.counts.FW}`;
  $('status').textContent='';

  renderLine('gkLine','GK',sel.GK,1);
  renderLine('dfLine','DF',sel.DF,formation.counts.DF);
  renderLine('mfLine','MF',sel.MF,formation.counts.MF);
  renderLine('fwLine','FW',sel.FW,formation.counts.FW);

  const total=POS.reduce((n,p)=>n+sel[p].length,0);
  const shortage=[];
  for(const pos of POS)if(sel[pos].length<resolved.needs[pos])shortage.push(`${pos} ${resolved.needs[pos]-sel[pos].length}枠`);
  const reasons=[...formation.notes,...resolved.notes];
  if(shortage.length)reasons.push(`選出資格者が不足しているため、${shortage.join('・')}は空席。`);
  $('selectionReason').innerHTML=reasons.map((x,i)=>`<p><span>${i+1}</span>${esc(x)}</p>`).join('');

  $('selectedList').innerHTML=POS.flatMap(pos=>sel[pos].map(x=>`<a href="player.html?id=${encodeURIComponent(x.playerId)}"><span class="mini-pos pos-${pos.toLowerCase()}">${pos}</span><b>${esc(x.name)}</b><strong>${x.avg.toFixed(2)}</strong><small>${x.games}試合</small></a>`)).join('') || '<div class="candidate-empty">選出なし</div>';
  renderCandidates(cands,sel);

  $('prevDay').disabled=dayIndex<=0;
  $('nextDay').disabled=dayIndex>=days.length-1;
}
function initSelect(){
  $('daySelect').innerHTML=days.map(d=>`<option value="${d}">${d}</option>`).join('');
  dayIndex=Math.max(0,days.length-1);
  $('daySelect').value=days[dayIndex]||'';
}
$('prevDay').onclick=()=>{if(dayIndex>0){dayIndex--;render()}};
$('nextDay').onclick=()=>{if(dayIndex<days.length-1){dayIndex++;render()}};
$('daySelect').onchange=e=>{const i=days.indexOf(e.target.value);if(i>=0){dayIndex=i;render()}};

fetch('data/player-match-stats.json').then(r=>{
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  return r.json();
}).then(j=>{
  data=j;buildDays();initSelect();render();
}).catch(e=>{
  $('status').textContent=`読込失敗: ${e.message}`;
});
