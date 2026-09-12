const sum=a=>a.reduce((s,v)=>s+v,0);
function rankPairs(events,key){const map=new Map();for(const e of events){const pair=key(e);if(!pair?.[0]||!pair?.[1])continue;const id=JSON.stringify(pair),r=map.get(id)||{from:pair[0],to:pair[1],attempts:0,success:0,games:new Set()};r.attempts++;if(e.success)r.success++;r.games.add(e.gameId);map.set(id,r);}return [...map.values()].map(r=>({...r,games:r.games.size,rate:r.success/r.attempts})).sort((a,b)=>b.success-a.success||b.attempts-a.attempts||a.from.localeCompare(b.from));}
export function summarizeInsights(matches){
 const events=matches.flatMap(m=>m.events.map(e=>({...e,gameId:m.gameId}))),goals=events.filter(e=>e.type==='SHOT'&&e.result==='GOAL');
 const margins=new Map();let comebacks=0,draws=0;const buckets=Array(10).fill(0);
 for(const m of matches){const w=m.teams?.TEAM_WEST?.shots?.goals??0,e=m.teams?.TEAM_EAST?.shots?.goals??0;const margin=Math.abs(w-e);margins.set(margin,(margins.get(margin)||0)+1);if(w===e)draws++;const gs=m.events.filter(e=>e.type==='SHOT'&&e.result==='GOAL').sort((a,b)=>a.time-b.time);let ws=0,es=0,behind=false;for(const g of gs){if(g.team==='TEAM_WEST')ws++;else if(g.team==='TEAM_EAST')es++;if((w>e&&ws<es)||(e>w&&es<ws))behind=true;}if(behind&&ws===w&&es===e)comebacks++;}
 for(const g of goals)buckets[Math.min(9,Math.max(0,Math.floor(g.time/60)))]++;
 return {games:matches.length,goals:goals.length,draws,comebacks,margins:[...margins].sort((a,b)=>a[0]-b[0]),buckets,goalsPerGame:matches.length?goals.length/matches.length:null,
 assists:rankPairs(goals.filter(g=>g.assistPlayer).map(g=>({...g,success:true})),g=>[g.assistPlayer,g.player]),
 passes:rankPairs(events.filter(e=>e.type==='PASS'),e=>[e.player,e.target]),
 goalOpponents:rankPairs(goals.map(g=>({...g,success:true})),g=>[g.player,g.opponentGK]),
 tackles:rankPairs(events.filter(e=>e.type==='TACKLE'),e=>[e.player,e.target]),dribbles:rankPairs(events.filter(e=>e.type==='DRIBBLE'),e=>[e.player,e.target]),
 patterns:goals.flatMap(g=>(g.patterns||[]).map(p=>({...p,player:g.player,assistPlayer:g.assistPlayer,opponentGK:g.opponentGK,gameId:g.gameId,time:g.time}))),
 coverage:{events:events.length,positioned:events.filter(e=>e.start).length,goalsWithKeeper:goals.filter(e=>e.opponentGK).length,tacklesWithTarget:events.filter(e=>e.type==='TACKLE'&&e.target).length,tackles:events.filter(e=>e.type==='TACKLE').length}
 };
}
