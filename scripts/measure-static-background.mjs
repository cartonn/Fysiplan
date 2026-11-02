// Meet per statische oefening de achtergrond (randpixels) en of het Fysiplan-merk linksboven staat.
// Merk: blauw icoon in het vak linksboven (b > 150, b - r > 80). Achtergrond: gemiddelde en minimum
// helderheid van een 6px brede rand. Gebruik: node scripts/measure-static-background.mjs
import fs from 'fs'; import path from 'path'; import sharp from 'sharp';
const root=process.cwd();
const idx=JSON.parse(fs.readFileSync('output/pose-review/static/index.json','utf8'));
const out=[];
for(const e of idx){
  let f=path.join(root,'public',e.source);if(!fs.existsSync(f))f=path.join(root,e.source);
  const {data,info}=await sharp(f).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:w,height:h}=info;const px=(x,y)=>{const i=(y*w+x)*3;return [data[i],data[i+1],data[i+2]];};
  let sum=0,n=0,min=255;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(x>5&&x<w-6&&y>5&&y<h-6)continue;const [r,g,b]=px(x,y);const l=(r+g+b)/3;sum+=l;n++;if(l<min)min=l;}
  let blue=0;const bw=Math.round(w*0.2),bh=Math.round(h*0.08);
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){const [r,g,b]=px(x,y);if(b>150&&b-r>80)blue++;}
  out.push({n:e.n,exerciseId:e.exerciseId,name:e.name,width:w,height:h,edgeMean:+(sum/n).toFixed(1),edgeMin:Math.round(min),brandMark:blue>30});
}
fs.writeFileSync('output/pose-review/static/background-brand.json',JSON.stringify(out,null,1));
const grey=out.filter(o=>o.edgeMean<245),nob=out.filter(o=>!o.brandMark);
console.log('zonder merk:',nob.length,'| rand gem. <245:',grey.length,grey.map(o=>o.n+':'+o.edgeMean).join(' '));
console.log('formaten:',JSON.stringify(out.reduce((a,o)=>{const k=o.width+'x'+o.height;a[k]=(a[k]||0)+1;return a;},{})));
console.log('zonder merk n:',nob.map(o=>o.n).join(','));
