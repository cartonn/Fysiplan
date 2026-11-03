import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const html=fs.readFileSync('public/index.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
scripts.forEach(s=>new vm.Script(s));
const helpers=html.split('// CATEGORY_DISPLAY_START')[1].split('// CATEGORY_DISPLAY_END')[0];
const context={};vm.createContext(context);vm.runInContext(helpers,context);
const current=JSON.parse(fs.readFileSync('public/oefeningen-v2.json'));
// Shallow CI checkouts lack the migration parent. Functional checks always run;
// the full non-category byte-equivalence check runs when that parent is present.
let original=null;
try{original=JSON.parse(execFileSync('git',['show','2249b0c:public/oefeningen-v2.json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));}catch{}
if(original){
assert.equal(current.length,original.length);
let changed=0;
current.forEach((e,i)=>{const {ook:a,...old}=original[i],{ook:b,...now}=e;assert.deepEqual(now,old);
 if(JSON.stringify(a)!==JSON.stringify(b))changed++;
 for(const g of a||[])assert.ok(b.includes(g));
 for(const g of [e.groep,...(e.ook||[])])assert.ok(context.matchesCategory(e,g));});
assert.equal(changed,13);
}
const required={'Back extension':'Rug','Rug extensie':'Rug','Mobilisatie rotatie rug':'Rug','Mob thoracaal':'Rug','Mob lower back':'Rug','Mob back left/right':'Rug','Back stretch':'Rug','Seated lumbar rotations':'Rug','Seated cat-cow':'Rug','Seated side leans':'Rug','Side bents':'Rug','Seated cervical stretch':'Nek','One leg standing':'Balans en valpreventie'};
for(const [name,category] of Object.entries(required)){const hits=current.filter(e=>e.naam===name);assert.equal(hits.length,1);assert.ok(hits[0].ook.includes(category));}
assert.equal(context.countCategory(current,'Foam Roller'),context.countCategory(current,'Foam roller'));
assert.equal(context.countCategory(current,'Foam roller'),current.filter(e=>[e.groep,...(e.ook||[])].some(x=>['Foam Roller','Foam roller'].includes(x))).length);
assert.equal(context.displayLabel('Eigen X'),'Eigen X');
const filters={innerHTML:''};
Object.assign(context,{document:{getElementById:()=>filters},GROUPS:[{g:'all',label:'alle oefeningen'},...['Foam roller','Foam Roller','Mobility','Eigen <X>'].map(g=>({g,label:g}))],USE_V2_LIBRARY:true,SERVERLIB:true,IS_ADMIN:false,curG:'Foam Roller',esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')});
const render=html.slice(html.indexOf('  function renderChips(){'),html.indexOf('  function renderList(){'));
vm.runInContext(render,context);context.renderChips();
assert.equal((filters.innerHTML.match(/data-g="Foam roller"/g)||[]).length,1);
assert.ok(filters.innerHTML.includes('Eigen &lt;X>'));
assert.ok(filters.innerHTML.includes('Materiaal en uitgangshouding'));
assert.ok(filters.innerHTML.includes("aria-pressed='true'"));
context.USE_V2_LIBRARY=false;context.renderChips();
assert.ok(filters.innerHTML.includes('data-g="Foam Roller"'));
assert.ok(!filters.innerHTML.includes('category-heading'));
context.USE_V2_LIBRARY=true;context.IS_ADMIN=true;context.renderChips();
assert.ok(filters.innerHTML.includes("data-cat-delete='1'"));
const membership=html.match(/  function inGroep\(o,g\)\{[^\n]+/)[0];vm.runInContext(membership,context);
assert.ok(context.inGroep({groep:'Foam Roller'},'Foam roller'));
context.USE_V2_LIBRARY=false;assert.equal(Boolean(context.inGroep({groep:'Foam Roller'},'Foam roller')),false);
assert.ok(html.includes('max-height:96px;overflow-y:auto'));
console.log(JSON.stringify({passed:true,records:current.length,requiredMappings:13,migrationParentComparison:!!original,tests:['inlineJSsyntax','requiredsecondary mappings','aliasunion','customlabel escaping','rendered groupedbuttons','legacyV1 exactfilter','adminactions retained','96px scrollbound retained'],newMediaActivated:false}));
