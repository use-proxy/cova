const STYLES = [
  { name: 'Warm Japandi',         v2: [0.80, 0.15, 0.80, 0.15, 0.15, 0.80] },
  { name: 'Dark Moody Glam',      v2: [0.15, 0.80, 0.15, 0.80, 0.80, 0.80] },
  { name: 'Coastal Bright',       v2: [0.80, 0.15, 0.50, 0.15, 0.15, 0.15] },
  { name: 'Industrial Loft',      v2: [0.15, 0.80, 0.15, 0.80, 0.15, 0.15] },
  { name: 'Maximalist Eclectic',  v2: [0.80, 0.80, 0.80, 0.80, 0.15, 0.80] },
  { name: 'Heritage Traditional', v2: [0.80, 0.80, 0.80, 0.80, 0.80, 0.15] },
  { name: 'Pure Minimal White',   v2: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15] },
  { name: 'Biophilic Jungle',     v2: [0.15, 0.15, 0.80, 0.80, 0.15, 0.80] },
  { name: 'Retro Mid-Century',    v2: [0.80, 0.80, 0.15, 0.15, 0.15, 0.80] },
];
const DIM = ['warmth','complexity','organicness','density','traditionalism','character'];
let found = false;
for(let a=0;a<9;a++) for(let b=a+1;b<9;b++){
  const diffs=[];
  for(let i=0;i<6;i++) if(Math.abs(STYLES[a].v2[i]-STYLES[b].v2[i])>0.3) diffs.push(DIM[i]);
  if(diffs.length<=1){ console.log(STYLES[a].name+' vs '+STYLES[b].name+': ['+diffs.join(',')+']'); found=true; }
}
if(!found) console.log('None — all pairs differ on 2+ dims');
