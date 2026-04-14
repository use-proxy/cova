const NEUTRAL = 0.5;
const STYLES = [
  { name: "Warm Japandi",         v2: [0.80, 0.15, 0.80, 0.15, 0.15, 0.80] },
  { name: "Dark Moody Glam",      v2: [0.15, 0.80, 0.15, 0.80, 0.80, 0.80] }, // fixed: character=0.80
  { name: "Coastal Bright",       v2: [0.80, 0.15, 0.55, 0.15, 0.15, 0.15] }, // fixed: organicness=0.55
  { name: "Industrial Loft",      v2: [0.15, 0.80, 0.15, 0.80, 0.15, 0.15] },
  { name: "Maximalist Eclectic",  v2: [0.80, 0.80, 0.80, 0.80, 0.15, 0.80] },
  { name: "Heritage Traditional", v2: [0.80, 0.80, 0.80, 0.80, 0.80, 0.15] },
  { name: "Pure Minimal White",   v2: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15] },
  { name: "Biophilic Jungle",     v2: [0.15, 0.15, 0.80, 0.80, 0.15, 0.80] },
  { name: "Retro Mid-Century",    v2: [0.80, 0.80, 0.15, 0.15, 0.15, 0.80] },
];
const DIM_NAMES = ["warmth","complexity","organicness","density","traditionalism","character"];
const DELTA = 0.45;

function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function simulateGrid(a,b){
  const v2=Array(6).fill(NEUTRAL);
  for(let d=0;d<6;d++){let wS=0,wT=0;for(const[i,c]of[[a,3],[b,3]]){const dev=STYLES[i].v2[d]-NEUTRAL;const s=Math.abs(dev)*(c/6);wS+=dev*s;wT+=s;}v2[d]=wT<0.01?NEUTRAL:clamp(NEUTRAL+wS/wT,0,1);}
  return v2;
}
function getMostConflictedDim(a,b){
  let best=-1,bM=0;
  for(let i=0;i<6;i++){const dA=STYLES[a].v2[i]-NEUTRAL,dB=STYLES[b].v2[i]-NEUTRAL;if(Math.abs(dA)>=0.25&&Math.abs(dB)>=0.25&&Math.sign(dA)!==Math.sign(dB)){const m=Math.abs(dA)+Math.abs(dB);if(m>bM){bM=m;best=i;}}}
  return best;
}
function getSepDims(v2,a,b,excl=[]){
  return Array.from({length:6},(_,i)=>{
    if(excl.includes(i))return{dim:i,score:-1};
    const u=1-Math.abs((v2[i]??NEUTRAL)-NEUTRAL)*2;
    const sep=Math.abs(STYLES[a].v2[i]-STYLES[b].v2[i]);
    return{dim:i,score:sep*0.7+u*0.3};
  }).sort((a,b)=>b.score-a.score).filter(x=>x.score>=0).map(x=>x.dim);
}
function matchStyle(v2){
  const T=4.5,c=v2.map(v=>v-NEUTRAL);
  const sims=STYLES.map(s=>{const sc=s.v2.map(v=>v-NEUTRAL);let dot=0,fN=0,sN=0;for(let i=0;i<6;i++){dot+=c[i]*sc[i];fN+=c[i]**2;sN+=sc[i]**2;}return fN===0||sN===0?0:dot/(Math.sqrt(fN)*Math.sqrt(sN));});
  const exps=sims.map(s=>Math.exp(s*T));const sum=exps.reduce((a,b)=>a+b,0);
  const sorted=exps.map((e,i)=>({i,w:e/sum})).sort((a,b)=>b.w-a.w);
  return{primary:STYLES[sorted[0].i].name,ratio:sorted[0].w};
}
function simulateNlp(v2Start,a,b,iIdx){
  let v2=[...v2Start];
  const q1=getMostConflictedDim(a,b);
  const used=[];
  if(q1!==-1){const val=STYLES[iIdx].v2[q1];v2[q1]=clamp(v2[q1]+(val>NEUTRAL?DELTA:val<NEUTRAL?-DELTA:0),0,1);used.push(q1);}
  const rem=getSepDims(v2,a,b,used);
  for(let q=0;q<2;q++){const dim=rem[q];if(dim===undefined)break;const val=STYLES[iIdx].v2[dim];v2[dim]=clamp(v2[dim]+(val>NEUTRAL?DELTA:val<NEUTRAL?-DELTA:0),0,1);used.push(dim);}
  return{v2,used};
}

let total=0,passed=0,failed=0;const failures=[];
for(let a=0;a<9;a++){
  for(let b=0;b<9;b++){
    const g=simulateGrid(a,b);
    for(const iIdx of[a,b]){
      const{v2,used}=simulateNlp(g,a,b,iIdx);
      const r=matchStyle(v2);total++;
      const ok=r.primary===STYLES[a].name||r.primary===STYLES[b].name;
      if(!ok){failed++;failures.push({combo:`${STYLES[a].name}+${STYLES[b].name}`,intended:STYLES[iIdx].name,got:r.primary,ratio:r.ratio.toFixed(2),dims:used.map(d=>DIM_NAMES[d]),v2:v2.map(v=>v.toFixed(2))});}
      else if(r.primary!==STYLES[iIdx].name){console.log(`⚠  ${STYLES[a].name}+${STYLES[b].name} intended:${STYLES[iIdx].name} → ${r.primary} (${r.ratio.toFixed(2)})`);passed++;}
      else passed++;
    }
  }
}
console.log(`\n✅ ${passed}/${total} passed  ❌ ${failed}/${total} failed`);
if(failures.length>0){console.log('\n❌ FAILURES:');for(const f of failures){console.log(`  ${f.combo} | intended:${f.intended} → got:${f.got} (${f.ratio})`);console.log(`    dims:[${f.dims.join(',')}]  v2:[${f.v2.join(',')}]`);}}

// Also check no new 1-dim pairs
console.log('\nChecking for style pairs with <=1 separating dim:');
let found=false;
for(let a=0;a<9;a++)for(let b=a+1;b<9;b++){
  const diffs=[];for(let i=0;i<6;i++)if(Math.abs(STYLES[a].v2[i]-STYLES[b].v2[i])>0.3)diffs.push(DIM_NAMES[i]);
  if(diffs.length<=1){console.log(`  ${STYLES[a].name} vs ${STYLES[b].name}: [${diffs.join(',')}]`);found=true;}
}
if(!found)console.log('  None — all style pairs differ on 2+ dims ✅');
