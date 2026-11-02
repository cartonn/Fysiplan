// Deterministic montage: no generated text, grids or exercise illustrations.
// Geometry follows public/index.html #a4 and renderA4(): 12 columns,
// 2 blocks of 6 date rows, 2 BORG rows, one XRM row.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const dest = path.join(root, 'public/images/landing');
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/landing-card-assets.mjs PHOTO.png');
const exercises = [
  ['Chair squat','onderste-extremiteit/chair-squat'],
  ['Calf raises','onderste-extremiteit/calf-raises'],
  ['Bruggen beginner','onderste-extremiteit/glute-bridges'],
  ['Lunges','onderste-extremiteit/lunges'],
  ['Anteflexie armen','bovenste-extremiteit/anteflexie-armen'],
  ['Back extension','core/back-extension'],
  ['Dead bug','core/dead-bug'],
  ['Biceps curl','bovenste-extremiteit/biceps-curl'],
  ['Seated marching','seated-chair/seated-marching'],
  ['Seated calf raises','seated-chair/seated-calf-raises'],
  ['Seated biceps curl','seated-chair/seated-biceps-curl'],
  ['Standing chair heel toe','seated-chair/standing-chair-heel-toe'],
];
assert.equal(exercises.length,12);
const arrows=JSON.parse(await fs.readFile(path.join(root,'content/beginhouding-pijl.json'),'utf8'));
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
const pieces=[];
const text=(x,y,s,size=12,weight=400,anchor='start',fill='#101828')=>pieces.push(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${xml(s)}</text>`);
const line=(x,y,x2,y2,w=1)=>pieces.push(`<path d="M${x},${y}L${x2},${y2}" stroke="#475467" stroke-width="${w}" fill="none"/>`);
const rect=(x,y,w,h,fill='none')=>pieces.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="#475467"/>`);
pieces.push('<rect width="1120" height="792" fill="white"/>');
text(26,44,'FysioTotaal',21,700,'start','#1f6feb');
['Voorbeeldpraktijk','Voorbeeldkaart — geen patiëntgegevens'].forEach((s,i)=>text(26,66+i*15,s,10.5,400,'start','#344054'));
[['Naam','Voorbeeldcliënt'],['Leeftijd','65'],['max. HF',''],['Trainingszone','']].forEach(([k,v],i)=>{
  const y=44+i*30;text(292,y,k,11.5,700);text(400,y,v,12.5);line(398,y+5,733,y+5);
});
rect(759,22,162.5,147.4);rect(931.5,22,162.5,147.4);
text(767,38,'Opm.',11,700);text(767,55,'Rustig uitvoeren.',12);text(767,70,'Adem door.',12);
text(767,133,'Casus',11,700);text(767,150,'Fictief voorbeeld',12);
text(940,38,'Doel:',11,700);text(940,55,'Voorbeeld van de',12);text(940,70,'kaartindeling.',12);
text(940,94,'Dosering op advies',12);text(940,109,'van de behandelaar.',12);
const gx=26,dx=50,ex=76,cw=1018/12,ny=182,py=199,ph=cw*1.5,ly=py+ph,sy=ly+22,by=sy+22,rh=(752-by)/15;
for(let i=0;i<12;i++){
  const x=ex+i*cw;text(x+cw/2,ny+12,i+1,11.5,700,'middle');rect(x,py,cw,ph,'white');
  const slug=exercises[i][1].split('/').pop();
  const arrow=arrows.entries.find(e=>e.source.endsWith('/'+slug+'.jpg')||e.source.endsWith('/'+slug+'-line-v1.png'));
  assert(arrow,'Missing landing arrow illustration: '+exercises[i][0]);
  const p=path.join(root,'public',arrow.img);
  const buf=await sharp(p).resize(180,270,{fit:'contain',background:'#fff'}).png().toBuffer();
  pieces.push(`<image href="data:image/png;base64,${buf.toString('base64')}" x="${x+2}" y="${py+2}" width="${cw-4}" height="${ph-4}" preserveAspectRatio="xMidYMid meet"/>`);
  const words=exercises[i][0].split(' ');let a='',b='';for(const w of words){if((a+' '+w).length<=16&&!b)a+=(a?' ':'')+w;else b+=(b?' ':'')+w;}
  text(x+cw/2,ly+9,a,7.5,700,'middle');if(b)text(x+cw/2,ly+18,b,7.5,700,'middle');
  rect(x,sy,cw,22,'#f2f5f9');['S','H','W'].forEach((s,j)=>text(x+(j+.5)*cw/3,sy+14,s,9.5,600,'middle'));
}
text(gx,ly+18,'Datum',10.5,700);rect(gx,sy,dx,22,'#f2f5f9');
let ri=0;
for(let block=0;block<2;block++){
  for(let row=0;row<6;row++,ri++){
    const y=by+ri*rh;rect(gx,y,dx,rh);text(gx+dx/2,y+rh*.66,row===0?(block?'09-11':'02-11'):'__-__',9,400,'middle');
    for(let i=0;i<36;i++){rect(ex+i*cw/3,y,cw/3,rh);if(row===0&&i%3<2)text(ex+(i+.5)*cw/3,y+rh*.66,i%3===0?'3':'10',9.5,400,'middle');}
  }
  text(gx,by+ri*rh+rh*.66,'BORG',9,700);
  for(let i=0;i<12;i++)rect(ex+i*cw,by+ri*rh,cw,rh);ri++;
}
text(gx,by+ri*rh+rh*.66,'XRM',9,700);for(let i=0;i<12;i++)rect(ex+i*cw,by+ri*rh,cw,rh);
text(26,771,'S = series · H = herhalingen · W = weerstand',10);
text(1094,784,'Voorbeeldindeling met 12 oefeningen — de behandelaar bepaalt het programma.',8,400,'end','#667085');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="2240" height="1584" viewBox="0 0 1120 792"><g font-family="Inter,Arial,sans-serif">${pieces.join('')}</g></svg>`;
await fs.writeFile(path.join(dest,'trainingskaart-12.svg'),svg);
const card = await sharp(Buffer.from(svg)).png().toBuffer();
await fs.writeFile(path.join(dest,'trainingskaart-12.png'),card);

// Perspective insertion into photographed sheet. Source photo is unchanged
// outside the paper; hands are restored using explicit occlusion polygons.
const {data:photo,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
assert.equal(info.width,1448);assert.equal(info.height,1086);
const {data:src,info:si}=await sharp(card).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const quad=[[243,89],[1220,210],[1157,906],[136,830]];
function solve(a,b){const n=b.length;for(let i=0;i<n;i++){let p=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j][i])>Math.abs(a[p][i]))p=j;[a[p],a[i]]=[a[i],a[p]];[b[p],b[i]]=[b[i],b[p]];const v=a[i][i];assert.ok(Math.abs(v)>1e-10);for(let k=i;k<n;k++)a[i][k]/=v;b[i]/=v;for(let j=0;j<n;j++)if(j!==i){const f=a[j][i];for(let k=i;k<n;k++)a[j][k]-=f*a[i][k];b[j]-=f*b[i];}}return b;}
const a=[],b=[];quad.forEach(([x,y],i)=>{const u=[0,1,1,0][i],v=[0,0,1,1][i];a.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);a.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);});const h=solve(a,b);
function inside(x,y,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;}
const hands=[[[0,225],[202,230],[236,246],[258,272],[253,302],[226,324],[207,354],[185,398],[0,491]],[[1183,792],[1207,803],[1231,837],[1240,901],[1200,970],[1000,1086],[830,1086],[908,974],[1010,922],[1094,876],[1128,852],[1157,816],[1167,796]]];
const out=Buffer.from(photo);
for(let y=85;y<905;y++)for(let x=130;x<1225;x++){
  const den=h[6]*x+h[7]*y+1,u=(h[0]*x+h[1]*y+h[2])/den,v=(h[3]*x+h[4]*y+h[5])/den;
  if(u<0||u>1||v<0||v>1||hands.some(p=>inside(x,y,p)))continue;
  const sx=u*(si.width-1),sy=v*(si.height-1),ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,idx=(y*info.width+x)*4;
  // Bilinear sampling; mild neutral paper lighting retains photographic tone.
  const shade=.98-.035*v;
  for(let c=0;c<3;c++){
    const at=(xx,yy)=>src[(Math.min(yy,si.height-1)*si.width+Math.min(xx,si.width-1))*4+c];
    const value=(at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;
    out[idx+c]=Math.round(value*shade);
  }
}
for(const width of [500,1000])await sharp(out,{raw:info}).resize(width,Math.round(width*.75)).jpeg({quality:91,mozjpeg:true}).toFile(path.join(dest,`kaart-papier-sport-12-${width}.jpg`));
console.log('Rendered twelve exercises, 12 date rows, 2 BORG rows, 1 XRM row; inserted without AI redraw.');
