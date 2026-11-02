import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../public/kaart.html',import.meta.url),'utf8');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
const calls=[];
const document={createElement(){const c={width:0,height:0};c.getContext=()=>({fillRect(){},drawImage(...args){calls.push({c,args});}});return c;}};
const code=html.slice(html.indexOf('  function demoUniformFrames('),html.indexOf('  function demoStart('));
const context=vm.createContext({document});vm.runInContext(code,context);
function frame(w,h,box){const pixels=new Uint8ClampedArray(w*h*4).fill(255);if(box)for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++){const i=(y*w+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0;}return {width:w,height:h,getContext(){return {getImageData(){return {data:pixels};}};}};}
for(const input of [
  [frame(100,200,{x:20,y:10,w:60,h:180}),frame(100,200,{x:10,y:60,w:80,h:130})],
  [frame(200,100,{x:5,y:5,w:190,h:90}),frame(200,100,{x:50,y:20,w:140,h:70})],
  [frame(40,40),frame(40,40)],
  [{width:100,height:200,getContext(){throw Error('tainted');}},frame(100,200)]
]){
  calls.length=0;const result=context.demoUniformFrames(input);
  assert.equal(result.length,2);
  for(const {c,args:a} of calls){assert.equal(c.width,640);assert.equal(c.height,640);
    assert.ok(a[5]>=31.99&&a[6]>=31.99);assert.ok(a[5]+a[7]<=608.01&&a[6]+a[8]<=608.01);
    assert.ok(Math.abs(a[7]/a[3]-a[8]/a[4])<1e-9,'aspect ratio preserved');}
  assert.ok(Math.abs(calls[0].args[7]/calls[0].args[3]-calls[1].args[7]/calls[1].args[3])<1e-9,'same scale for both poses');
}
assert.ok(!html.includes("style.transform='translate("),'no invented pose motion');
console.log('Mobile pose layout: shared scale, square frames, margins, aspect ratios and syntax passed.');
