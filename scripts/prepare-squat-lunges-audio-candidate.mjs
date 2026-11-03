// Offline private preparation only: no synthesis, network, or public manifest writes.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {exerciseId} from '../lib/exercise-id.js';
const sha=x=>createHash('sha256').update(x).digest('hex');
const source='output/audio-source/squat-lunges-api-0784c32a.wav';
const job='0784c32aaf954f3c923a95ad6d1132a5';
const manifestPath='public/audio/noor/manifest.json';
const before=fs.readFileSync(manifestPath);
const manifest=JSON.parse(before);
const entry=JSON.parse(fs.readFileSync('public/oefeningen-v2.json')).find(e=>e.naam==='Squat lunges');
const text=entry.naam+'. '+entry.uitleg;
assert.equal(exerciseId(entry),'fp_12da2b17ebb73174');
assert.equal(sha(text),'2b0b6edcf8aa79ed0f41a7dd20d4a54b27a1b31cf72c848ba67c4f96d158c60a');
assert.ok(!manifest.clips.some(c=>c.name===entry.naam),'Already published; do not duplicate');
const holds=JSON.parse(fs.readFileSync('public/mobile-narration-review.json')).holds;
assert.ok(!holds.some(h=>h.exerciseId===exerciseId(entry)||h.name===entry.naam));
const probe=p=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=format_name,duration:stream=codec_name,sample_rate,channels','-of','json',p],{encoding:'utf8'}));
const sourceFormat=probe(source);assert.equal(sourceFormat.format.format_name,'wav');
assert.equal(sourceFormat.streams[0].codec_name,'pcm_s16le');
const duration=Number(sourceFormat.format.duration);assert.ok(duration>1&&duration<180);
const sourceSha256=sha(fs.readFileSync(source));
const dir='output/audio-pending/'+job;
fs.mkdirSync(dir,{recursive:true});
const out=dir+'/narration.mp3';
const metadata=dir+'/candidate.json';
if(fs.existsSync(metadata))assert.equal(JSON.parse(fs.readFileSync(metadata)).sourceSha256,sourceSha256,'Changed original');
if(!fs.existsSync(out))execFileSync('ffmpeg',['-v','error','-i',source,'-vn','-codec:a','libmp3lame','-q:a','2',out]);
execFileSync('ffmpeg',['-v','error','-i',out,'-f','null','-']);
const outputFormat=probe(out);
const transcriptPath=dir+'/squat-lunges-api-0784c32a.json';
const transcript=fs.existsSync(transcriptPath)?JSON.parse(fs.readFileSync(transcriptPath)):null;
const report={schemaVersion:1,status:'pending-listening-review',public:false,exerciseId:exerciseId(entry),name:entry.naam,text,textSha256:sha(text),requestId:job,
 provider:'HeyGen API playground UI',voiceId:'ea8f12713f7644ea9ad4ed710901fbbb',providerVoice:'Marieke',observedUi:{model:'Normal',language:'Dutch',expressiveness:1,speedExposed:false},requestedSpeed:null,
 sourceFile:source,sourceSha256,sourceFormat,duration,mp3:out,mp3Sha256:sha(fs.readFileSync(out)),outputFormat,
 processing:'MP3 encoding only; no tempo, pitch, trim, gain or text changes.',
 cost:{characterCount:text.length,estimatedUsd:text.length*15/1e6,actualDebitVerified:false},
 verification:{exactSubmittedTextMatch:true,decodedComplete:true,independentTranscriptVerified:false,deliveryListeningReviewed:false,clinicalApproved:false},
 transcriptReview:transcript?{tool:'Existing Homebrew Whisper 20250625_3, cached small.pt, CPU, Dutch; no initial prompt, no model download or network service',path:transcriptPath,text:transcript.text,differences:['Squat lunges → Squatlunches','spreidstand → sprijtstand','duw → doe','knieen → knieën (spelling only)'],conclusion:'Not an exact transcript match. ASR differences may be recognition errors, not proven speech defects. Especially listen to duw/doe before accepting. No synthesis retry requested.'}:null,
 limitation:'Local transcription is available but does not establish natural delivery. Technical decode is not listening. Do not publish until the entire recording has been checked against the text and voice delivery.',
 integration:{action:'After review only, add one clip to existing manifest; never replace its clips array with this candidate.',hashPolicy:'Use verified actual provenance including sourceSha256 and requestedSpeed:null. Legacy global speed 0.95 is not evidence of this recording speed.'}};
fs.writeFileSync(metadata,JSON.stringify(report,null,2)+'\n');
assert.equal(sha(fs.readFileSync(manifestPath)),sha(before),'Public manifest must remain unchanged');
console.log(JSON.stringify({status:report.status,metadata,publicClipsUnchanged:manifest.clips.length,duration,sourceSha256,estimatedUsd:report.cost.estimatedUsd}));
