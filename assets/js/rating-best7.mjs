const POS=['GK','DF','MF','FW'];
// Process each player once. For every quota combination retain the highest
// rating sum, so conflicts across several positions are resolved together.
export function selectRatingTeam(candidates,needs){
 const players=new Map();
 for(const pos of POS)for(const c of candidates[pos]||[]){if(!Number.isFinite(c.avg))continue;if(!players.has(c.playerId))players.set(c.playerId,[]);players.get(c.playerId).push({...c,pos});}
 let states=new Map([['0,0,0,0',{counts:[0,0,0,0],sum:0,picks:[]}]]);
 for(const options of players.values()){
  const next=new Map(states);
  for(const state of states.values())for(const c of options){const i=POS.indexOf(c.pos);if(state.counts[i]>=(needs[c.pos]||0))continue;const counts=[...state.counts];counts[i]++;const key=counts.join(','),sum=state.sum+c.avg;
   if(!next.has(key)||sum>next.get(key).sum+1e-10)next.set(key,{counts,sum,picks:[...state.picks,c]});
  }states=next;
 }
 const best=[...states.values()].sort((a,b)=>b.picks.length-a.picks.length||b.sum-a.sum)[0];
 const selected=Object.fromEntries(POS.map(pos=>[pos,best.picks.filter(c=>c.pos===pos).sort((a,b)=>b.avg-a.avg||String(a.playerId).localeCompare(String(b.playerId)))]));
 return {selected,needs,count:best.picks.length,average:best.picks.length?best.sum/best.picks.length:null};
}
