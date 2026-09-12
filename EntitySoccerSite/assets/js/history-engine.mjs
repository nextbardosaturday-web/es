const number=v=>v!==null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const mean=a=>{const values=a.map(number).filter(v=>v!==null);return values.length?values.reduce((x,y)=>x+y,0)/values.length:null;};
export const positions=['GK','DF','MF','FW'];
export function normalizeLegacy(data){return (data.playerMatches||[]).map(r=>({gameId:String(r.gameId),player:r.player,position:r.position||'ANY',team:String(r.team),gf:number(r.teamGoalsFor),ga:number(r.teamGoalsAgainst),rating:number(r.stats?.rating),goals:number(r.stats?.goals),assists:number(r.stats?.assists),attack:number(r.stats?.detail?.SHOOT),defense:(r.stats?.detail?.CUT==null&&r.stats?.detail?.SAVE==null)?null:Number(r.stats.detail.CUT||0)+Number(r.stats.detail.SAVE||0)}));}
export function normalizeModern(data){return(data.matches||[]).flatMap(m=>(m.players||[]).map(r=>({gameId:String(m.gameId),player:r.currentName||r.stats?.name||r.playerId,position:r.position||'ANY',team:r.teamSide==='TEAM_WEST'?'1':'2',gf:number(r.goalsFor),ga:number(r.goalsAgainst),rating:number(r.stats?.rating?.value),goals:number(r.stats?.shots?.goals),assists:number(r.stats?.assists),attack:number(r.stats?.shots?.xg),defense:r.stats?.interceptions?.won==null?null:Number(r.stats.interceptions.won||0)+Number(r.stats.blocks?.total||0)+Number(r.stats.saves?.total||0),category:m.category,includeOverall:m.includeOverall})));}
export function selectRows(rows,{from='',to='',category='all'}={}){return rows.filter(r=>{const date=r.gameId.slice(0,8);return(!from||date>=from.replaceAll('-',''))&&(!to||date<=to.replaceAll('-',''))&&(category==='all'||(category==='official'?r.includeOverall:r.category===category));});}
export function summarize(rows){const valid=rows.filter(r=>r.gf!==null&&r.ga!==null);return{games:rows.length,wins:valid.filter(r=>r.gf>r.ga).length,draws:valid.filter(r=>r.gf===r.ga).length,losses:valid.filter(r=>r.gf<r.ga).length,winRate:valid.length?valid.filter(r=>r.gf>r.ga).length/valid.length:null,rating:mean(rows.map(r=>r.rating)),ratingN:rows.filter(r=>r.rating!==null).length,gf:valid.reduce((a,r)=>a+r.gf,0),ga:valid.reduce((a,r)=>a+r.ga,0)};}
export function compatibility(rows,player,{position='ANY',partnerPosition='ANY',minGames=3,relation='same'}={}){
 const mine=rows.filter(r=>r.player===player&&(position==='ANY'||r.position===position));
 const byGame=new Map();for(const r of rows){if(!byGame.has(r.gameId))byGame.set(r.gameId,[]);byGame.get(r.gameId).push(r);}
 const partners=new Map();for(const me of mine)for(const other of byGame.get(me.gameId)||[]){if(other.player===player||(partnerPosition!=='ANY'&&other.position!==partnerPosition)||(relation==='same')!==(other.team===me.team))continue;const key=other.player+'|'+other.position;if(!partners.has(key))partners.set(key,{player:other.player,position:other.position,mine:[],other:[]});partners.get(key).mine.push(me);partners.get(key).other.push(other);}
 return [...partners.values()].filter(p=>p.mine.length>=minGames).map(p=>{const ids=new Set(p.mine.map(r=>r.gameId)),without=mine.filter(r=>!ids.has(r.gameId)),withStats=summarize(p.mine),withoutStats=summarize(without),delta=withStats.rating===null||withoutStats.rating===null?null:withStats.rating-withoutStats.rating;return{player:p.player,position:p.position,...withStats,without:withoutStats,delta,partnerRating:mean(p.other.map(r=>r.rating)),adjusted:delta===null?null:delta*p.mine.length/(p.mine.length+5)};});
}
export function combination(rows,assignments,{exact=false}={}){
 const chosen=assignments.filter(a=>a.side==='west'||a.side==='east');if(!chosen.length)return{matches:[],west:summarize([]),east:summarize([])};
 if(new Set(chosen.map(a=>a.player)).size!==chosen.length)throw new Error('同じ選手を重複して配置できません');
 const groups=new Map();for(const r of rows){if(!groups.has(r.gameId))groups.set(r.gameId,[]);groups.get(r.gameId).push(r);}
 const matches=[];for(const[gameId,rs]of groups){for(const westTeam of ['1','2']){
  const team=a=>a.side==='west'?westTeam:(westTeam==='1'?'2':'1');
  if(!chosen.every(a=>rs.some(r=>r.player===a.player&&r.team===team(a)&&(a.position==='ANY'||r.position===a.position))))continue;
  if(exact&&rs.length!==chosen.length)continue;
  const w=rs.filter(r=>r.team===westTeam),e=rs.filter(r=>r.team!==westTeam);if(!w.length||!e.length)continue;
  matches.push({gameId,west:{...w[0],rating:mean(w.map(r=>r.rating))},east:{...e[0],rating:mean(e.map(r=>r.rating))}});break;
 }}return{matches,west:summarize(matches.map(m=>m.west)),east:summarize(matches.map(m=>m.east))};
}
export function legacyMatches(data){
 const grouped=new Map();for(const r of data.matches||[]){const id=String(r.gameId);if(!grouped.has(id))grouped.set(id,{gameId:id,teams:{}});grouped.get(id).teams[String(r.team)]=r;}
 return [...grouped.values()].map(m=>{
  const west=m.teams['1'],east=m.teams['2'];const w=number(west?.teamGoalsFor??east?.teamGoalsAgainst),e=number(east?.teamGoalsFor??west?.teamGoalsAgainst);
  const highlights=(data.highlights||[]).filter(h=>String(h.gameId)===m.gameId).sort((a,b)=>Number(a.highlightId)-Number(b.highlightId));
  let previous=[0,0],complete=true;const scores=[];
  for(const h of highlights){const hit=String(h.highlight).match(/^\s*(\d+)\s*[-－–]\s*(\d+)/);if(!hit){complete=false;continue;}const score=[+hit[1],+hit[2]],dx=score[0]-previous[0],dy=score[1]-previous[1];if(!((dx===1&&dy===0)||(dx===0&&dy===1)))complete=false;scores.push(score);previous=score;}
  complete=complete&&w!==null&&e!==null&&previous[0]===w&&previous[1]===e;
  const winner=w===e?null:w>e?'1':'2';const comeback=complete?(winner==='1'?scores.some(([a,b])=>a<b):winner==='2'?scores.some(([a,b])=>a>b):false):null;
  return{...m,westScore:w,eastScore:e,margin:w===null||e===null?null:Math.abs(w-e),comeback,highlights,players:(data.playerMatches||[]).filter(p=>String(p.gameId)===m.gameId)};
 }).sort((a,b)=>b.gameId.localeCompare(a.gameId));
}
export function playerProfile(rows,player,position='ANY'){
 const all=rows.filter(r=>r.player===player),pos=position==='ANY'?all:all.filter(r=>r.position===position),chosen=pos.length?pos:all,base=mean(rows.map(r=>r.rating))??6;
 const rating=mean(chosen.map(r=>r.rating));const count=chosen.filter(r=>r.rating!==null).length;
 return{player,position,games:chosen.length,rating,estimate:rating===null?base:(rating*count+base*5)/(count+5),fallback:position!=='ANY'&&!pos.length,attack:mean(chosen.map(r=>r.attack))??0,defense:mean(chosen.map(r=>r.defense))??0};
}
export function balancedTeams(rows,selected,{gk=1,df=2,mf=2,fw=2,ratingWeight=1,attackWeight=0,defenseWeight=0,chemistryWeight=0,attempts=2500}={}){
 if(![gk,df,mf,fw].every(n=>Number.isInteger(n)&&n>=0&&n<=10))throw new Error('ポジション人数は0〜10の整数で指定してください');
 const count=selected.length;if(count<2||count>20||count%2)throw new Error('2〜20人の偶数人数を選んでください');
 if(new Set(selected.map(p=>p.player)).size!==count)throw new Error('選手が重複しています');
 const size=count/2,slots=[...Array(gk).fill('GK'),...Array(df).fill('DF'),...Array(mf).fill('MF'),...Array(fw).fill('FW')];if(slots.length!==size)throw new Error('各チームのポジション人数を参加人数の半分に合わせてください');
 const profiles=new Map(selected.map(p=>[p.player,Object.fromEntries(positions.map(pos=>[pos,playerProfile(rows,p.player,pos)]))]));
 const totalAttack=Math.max(1,...[...profiles.values()].flatMap(v=>Object.values(v).map(p=>p.attack))),totalDefense=Math.max(1,...[...profiles.values()].flatMap(v=>Object.values(v).map(p=>p.defense)));
 const fit=team=>{const memo=new Map();function solve(i,mask){if(i===size)return{cost:0,players:[]};const key=i+':'+mask;if(memo.has(key))return memo.get(key);let best=null;const used=new Set();for(let j=0;j<size;j++){if(mask&(1<<j)||used.has(slots[j]))continue;used.add(slots[j]);const player=team[i],pos=slots[j];if(player.position!=='ANY'&&player.position!==pos)continue;const profile=profiles.get(player.player)[pos],rest=solve(i+1,mask|(1<<j));if(!rest)continue;const cost=(profile.fallback?1:0)-.05*profile.estimate-.03*Math.log1p(profile.games)+rest.cost;if(!best||cost<best.cost)best={cost,players:[profile,...rest.players]};}memo.set(key,best);return best;}return solve(0,0);};
 const fixedWest=selected.filter(p=>p.lock==='west'),fixedEast=selected.filter(p=>p.lock==='east'),free=selected.filter(p=>!p.lock||p.lock==='auto');if(fixedWest.length>size||fixedEast.length>size)throw new Error('固定した人数がチーム定員を超えています');
 const combinations=[];function enumerate(i,west){if(combinations.length>=200000)return;if(west.length===size-fixedWest.length){combinations.push([...west]);return;}for(let j=i;j<free.length;j++)enumerate(j+1,[...west,j]);}enumerate(0,[]);
 // Deterministic shuffle avoids bias toward the first names when search is bounded.
 let seed=314159;for(let i=combinations.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[combinations[i],combinations[j]]=[combinations[j],combinations[i]];}
 const affinity=new Map();const chemistry=team=>{let total=0;for(let i=0;i<team.length;i++)for(let j=i+1;j<team.length;j++){const a=team[i],b=team[j],key=a.player+'|'+a.position+'|'+b.player+'|'+b.position;if(!affinity.has(key)){const pair=compatibility(rows,a.player,{position:a.position,partnerPosition:b.position,minGames:2}).find(p=>p.player===b.player);affinity.set(key,pair?.adjusted??0);}total+=affinity.get(key);}return total/Math.max(1,team.length);};
 const score=team=>team.reduce((s,p)=>s+p.estimate*ratingWeight+p.attack/totalAttack*attackWeight+p.defense/totalDefense*defenseWeight,0)/size;
 const solutions=[],seen=new Set();let tried=0;
 for(const indexes of combinations.slice(0,attempts)){tried++;const ix=new Set(indexes),w=fit([...fixedWest,...free.filter((_,i)=>ix.has(i))]),e=fit([...fixedEast,...free.filter((_,i)=>!ix.has(i))]);if(!w||!e)continue;const westScore=score(w.players),eastScore=score(e.players),wc=chemistryWeight?chemistry(w.players):0,ec=chemistryWeight?chemistry(e.players):0,objective=Math.abs(westScore-eastScore)+.2*(w.cost+e.cost)-chemistryWeight*(wc+ec);const key=[w.players.map(p=>p.player).sort().join(','),e.players.map(p=>p.player).sort().join(',')].sort().join('|');if(seen.has(key))continue;seen.add(key);solutions.push({west:w.players,east:e.players,westScore,eastScore,gap:Math.abs(westScore-eastScore),objective,chemistry:wc+ec});}
 solutions.sort((a,b)=>a.objective-b.objective);if(!solutions.length)throw new Error('固定チーム・ポジション条件を満たす候補がありません。条件を緩めてください');return{solutions:solutions.slice(0,5),tried,total:combinations.length};
}
