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
const DELTA = 0.45; // increased from 0.35

function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}

function simulateGrid(a,b){
  const v2=Array(6).fill(NEUTRAL);
  const entries=[{center:STYLES[a].v2Center,count:3},{center:STYLES[b].v2Center,count:3}];
  for(let d=0;d<6;d++){
    let wSum=0,wTotal=0;
    for(const{center,count}of entries){const dev=center[d]-NEUTRAL;const sig=Math.abs(dev)*(count/6);wSum+=dev*sig;wTotal+=sig;}
    v2[d]=wTotal<0.01?NEUTRAL:clamp(NEUTRAL+wSum/wTotal,0,1);
  }
  return v2;
}

function getMostConflictedDim(a,b){
  let bestDim=-1,bestMag=0;
  for(let i=0;i<6;i++){
    const devA=STYLES[a].v2Center[i]-NEUTRAL,devB=STYLES[b].v2Center[i]-NEUTRAL;
    if(Math.abs(devA)>=0.25&&Math.abs(devB)>=0.25&&Math.sign(devA)!==Math.sign(devB)){
      const mag=Math.abs(devA)+Math.abs(devB);
      if(mag>bestMag){bestMag=mag;bestDim=i;}
    }
  }
  return bestDim;
}

function getUncertainDims(v2,exclude=[]){
  return Array.from({length:6},(_,i)=>({dim:i,u:1-Math.abs((v2[i]??NEUTRAL)-NEUTRAL)*2}))
    .filter(x=>!exclude.includes(x.dim)).sort((a,b)=>b.u-a.u).map(x=>x.dim);
}

function matchStyle(v2){
  const T=4.5,centered=v2.map(v=>v-NEUTRAL);
  const sims=STYLES.map(s=>{const sc=s.v2Center.map(v=>v-NEUTRAL);let dot=0,fpN=0,sN=0;for(let i=0;i<6;i++){dot+=centered[i]*sc[i];fpN+=centered[i]**2;sN+=sc[i]**2;}return fpN===0||sN===0?0:dot/(Math.sqrt(fpN)*Math.sqrt(sN));});
  const exps=sims.map(s=>Math.exp(s*T));const sum=exps.reduce((a,b)=>a+b,0);
  const sorted=exps.map((e,i)=>({i,w:e/sum})).sort((a,b)=>b.w-a.w);
  return{primary:STYLES[sorted[0].i].name,secondary:STYLES[sorted[1].i].name,ratio:sorted[0].w};
}

function simulateNlp(v2Start,a,b,intendedIdx){
  let v2=[...v2Start];
  const q1Dim=getMostConflictedDim(a,b);
  const used=[];
  // Q1
  if(q1Dim!==-1){
    const val=STYLES[intendedIdx].v2Center[q1Dim];
    v2[q1Dim]=clamp(v2[q1Dim]+(val>NEUTRAL?DELTA:val<NEUTRAL?-DELTA:0),0,1);
    used.push(q1Dim);
  }
  // Q2, Q3 — top 2 uncertain remaining
  const uncertain=getUncertainDims(v2,used);
  for(let q=0;q<2;q++){
    const dim=uncertain[q];if(dim===undefined)break;
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
        failures.push({combo:`${STYLES[a].name} + ${STYLES[b].name}`,intended:STYLES[intended].name,got:result.primary,ratio:result.ratio.toFixed(2),dims:used.map(d=>DIM_NAMES[d]),v2:v2.map(v=>v.toFixed(2))});
      } else if(result.primary!==STYLES[intended].name){
        console.log(`⚠  ${STYLES[a].name}+${STYLES[b].name} intended:${STYLES[intended].name} → ${result.primary} (${result.ratio.toFixed(2)})`);
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
    console.log(`    dims: [${f.dims.join(', ')}]  v2: [${f.v2.join(', ')}]`);
  }
}
