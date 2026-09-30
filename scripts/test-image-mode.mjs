import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const renderer = html.match(/  function imgRender\(im,size\)\{[\s\S]*?\n  \}/)?.[0];
assert(renderer, 'Production image renderer must exist');
const image = {type:'img', src:'avatar.png', lineSrc:'line.png', colorSrc:'avatar.png'};
for (const [name, IS_V2, IS_ADMIN] of [['v2',true,false],['beheer',false,true],['v1',false,false]]) {
  const context = vm.createContext({IS_V2, IS_ADMIN, USE_V2_LIBRARY:IS_V2 || IS_ADMIN,
    V2_BEELD:'lijn', svgStr:()=>'<svg/>'});
  vm.runInContext(renderer, context);
  for (const mode of ['lijn','kleur','lijn']) {
    context.V2_BEELD = mode;
    const expected = name === 'v1' ? image.src : mode === 'lijn' ? image.lineSrc : image.colorSrc;
    for (const size of [34,120]) {
      assert(context.imgRender(image,size).includes("src='"+expected+"'"), `${name}: ${mode}, size ${size}`);
    }
  }
  assert(context.imgRender({type:'img',src:'upload.png'},34).includes("src='upload.png'"));
  assert.equal(context.imgRender({type:'svg'},34), '<svg/>');
}
console.log('Image mode regression passed: V2 and beheer honor line/avatar; V1 and uploads unchanged.');
