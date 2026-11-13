import assert from 'node:assert/strict';
import { demoActieToegestaan as allow } from './ui/demo-agent-policy.mjs';
const cases = [
 [{component:'tabs', label:'Demotaken', action:'setValue', args:['wacht']},true],
 [{component:'tabs', label:'Demotaken', action:'setValue', args:['productie']},false],
 [{component:'dialog',label:'Democoncept: Voorbeeld',action:'setOpen',args:[true]},true],
 [{component:'dialog',label:'Democoncept: Voorbeeld',action:'press',args:['Goedkeuren']},false],
 [{component:'dialog',label:'Democoncept: Voorbeeld',action:'setOpen',args:[true],confirm:'Akkoord nodig'},false],
 [{component:'textarea',label:'Feedback op democoncept',action:'setValue',args:['Korter graag']},true],
 [{component:'textarea',label:'Feedback op democoncept',action:'setValue',args:['x'.repeat(201)]},false],
 [{component:'textarea',label:'Beheersleutel',action:'setValue',args:['nee']},false],
 [{component:'button',label:'Verstuur',action:'press'},false],
 [{component:'button',label:'Goedkeuren',action:'press'},false],
];
for (const [step,expected] of cases) {
 assert.equal(allow(step,true),expected,JSON.stringify(step));
 assert.equal(allow(step,false),false,'Inactive bridge always denies');
}
console.log('demo-ui-policy: 20 controles geslaagd');
