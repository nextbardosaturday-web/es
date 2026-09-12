const $=id=>document.getElementById(id);
let data=null,tab="official",posTab="ALL",sortState={key:"points",dir:-1};
const POSITIONS=["GK","DF","MF","FW"];
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const get=(o,p,d=0)=>p.split(".").reduce((v,k)=>v?.[k],o)??d;
const sum=(rows,p)=>rows.reduce((a,r)=>a+Number(get(r.stats,p,0)),0);
function categoryOk(m){return tab==="all"||(tab==="official"?m.includeOverall:m.category==="exhibition")}
function dateOk(m){const from=$("from").value,to=$("to").value;return(!from||m.date>=from)&&(!to||m.date<=to)}
function eventCount(){
 const set=new Set();
 for(const m of data.matches||[]){if(categoryOk(m)&&dateOk(m)){const x=String(m.gameId||m.date||'').match(/\d{8}/)?.[0]||m.date;set.add(x)}}
 return Math.max(1,set.size);
}
function lerp(raw,points){
 if(raw<=points[0][0]){const [x0,y0]=points[0],[x1,y1]=points[1];return y0+(raw-x0)*(y1-y0)/(x1-x0)}
 for(let i=1;i<points.length;i++){const [x0,y0]=points[i-1],[x1,y1]=points[i];if(raw<=x1)return y0+(raw-x0)*(y1-y0)/(x1-x0)}
 const [x0,y0]=points.at(-2),[x1,y1]=points.at(-1);return y1+(raw-x1)*(y1-y0)/(x1-x0)
}
function factor(pos,k){return ({pass:{GK:1.5,DF:1,MF:1,FW:1.2},shoot:{GK:1,DF:1,MF:1,FW:1},dribble:{GK:1,DF:1,MF:1,FW:1},tackle:{GK:1,DF:1,MF:1.5,FW:1.6},intercept:{GK:1,DF:1,MF:1.4,FW:1.4}}[k]?.[pos]??1)}
function ability(rows,pos,k){
 if(!rows.length)return null;const g=rows.length,av=p=>sum(rows,p)/g;
 if(k==='pass'&&sum(rows,'passes.attempts')<=0)return 50;
 if(k==='shoot'&&sum(rows,'shots.attempts')<=0)return 50;
 if(k==='dribble'&&sum(rows,'dribbles.attempts')<=0)return 50;
 if(k==='tackle'&&sum(rows,'tackles.attempts')<=0)return 50;
 if(k==='intercept'&&pos==='GK'&&sum(rows,'saves.total')<=0)return 50;
 let raw=0,pts;
 if(k==='pass'){const a=av('passes.attempts'),ok=av('passes.successful');raw=(ok-Math.max(0,a-ok)*.25+av('keyPasses')*.25+av('assists')*.25)*factor(pos,k);pts=[[0,35],[2,45],[4,55],[6,65],[8,75],[10,85],[12,95]]}
 if(k==='shoot'){const a=av('shots.attempts'),on=av('shots.onTarget'),goals=av('shots.goals'),xg=av('shots.xg');raw=(on-Math.max(0,a-on)*.25+goals*5.5+(goals-xg)*.5)*factor(pos,k);pts=[[0,35],[1,45],[2,55],[3,65],[4,75],[5,80],[7,90],[10,99]]}
 if(k==='dribble'){const a=av('dribbles.attempts'),ok=av('dribbles.successful');raw=(ok-Math.max(0,a-ok)*.25)*factor(pos,k);pts=[[0,35],[1,45],[2,55],[3,65],[4,75],[5,85],[6,92]]}
 if(k==='activity'){raw=pos==='GK'?av('runningDistance')/20:av('runningDistance')/100+av('touches')/20;pts=pos==='GK'?[[4,40],[5,45],[6,50],[7,55],[8,60],[9,65],[10,70]]:[[5,40],[6,45],[7,50],[8,55],[9,60],[10,65],[11,70],[12,75],[14,85]]}
 if(k==='positioning'){if(pos==='GK')return null;raw=av('rating.positioning');pts=[[-.20,25],[-.10,35],[-.05,43],[0,50],[.05,60],[.10,70],[.15,80],[.20,90],[.25,97]]}
 if(k==='tackle'){const a=av('tackles.attempts'),ok=av('tackles.won');raw=(ok-Math.max(0,a-ok)*.1)*factor(pos,k);pts=[[-1,30],[0,35],[1,45],[2,55],[3,65],[4,75],[5,85],[6,92]]}
 if(k==='intercept'){raw=pos==='GK'?av('saves.total'):(av('interceptions.won')+av('interceptions.blocked')+av('blocks.shot'))*factor(pos,k);pts=pos==='GK'?[[0,35],[2,45],[4,58],[5,65],[6,70],[7,76],[8,81],[10,90]]:[[0,35],[1,47],[2,58],[3,68],[4,78],[5,86],[6,92]]}
 const base=lerp(raw,pts),conf=Math.max(0,Math.min(1,rows.length/Math.max(1,eventCount()*2)));
 return Math.max(20,Math.min(99,Math.round(50+(base-50)*conf)));
}
function rank(v){return v>=90?'S':v>=80?'A':v>=70?'B':v>=60?'C':v>=50?'D':v>=40?'E':'F'}
function abilityCell(rows,pos,k,ok=true){if(!ok)return'―';const v=ability(rows,pos,k);if(v==null)return'―';const r=rank(v);return `<span class="list-ability"><b class="list-rank r${r.toLowerCase()}">${r}</b><small>${v}</small></span>`}

const LIST_OVERALL_ABILITY_WEIGHTS={"GK":{"pass":0.18,"intercept":0.62,"activity":0.2},"DF":{"intercept":0.27,"tackle":0.22,"positioning":0.16,"pass":0.17,"activity":0.09,"dribble":0.055,"shoot":0.035},"MF":{"pass":0.27,"dribble":0.19,"positioning":0.16,"activity":0.15,"tackle":0.10,"intercept":0.075,"shoot":0.055},"FW":{"shoot":0.29,"dribble":0.20,"pass":0.16,"positioning":0.14,"activity":0.10,"intercept":0.055,"tackle":0.055}};
function listOverallBase(rows,pos){
 const ws=LIST_OVERALL_ABILITY_WEIGHTS[pos]||LIST_OVERALL_ABILITY_WEIGHTS.MF;
 let total=0,w=0;
 for(const [k,weight] of Object.entries(ws)){
   if(pos==='GK'&&['shoot','dribble','tackle'].includes(k))continue;
   const v=ability(rows,pos,k);
   if(Number.isFinite(v)){total+=v*weight;w+=weight}
 }
 return w?total/w:50;
}
function listTraitProxy(rows,pos){
 if(!rows.length)return 50;
 const av=p=>sum(rows,p)/rows.length;
 // 一覧ではカードの全特性判定を再実装せず、POSに合う特性元指標を軽く補正。
 let parts=[];
 if(pos==='FW')parts=[av('keyPasses')*3,av('assists')*4,av('shots.goals')*5,av('dribbles.successful')*.8];
 else if(pos==='MF')parts=[av('keyPasses')*4,av('assists')*3,av('passes.successful')*.35,av('runningDistance')/150];
 else if(pos==='DF')parts=[(av('interceptions.won')+av('blocks.shot'))*3,av('tackles.won')*2,av('passes.successful')*.2];
 else parts=[av('saves.total')*3,av('passes.successful')*.25];
 const raw=parts.reduce((a,b)=>a+b,0);
 return Math.max(30,Math.min(70,50+(raw-5)*1.2));
}
function listOverall(rows,pos){
 return Math.max(20,Math.min(99,Math.round(listOverallBase(rows,pos)+(listTraitProxy(rows,pos)-50)*.08)));
}
function overallCell(rows,pos){
 const v=listOverall(rows,pos),r=rank(v);return `<span class="list-ability overall-list"><b class="list-rank r${r.toLowerCase()}">${r}</b><small>${v}</small></span>`;
}
function sortHead(label,key){const a=sortState.key===key,arrow=a?(sortState.dir>0?' ▲':' ▼'):'';return `<th class="sortable-head" data-sort-key="${key}">${label}<span>${arrow}</span></th>`}
function listSortValue(p,key,pos){
 if(key==='name')return p.name.toLowerCase();
 if(key==='overall')return listOverall(p.rows,pos);
 if(['pass','shoot','dribble','tackle','intercept','positioning','activity'].includes(key)){const v=ability(p.rows,pos,key);return v==null?-Infinity:v}
 return Number(p[key]??-Infinity);
}
function bindSort(){
 document.querySelectorAll('#playerHead [data-sort-key]').forEach(th=>th.onclick=()=>{const k=th.dataset.sortKey;if(sortState.key===k)sortState.dir*=-1;else{sortState.key=k;sortState.dir=k==='name'?1:-1}aggregate()});
}
function aggregate(){
 const q=$("search").value.trim().toLowerCase(),map=new Map();
 for(const m of data.matches||[]){
  if(!categoryOk(m)||!dateOk(m))continue;
  for(const p of m.players||[]){
   const pos=String(p.position||'').toUpperCase();if(posTab!=="ALL"&&pos!==posTab)continue;
   const s=map.get(p.playerId)||{playerId:p.playerId,name:p.currentName,matches:0,points:0,wins:0,draws:0,losses:0,gf:0,ga:0,rows:[]};
   s.matches++;s.points+=p.points;s.wins+=p.result==="win";s.draws+=p.result==="draw";s.losses+=p.result==="loss";s.gf+=p.goalsFor;s.ga+=p.goalsAgainst;s.rows.push({...p,match:m});map.set(p.playerId,s);
  }
 }
 const rows=[...map.values()].filter(p=>p.name.toLowerCase().includes(q)).sort((a,b)=>{const av=listSortValue(a,sortState.key,posTab),bv=listSortValue(b,sortState.key,posTab);if(typeof av==='string')return av.localeCompare(bv)*sortState.dir;return av===bv?a.name.localeCompare(b.name):(av-bv)*sortState.dir});
 $("playerCount").textContent=`${rows.length}選手`;
 if(posTab==="ALL"){
  $("playerHead").innerHTML=`<tr>${sortHead('選手名','name')}${sortHead('試合数','matches')}${sortHead('勝点','points')}${sortHead('勝','wins')}${sortHead('分','draws')}${sortHead('敗','losses')}${sortHead('得点','gf')}${sortHead('失点','ga')}</tr>`;
  $("playerRows").innerHTML=rows.length?rows.map(p=>`<tr><td><a class="player-name" href="player.html?id=${encodeURIComponent(p.playerId)}">${esc(p.name)}</a></td><td>${p.matches}</td><td><b>${p.points}</b></td><td>${p.wins}</td><td>${p.draws}</td><td>${p.losses}</td><td>${p.gf}</td><td>${p.ga}</td></tr>`).join(""):'<tr><td colspan="8" class="empty">該当する選手がいません</td></tr>';
 }else{
  const pos=posTab;
  $("playerHead").innerHTML=`<tr>${sortHead('選手名','name')}${sortHead('試合数','matches')}${sortHead('総合','overall')}${sortHead('パス','pass')}${sortHead('シュート','shoot')}${sortHead('ドリブル','dribble')}${sortHead('タックル','tackle')}${sortHead(pos==='GK'?'セーブ':'カット/ブロック','intercept')}${sortHead('ポジショニング','positioning')}${sortHead('積極性','activity')}</tr>`;
  $("playerRows").innerHTML=rows.length?rows.map(p=>`<tr><td><a class="player-name" href="player.html?id=${encodeURIComponent(p.playerId)}">${esc(p.name)}</a></td><td>${p.matches}</td><td>${overallCell(p.rows,pos)}</td><td>${abilityCell(p.rows,pos,'pass')}</td><td>${abilityCell(p.rows,pos,'shoot',pos!=='GK')}</td><td>${abilityCell(p.rows,pos,'dribble',pos!=='GK')}</td><td>${abilityCell(p.rows,pos,'tackle',pos!=='GK')}</td><td>${abilityCell(p.rows,pos,'intercept')}</td><td>${abilityCell(p.rows,pos,'positioning',pos!=='GK')}</td><td>${abilityCell(p.rows,pos,'activity')}</td></tr>`).join(""):'<tr><td colspan="10" class="empty">該当する選手がいません</td></tr>';
 }
 bindSort();
}
document.querySelectorAll(".type-tab").forEach(b=>b.addEventListener("click",()=>{tab=b.dataset.tab;document.querySelectorAll(".type-tab").forEach(x=>x.classList.toggle("active",x===b));aggregate()}));
document.querySelectorAll("[data-list-pos]").forEach(b=>b.addEventListener("click",()=>{posTab=b.dataset.listPos;document.querySelectorAll("[data-list-pos]").forEach(x=>x.classList.toggle("active",x===b));aggregate()}));
["search","from","to"].forEach(id=>$(id).addEventListener("input",aggregate));
$("reset").addEventListener("click",()=>{$("from").value="";$("to").value="";aggregate()});
fetch("data/player-match-stats.json").then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}).then(j=>{data=j;aggregate()}).catch(e=>$("playerRows").innerHTML=`<tr><td colspan="8" class="empty">読込失敗: ${e.message}</td></tr>`);
