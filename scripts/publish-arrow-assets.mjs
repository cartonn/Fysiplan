// Import existing reviewed illustrations; no generative changes to exercise content.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const source=process.argv[2];
assert(source,'Provide the Carla review public directory');
const catalog=JSON.parse(await fs.readFile(path.join(source,'catalog.json'),'utf8'));
const base=JSON.parse(await fs.readFile(path.join(root,'public/oefeningen-v2.json'),'utf8'));
assert.equal(catalog.length,319);
const dest=path.join(root,'public/images/beginhouding-pijl-v1');
await fs.mkdir(dest,{recursive:true});
const entries=[],withheld=[];
for(const item of catalog){
  const matches=base.filter(e=>e.naam===item.naam);
  assert.equal(matches.length,1,`Unique exercise mapping: ${item.naam}`);
  if(item.hold){withheld.push({id:item.id,naam:item.naam,reason:item.reviewNote});continue;}
  const input=path.join(source,item.image);
  const {data,info}=await sharp(input).flatten({background:'#fff'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let left=info.width,top=info.height,right=0,bottom=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const p=(y*info.width+x)*info.channels;
    if(Math.min(...data.subarray(p,p+3))<245){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  }
  assert(right>left&&bottom>top,`Nonblank image ${item.id}`);
  // Trim only empty outside margins, preserve every ink pixel including the arrow.
  const width=right-left+1,height=bottom-top+1,pad=Math.ceil(Math.max(width,height)*.025);
  const padded=await sharp(input).extract({left,top,width,height}).flatten({background:'#fff'})
    .extend({top:pad,bottom:pad,left:pad,right:pad,background:'#fff'})
    .png().toBuffer();
  await sharp(padded).resize(800,1200,{fit:'contain',background:'#fff'})
    .webp({quality:94}).toFile(path.join(dest,`${item.id}.webp`));
  entries.push({id:item.id,naam:item.naam,source:matches[0].img,img:`images/beginhouding-pijl-v1/${item.id}.webp`});
}
await fs.writeFile(path.join(root,'content/beginhouding-pijl.json'),JSON.stringify({clinicalApproved:false,entries,withheld},null,2)+'\n');
console.log(`${entries.length} imported, ${withheld.length} withheld; V1 source assets untouched.`);
