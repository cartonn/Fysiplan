// Schrijft uitsluitend een nieuw bestand; nooit automatische wijzigingen aan productie.
// node scripts/herstel-kaart-video.mjs <datamap> <uploads/...> <nieuw-kaarten.json>
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {uploadPad,herstelKaartVideo} from '../lib/backup-uploadreferenties.js';
const [root,path,out]=process.argv.slice(2);
if(!root||!path||!out||uploadPad(path)!==path)throw new Error('Geef datamap, veilig uploadpad en nieuw uitvoerbestand');
try{await lstat(join(root,path));throw new Error('De upload bestaat nog; niets gewijzigd');}catch(e){if(e.code!=='ENOENT')throw e;}
const before=JSON.parse(await readFile(join(root,'kaarten.json'),'utf8'));
const result=herstelKaartVideo(before,path);
if(!result.verwijderd)throw new Error('Geen bijbehorende kaartverwijzing gevonden');
await writeFile(out,JSON.stringify(result.kaarten),{flag:'wx',mode:0o600});
console.log(JSON.stringify({verwijzingenVerwijderd:result.verwijderd,bronOngewijzigd:true}));
