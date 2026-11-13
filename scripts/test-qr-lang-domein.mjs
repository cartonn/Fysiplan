// Regressie uit de praktijktest: de Railway-testlink paste zelfs zonder taal niet
// in de kleine QR. Voer de echte app-helper uit, zonder browser of netwerk.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const encoder=await readFile(new URL('../public/qr.js',import.meta.url),'utf8');
const helper=html.match(/function qrSvg\(id,px\)\{[\s\S]*?\n  \}/)[0];
const id='abcdef123456';
for(const origin of ['https://fysiplan.nl','https://fysiplan-test-test.up.railway.app']){
 for(const taal of ['', '?taal=en', '?taal=ar']){
  const context={window:{},location:{origin},IS_V2:true,kaartUrl:x=>origin+'/k/'+x+taal};
  vm.createContext(context);vm.runInContext(encoder,context);
  context.FYSIQR=context.window.FYSIQR;vm.runInContext(helper,context);
  const qr=context.FYSIQR, link=context.kaartUrl(id);
  const actual=context.qrSvg(id,120);
  assert.ok(actual,'V2 tekent QR op '+link);
  assert.equal(actual,qr.svg(link,120)||qr.svg(link,120,true),'taal blijft in de QR');
  context.IS_V2=false;
  assert.equal(context.qrSvg(id,120),qr.svg(link,120)||qr.svg(origin+'/k/'+id,120),'V1 ongewijzigd');
 }
}
console.log('QR: 6 V2-links met taal en 6 V1-compatibiliteitscontroles geslaagd');
