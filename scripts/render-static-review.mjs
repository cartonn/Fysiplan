// Contactbladen van de oefeningen die als volledige afbeelding getoond worden (poseGeometry.status 'static'),
// elk bestand eerst tegen zijn sha256 uit public/mobile-media-review.json gecontroleerd. Alleen voor visuele controle.
// Gebruik: node scripts/render-static-review.mjs
import fs from 'fs'; import path from 'path'; import sharp from 'sharp';
const root=process.argv[2]||process.cwd();
const r=JSON.parse(fs.readFileSync(path.join(root,'public/mobile-media-review.json'),'utf8'));
const st=r.entries.filter(e=>e.poseGeometry&&e.poseGeometry.status==='static');
const W=360,H=540,LH=34,COLS=4,ROWS=2,PER=COLS*ROWS;
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const index=[];
for(let s=0;s*PER<st.length;s++){
  const items=st.slice(s*PER,(s+1)*PER);const comps=[];
  for(let i=0;i<items.length;i++){
    const e=items[i];const n=s*PER+i+1;index.push({n,sheet:s+1,exerciseId:e.exerciseId,name:e.name,source:e.source,assetSha256:e.assetSha256,reason:e.poseGeometry.reason||e.poseGeometry.measurement||null});
    let f=path.join(root,'public',e.source);if(!fs.existsSync(f))f=path.join(root,e.source);
    const buf=fs.readFileSync(f);
    const sha=(await import('crypto')).createHash('sha256').update(buf).digest('hex');
    if(sha!==e.assetSha256)throw new Error('hash mismatch '+e.source);
    const img=await sharp(buf).resize(W,H,{fit:'contain',background:'#ccc'}).toBuffer();
    const x=(i%COLS)*W,y=Math.floor(i/COLS)*(H+LH);
    comps.push({input:Buffer.from(`<svg width="${W}" height="${LH}"><rect width="100%" height="100%" fill="#222"/><text x="6" y="23" font-size="17" font-family="Helvetica" fill="#fff">${n}. ${esc(e.name).slice(0,34)}</text></svg>`),left:x,top:y});
    comps.push({input:img,left:x,top:y+LH});
  }
  await sharp({create:{width:W*COLS,height:(H+LH)*ROWS,channels:3,background:'#888'}}).composite(comps).jpeg({quality:82}).toFile(path.join(root,`output/pose-review/static/static-sheet-${String(s+1).padStart(2,"0")}.jpg`));
}
fs.writeFileSync(path.join(root,'output/pose-review/static/index.json'),JSON.stringify(index,null,1));
console.log(st.length,'static,',Math.ceil(st.length/PER),'sheets');
console.log(JSON.stringify(st[0].poseGeometry));
