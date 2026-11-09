import sharp from "sharp"; import {readFileSync,readdirSync} from "node:fs"; import {join} from "node:path";
const d=new URL("./",import.meta.url).pathname, root=join(d,"../../../../");
const specs=JSON.parse(readFileSync(join(d,"specs-avatars.json")));
const W=300,H=450,LAB=24,COLS=4;
for(let g=0;g*8<specs.length;g++){const part=specs.slice(g*8,g*8+8);const tiles=[];
 for(const [i,a] of part.entries()){const lijn=join(root,"public",a.lijn); const nw=join(d,"avatars",`${a.nr}-${a.slug}-avatar.png`);
  for(const [j,p] of [[0,lijn],[1,nw]].entries()){const k=i*2+j;const x=(k%COLS)*W,y=Math.floor(k/COLS)*(H+LAB);
   tiles.push({input:await sharp(p[1]).resize(W,H,{fit:"contain",background:"#fff"}).png().toBuffer(),left:x,top:y});
   tiles.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LAB}"><text x="4" y="17" font-family="Arial" font-size="14" font-weight="bold">${a.nr} ${a.slug.slice(0,24)} ${j?'NIEUW':'lijn'}</text></svg>`),left:x,top:y+H});}}
 await sharp({create:{width:COLS*W,height:Math.ceil(part.length*2/COLS)*(H+LAB),channels:3,background:"#fff"}}).composite(tiles).png().toFile(join(d,`_vel-avatars-${g+1}.png`));}
