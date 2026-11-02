/* Eén melding per versie; handmatig opnieuw te openen naast Help. */
(function(){
  if(!document.documentElement.classList.contains('v2'))return;
  var version='2026-11-02-kaarten',key='fysiplan_release_seen';
  var dialog=document.createElement('dialog');
  dialog.className='no-print';
  dialog.setAttribute('aria-label','Nieuw in Fysiplan');
  dialog.style.cssText='max-width:480px;border:1px solid #dbe2ea;border-radius:12px;padding:24px;color:#243247';
  var title=document.createElement('h2');title.textContent='Nieuw in Fysiplan';dialog.appendChild(title);
  var text=document.createElement('p');text.textContent='Praktijkwebsite op de kaart, legenda voor series/herhalingen/weerstand, compacte beeldkeuze en sjablonen aanpassen als eigen variant. Op de mobiele kaart kun je een beschikbare voorleesstem kiezen.';dialog.appendChild(text);
  var note=document.createElement('p');note.textContent='Nieuwe tekeningen en inhoudelijk gewijzigde standaardsjablonen worden pas na beoordeling vrijgegeven. Bestaande kaarten blijven behouden.';dialog.appendChild(note);
  var close=document.createElement('button');close.className='btn primary';close.textContent='Begrepen';close.onclick=function(){try{localStorage.setItem(key,version);}catch(e){}dialog.close();};dialog.appendChild(close);
  document.body.appendChild(dialog);
  var button=document.createElement('button');button.type='button';button.className='mi';button.textContent='Updates';button.onclick=function(){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');};
  var menu=document.querySelector('.topbar .menu');if(menu)menu.appendChild(button);
  var seen=false;try{seen=localStorage.getItem(key)===version;}catch(e){}
  // Geen kaart, invoerveld of ander dialoogvenster onderbreken.
  if(!seen&&typeof dialog.showModal==='function')setTimeout(function(){if(!document.querySelector('.ov.on')&&document.activeElement===document.body)dialog.showModal();},1200);
})();
