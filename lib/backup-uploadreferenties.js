import {veiligBackupPad} from './backup-elders.js';

// Alleen lokale uploadverwijzingen; externe videodiensten horen niet bij deze back-up.
export function uploadPad(value) {
  if (typeof value !== 'string') return null;
  let s=value;
  if (/^https?:\/\//i.test(s)) {
    const u=new URL(s);
    if (!['fysiplan.nl','www.fysiplan.nl'].includes(u.hostname)) return null;
    s=u.pathname;
  }
  s=s.replace(/^\//,'').split(/[?#]/)[0];
  if (!s.startsWith('uploads/')) return null;
  try{s=decodeURIComponent(s);}catch{throw new Error('ongeldige uploadverwijzing');}
  if (!veiligBackupPad(s)||s.includes('\\')||s.includes('%')) throw new Error('onveilige uploadverwijzing');
  return s;
}

export function uploadReferenties(data) {
  const paths=new Set();let fouten=0;
  const bronnen=new Set(['kaarten.json','praktijken.json','videolinks.json','oefeningen-extra.json','praktijk-oefeningen.json','praktijk-sjablonen.json']);
  function visit(x){
    if(typeof x==='string'){try{const p=uploadPad(x);if(p)paths.add(p);}catch{fouten++;}}
    else if(x&&typeof x==='object')for(const v of Object.values(x))visit(v);
  }
  for(const [name,body] of Object.entries(data)) {
    if(!name.endsWith('.json'))continue;
    try{const value=JSON.parse(body.toString());if(bronnen.has(name))visit(value);}catch{fouten++;}
  }
  return {paths,fouten};
}

// Gerichte reparatie op een kopie: laat oefeningen, dosering en overige opnames intact.
export function herstelKaartVideo(kaarten, ontbrekendPad) {
  if(uploadPad(ontbrekendPad)!==ontbrekendPad)throw new Error('ongeldig doelpad');
  const kopie=structuredClone(kaarten);let verwijderd=0;
  for(const praktijk of Object.values(kopie))for(const kaart of Object.values(praktijk||{})){
    if(!kaart||typeof kaart!=='object'||!kaart.vids)continue;
    for(const [key,value] of Object.entries(kaart.vids))if(uploadPad(value)===ontbrekendPad){delete kaart.vids[key];verwijderd++;}
  }
  return {kaarten:kopie,verwijderd};
}
