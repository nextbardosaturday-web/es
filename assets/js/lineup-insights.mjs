import {lineupFeatures} from './outcome-engine.mjs';
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
export const areaLabel=id=>['自陣','中盤','敵陣'][Math.floor(id/3)]+'・'+['左','中央','右'][id%3];
export function effectiveAreas(matches,contexts,{minimum=3}={}){
 const byId=new Map(matches.map(m=>[m.gameId,m])),groups=new Map();
 for(const c of contexts){const match=byId.get(c.gameId);if(!match||!c.field?.length||!c.field?.width)continue;
  const perGame=new Map();for(const p of c.positions||[]){if(p.samples<5||!Number.isFinite(p.x)||!Number.isFinite(p.z))continue;const side=p.team==='TEAM_WEST'?match.west:p.team==='TEAM_EAST'?match.east:[];const roster=side.find(r=>r.player===p.player||r.recordedName===p.player);if(!roster)continue;const name=roster.player,key=JSON.stringify([name,p.position,p.team]),r=perGame.get(key)||{player:name,position:p.position,team:p.team,x:0,z:0,n:0};r.x+=p.x*p.samples;r.z+=p.z*p.samples;r.n+=p.samples;perGame.set(key,r);}
  for(const p of perGame.values()){const x=p.x/p.n/c.field.length+.5,z=p.z/p.n/c.field.width+.5;if(x<0||x>1||z<0||z>1)continue;const area=Math.min(2,Math.floor(x*3))*3+Math.min(2,Math.floor(z*3)),key=JSON.stringify([p.player,p.position]);if(!groups.has(key))groups.set(key,{player:p.player,position:p.position,records:[]});groups.get(key).records.push({area,x,z,gameId:match.gameId,y:p.team==='TEAM_WEST'?match.y:-match.y});}
 }
 const rows=[];for(const g of groups.values())for(const area of new Set(g.records.map(r=>r.area))){const withArea=g.records.filter(r=>r.area===area),without=g.records.filter(r=>r.area!==area);const n=withArea.length,other=without.length,wins=withArea.filter(r=>r.y>0).length,draws=withArea.filter(r=>r.y===0).length;
  const rate=wins/n,otherRate=other?without.filter(r=>r.y>0).length/other:null,comparable=n>=minimum&&other>=minimum;
  rows.push({player:g.player,position:g.position,area,label:areaLabel(area),n,other,wins,draws,losses:n-wins-draws,rate,otherRate,difference:otherRate===null?null:rate-otherRate,comparable,bonus:comparable?(mean(withArea.map(r=>r.y))-mean(without.map(r=>r.y)))*Math.min(n,other)/(Math.min(n,other)+10):0,x:mean(withArea.map(r=>r.x)),z:mean(withArea.map(r=>r.z)),gameIds:withArea.map(r=>r.gameId)});
 }
 return rows.sort((a,b)=>Number(b.comparable)-Number(a.comparable)||b.bonus-a.bonus||b.n-a.n||a.player.localeCompare(b.player));
}
export function lineupCandidates(matches,{minimum=3}={}){
 const candidates=new Map();for(const m of matches)for(const p of [...m.west,...m.east]){const positions=p.roleStats?.length?p.roleStats.map(r=>r.position):[p.position];for(const position of new Set(positions)){if(!['GK','DF','MF','FW'].includes(position))continue;const key=JSON.stringify([p.player,position]);if(!candidates.has(key))candidates.set(key,{player:p.player,position,seconds:0,games:0});candidates.get(key).games++;const role=p.roleStats?.find(r=>r.position===position);candidates.get(key).seconds+=role?.seconds??p.playedSeconds??0;}}
 return [...candidates.values()].filter(c=>c.games>=minimum);
}
export function lineupScore(model,players,areas=[],locationWeight=.25){
 const totals={player:0,position:0,pair:0,formation:0,location:0};let knownPairs=0;for(const[k,v]of lineupFeatures(players)){const kind=JSON.parse(k)[0],weight=model.weights.get(k)||0;totals[kind]+=weight*v;if(kind==='pair'&&model.weights.has(k))knownPairs++;}
 const placements=players.map(p=>{const options=areas.filter(r=>r.player===p.player&&r.position===p.position&&r.comparable).sort((a,b)=>b.bonus-a.bonus);const area=options[0]||null;return{...p,area};});
 totals.location=locationWeight*placements.reduce((s,p)=>s+(p.area?.bonus||0),0)/Math.max(1,players.length);
 return{score:Object.values(totals).reduce((s,v)=>s+v,0),totals,knownPairs,placements};
}
export function combinationBestSeven(model,candidates,areas=[],{counts={GK:1,DF:2,MF:2,FW:2},locationWeight=.25,beamWidth=120}={}){
 if(Object.values(counts).some(n=>!Number.isInteger(n)||n<0)||counts.GK!==1||['GK','DF','MF','FW'].reduce((s,p)=>s+(counts[p]||0),0)!==7)throw Error('GK1人、合計7人の配置を指定してください');
 const slots=['GK','DF','MF','FW'].flatMap(p=>Array(counts[p]||0).fill(p));let beam=[{players:[],score:0}];
 for(const position of slots){const next=new Map();for(const state of beam)for(const p of candidates){if(p.position!==position||state.players.some(q=>q.player===p.player))continue;const players=[...state.players,p],key=JSON.stringify(players.map(p=>[p.player,p.position]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));if(next.has(key))continue;next.set(key,{players,...lineupScore(model,players,areas,locationWeight)});}
  beam=[...next.values()].sort((a,b)=>b.score-a.score||JSON.stringify(a.players).localeCompare(JSON.stringify(b.players))).slice(0,beamWidth);if(!beam.length)throw Error(position+'の候補が不足しています。最低試合数・期間・配置を変更してください');
 }
 return beam.slice(0,3);
}
