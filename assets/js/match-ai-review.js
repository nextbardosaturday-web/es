const params=new URLSearchParams(location.search);
const gameId=params.get('id')||'';
const host=document.getElementById('matchAiReviews');
const status=document.getElementById('matchAiReviewStatus');
const matchReviewHost=document.getElementById('matchAiMatchReview');
const matchReviewStatus=document.getElementById('matchAiMatchReviewStatus');
const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const POS_ORDER={GK:0,DF:1,MF:2,FW:3};

function reviewText(v){
  if(typeof v==='string')return v;
  if(v&&typeof v.text==='string')return v.text;
  return '';
}
function sideKey(v){return String(v||'').includes('WEST')?'WEST':'EAST'}
function sideLabel(v){return sideKey(v)}

async function load(){
  if(!host)return;
  try{
    const [reviewsRes,statsRes]=await Promise.all([
      fetch('data/match-ai-reviews.json',{cache:'no-store'}),
      fetch('data/player-match-stats.json',{cache:'no-store'})
    ]);
    const reviews=reviewsRes.ok?await reviewsRes.json():{matches:{}};
    const stats=statsRes.ok?await statsRes.json():{matches:[]};
    const match=(stats.matches||[]).find(m=>String(m.gameId)===String(gameId));
    const review=reviews.matches?.[gameId];
    const matchText=reviewText(review?.matchReview??review?.match??review?.review);
    if(matchReviewHost){
      if(matchText){
        if(matchReviewStatus)matchReviewStatus.textContent='生成済み';
        matchReviewHost.innerHTML=`<p>${esc(matchText)}</p>`;
      }else{
        if(matchReviewStatus)matchReviewStatus.textContent='評論未生成';
        matchReviewHost.innerHTML='<div class="seq-empty">この試合の試合評はまだ生成されていません。</div>';
      }
    }
    if(!match){host.innerHTML='<div class="seq-empty">試合データがありません。</div>';return}
    if(!review?.players||!Object.keys(review.players).length){
      status.textContent='評論未生成';
      host.innerHTML='<div class="seq-empty">この試合の評論はまだ生成されていません。</div>';
      return;
    }

    status.textContent='生成済み';
    const players=[...(match.players||[])].sort((a,b)=>{
      const side=sideKey(a.teamSide).localeCompare(sideKey(b.teamSide));
      if(side)return side;
      const pa=POS_ORDER[String(a.position||'').toUpperCase()]??99;
      const pb=POS_ORDER[String(b.position||'').toUpperCase()]??99;
      return pa-pb||String(a.currentName).localeCompare(String(b.currentName));
    });

    const groups=['WEST','EAST'].map(side=>{
      const cards=players.filter(p=>sideKey(p.teamSide)===side).map(p=>{
        const raw=review.players[p.playerId]??review.players[p.currentName];
        const text=reviewText(raw);
        if(!text)return '';
        const pos=String(p.position||'—').toUpperCase();
        return `<article class="match-ai-player-review">
          <header>
            <span class="review-position review-position-${pos.toLowerCase()}">${esc(pos)}</span>
            <b>${esc(p.currentName)}</b>
            ${Number.isFinite(Number(p.stats?.rating?.value))?`<span class="review-rating">採点 <strong>${Number(p.stats.rating.value).toFixed(2)}</strong></span>`:''}
          </header>
          <p>${esc(text)}</p>
        </article>`;
      }).join('');
      if(!cards)return '';
      return `<section class="match-ai-team-review">
        <div class="match-ai-team-title"><span class="review-side ${side.toLowerCase()}">${sideLabel(side)}</span></div>
        <div class="match-ai-review-grid">${cards}</div>
      </section>`;
    }).join('');

    host.innerHTML=groups||'<div class="seq-empty">表示できる評論がありません。</div>';
  }catch(e){
    status.textContent='読込失敗';
    host.innerHTML=`<div class="seq-empty">評論の読込に失敗しました: ${esc(e.message)}</div>`;
  }
}
load();
