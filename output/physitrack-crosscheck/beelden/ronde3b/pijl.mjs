import sharp from "sharp"; import {readFileSync} from "node:fs"; import {join} from "node:path";
const d=new URL("./",import.meta.url).pathname, av=join(d,"../avatars-nieuw");
const specs=JSON.parse(readFileSync(join(d,"specs-avatars.json")));
// [x1,y1,x2,y2,dubbel] in pixels van de 1280x1920-avatar, onderste helft = eindstand
const P={484:[660,1330,660,1460,0],485:[470,1500,470,1385,0],486:[720,1480,720,1360,0],487:[560,1230,612,1365,0],488:[730,1295,730,1465,1],489:[390,1200,530,1200,0]};
function arrow(x1,y1,x2,y2,kleur,w,h){const a=Math.atan2(y2-y1,x2-x1),L=34+h,B=20+h;
 const head=(x,y,ang)=>{const p1=[x-L*Math.cos(ang)+B*Math.sin(ang),y-L*Math.sin(ang)-B*Math.cos(ang)],p2=[x-L*Math.cos(ang)-B*Math.sin(ang),y-L*Math.sin(ang)+B*Math.cos(ang)];return `<polygon points="${x},${y} ${p1} ${p2}" fill="${kleur}" stroke="${kleur}" stroke-width="${h}" stroke-linejoin="round"/>`};
 return {line:`<line x1="${x1}" y1="${y1}" x2="${x2-(L-6)*Math.cos(a)}" y2="${y2-(L-6)*Math.sin(a)}" stroke="${kleur}" stroke-width="${w}" stroke-linecap="round"/>`,head};}
for(const [nr,[x1,y1,x2,y2,dub]] of Object.entries(P)){const s=specs.find(a=>a.nr==nr);const src=join(av,`${nr}-${s.slug}-avatar.png`);const m=await sharp(src).metadata();
 let svg="";for(const [k,w,h] of [["#fff",22,8],["#111",11,0]]){const A=arrow(x1,y1,x2,y2,k,w,h);const a=Math.atan2(y2-y1,x2-x1);
  let line=A.line; if(dub){const B=arrow(x2,y2,x1,y1,k,w,h);line=`<line x1="${x1+(34+h-6)*Math.cos(a)}" y1="${y1+(34+h-6)*Math.sin(a)}" x2="${x2-(34+h-6)*Math.cos(a)}" y2="${y2-(34+h-6)*Math.sin(a)}" stroke="${k}" stroke-width="${w}" stroke-linecap="round"/>`+B.head(x1,y1,a+Math.PI);}
  svg+=line+A.head(x2,y2,a);}
 await sharp(src).composite([{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="${m.height}">${svg}</svg>`)}]).png().toFile(join(av,`${nr}-${s.slug}-avatar-pijl.png`));}
