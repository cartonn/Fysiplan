import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const nodes={};
for(const id of ['prijs-aantal','prijs-totaal','prijs-toelichting','prijs-fout'])nodes[id]={value:'',setAttribute(){},addEventListener(e,f){this[e]=f;}};
const radios=[1,2,3,4,5,6,8,10,12].map(n=>({value:String(n),checked:false,addEventListener(e,f){this[e]=f;}}));
nodes['prijs-calculator']={querySelectorAll:()=>radios};
vm.runInNewContext(fs.readFileSync('public/prijs-calculator.js','utf8'),{document:{getElementById:id=>nodes[id]},Intl});
for(const [n,total] of [['25','250,00'],['12','120,00'],['1','10,00'],['100','1.000,00']]){
  nodes['prijs-aantal'].value=n;nodes['prijs-aantal'].input();
  assert(nodes['prijs-totaal'].textContent.includes(total));assert(nodes['prijs-fout'].hidden);
}
for(const n of ['','0','-2','1.5','1e3']){nodes['prijs-aantal'].value=n;nodes['prijs-aantal'].input();assert(!nodes['prijs-fout'].hidden);}
for(const r of radios){r.checked=true;r.change();assert(nodes['prijs-fout'].hidden);assert.equal(nodes['prijs-aantal'].value,'');}
console.log('PASS: prijs, vrije invoer, ongeldige invoer en vaste keuzes');
