const NEUTRAL = 0.5;
const STYLES = [
  { name: "Warm Japandi",         v2Center: [0.80, 0.15, 0.80, 0.15, 0.15, 0.80] },
  { name: "Dark Moody Glam",      v2Center: [0.15, 0.80, 0.15, 0.80, 0.80, 0.15] },
  { name: "Coastal Bright",       v2Center: [0.80, 0.15, 0.15, 0.15, 0.15, 0.15] },
  { name: "Industrial Loft",      v2Center: [0.15, 0.80, 0.15, 0.80, 0.15, 0.15] },
  { name: "Maximalist Eclectic",  v2Center: [0.80, 0.80, 0.80, 0.80, 0.15, 0.80] },
  { name: "Heritage Traditional", v2Center: [0.80, 0.80, 0.80, 0.80, 0.80, 0.15] },
  { name: "Pure Minimal White",   v2Center: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15] },
  { name: "Biophilic Jungle",     v2Center: [0.15, 0.15, 0.80, 0.80, 0.15, 0.80] },
  { name: "Retro Mid-Century",    v2Center: [0.80, 0.80, 0.15, 0.15, 0.15, 0.80] },
];
const DIM_NAMES = ["warmth","complexity","organicness","density","traditionalism","character"];
const DELTA = 0.45;

function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}

function simulateGrid(a,b){
  const v2=Array(6).fill(NEUTRAL);
  for(let d=0;d<6;d++){
    let wSum=0,wTotal=0;
    for(const[idx,count]of[[a,3],[b,3]]){
      const dev=STYLES[idx].v2Center[d]-NEUTRAL;
      const sig=Math.abs(dev)*(count/6);
      wSum+=dev*sig;wTotal+=sig;
    }
    v2[d]=wTotal<0.01?NEUTRAL:clamp(NEUTRAL+wSum/wTotal,0,1);
  }
  return v2;
}

function getMostConflictedDim(a,b){
  let best=-1,bestMag=0;
  for(let i=0;i<6;i++){
    const dA=STYLES[a].v2Center[i]-NEUTRAL,dB=STYLES[b].v2Center[i]-NEUTRAL;
    if(Math.abs(dA)>=0.25&&Math.abs(dB)>=0.25&&Math.sign(dA)!==Math.sign(dB)){
      const mag=Math.abs(dA)+Math.abs(dB);
      if(mag>bestMag){bestMag=mag;best=i;}
    }
  }
  return best;
}

// Separation-weighted dim ranking (mirrors new buildNlpQuestions)
function getSeparationRankedDims(v2,a,b,exclude=[]){
  return Array.from({length:6},(_,i)=>{
    if(exclude.includes(i))return{dim:i,score:-1};
    const uncertainty=1-Math.abs((v2[i]??NEUTRAL)-NEUTRAL)*2;
    const aVal=STYLES[a].v2Center[i],bVal=STYLES[b].v2Center[i];
    const separation=Math.abs(aVal-bVal);
    return{dim:i,score:separation*0.7+uncertainty*0.3};
  }).sort((a,b)=>b.score-a.score).filter(x=>x.score>=0).map(x=>x.dim);
}

function matchStyle(v2){
  const T=4.5,c=v2.map(v=>v-NEUTRAL);
  const sims=STYLES.map(s=>{const sc=s.v2Center.map(v=>v-NEUTRAL);let dot=0,fN=0,sN=0;for(let i=0;i<6;i++){dot+=c[i]*sc[i];fN+=c[i]**2;sN+=sc[i]**2;}return fN===0||sN===0?0:dot/(Math.sqrt(fN)*Math.sqrt(sN));});
  const exps=sims.map(s=>Math.exp(s*T));const sum=exps.reduce((a,b)=>a+b,0);
  const sorted=exps.map((e,i)=>({i,w:e/sum})).sort((a,b)=>b.w-a.w);
  return{primary:STYLES[sorted[0].i].name,ratio:sorted[0].w};
}

function simulateNlp(v2Start,a,b,intendedIdx){
  let v2=[...v2Start];
  // Get separation-ranked dims (mirrors new buildNlpQuestions)
  const allDims=getSeparationRankedDims(v2,a,b,[]);
  const used=[];
  // Q1: most conflicted dim (tiebreaker override if tied)
  const q1Dim=getMostConflictedDim(a,b);
  const actualQ1=q1Dim!==-1?q1Dim:allDims[0];
  if(actualQ1!==undefined){
    const val=STYLES[intendedIdx].v2Center[actualQ1];
    v2[actualQ1]=clamp(v2[actualQ1]+(val>NEUTRAL?DELTA:val<NEUTRAL?-DELTA:0),0,1);
    used.push(actualQ1);
  }
  // Q2, Q3: next best separation dims
  const remaining=getSeparationRankedDims(v2,a,b,used);
  for(let q=0;q<2;q++){
    const dim=remaining[q];if(dim===undefined)break;
    const val=STYLES[intendedIdx].v2Center[dim];
    v2[dim]=clamp(v2[dim]+(val>NEUTRAL?DELTA:val<NEUTRAL?-DELTA:0),0,1);
    used.push(dim);
  }
  return{v2,used};
}

let total=0,passed=0,failed=0;const failures=[];
for(let a=0;a<9;a++){
  for(let b=0;b<9;b++){
    const v2Grid=simulateGrid(a,b);
    for(const intended of[a,b]){
      const{v2,used}=simulateNlp(v2Grid,a,b,intended);
      const result=matchStyle(v2);
      total++;
      const ok=result.primary===STYLES[a].name||result.primary===STYLES[b].name;
      if(!ok){
        failed++;
        failures.push({combo:`${STYLES[a].name}+${STYLES[b].name}`,intended:STYLES[intended].name,got:result.primary,ratio:result.ratio.toFixed(2),dims:used.map(d=>DIM_NAMES[d]),v2:v2.map(v=>v.toFixed(2))});
      } else if(result.primary!==STYLES[intended].name){
        console.log(`⚠  ${STYLES[a].name}+${STYLES[b].name} intended:${STYLES[intended].name} → ${result.primary} (${result.ratio.toFixed(2)}) dims:[${used.map(d=>DIM_NAMES[d]).join(',')}]`);
        passed++;
      } else passed++;
    }
  }
}
console.log(`\n✅ ${passed}/${total} passed  ❌ ${failed}/${total} failed`);
if(failures.length>0){
  console.log('\n❌ FAILURES:');
  for(const f of failures){
    console.log(`  ${f.combo} | intended:${f.intended} → got:${f.got} (${f.ratio})`);
    console.log(`    dims:[${f.dims.join(',')}]  v2:[${f.v2.join(',')}]`);
  }
}
