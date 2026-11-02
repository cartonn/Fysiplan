/* Vooraf gegenereerde, algemene uitleg. Geen synthesedienst of patiënttekst in de browser. */
(function(root){
  'use strict';
  var manifest=null,loading=null,player=null,serial=0,wacht=null;
  // Een opname die blijft hangen (slecht bereik, lift, trein) geeft anders eindeloze
  // stilte met een knop die "Stop" blijft zeggen: het mediaelement stuurt dan geen
  // enkele foutmelding. Daarom een eigen wachttijd, niet alleen bij het starten maar
  // ook als een fragment halverwege stokt ('waiting'/'stalled'). Zodra het geluid weer
  // loopt ('playing', of een tijd die echt vooruitgaat) vervalt de wachttijd. Een
  // tweede stokmelding verlengt een lopende wachttijd niet.
  var WACHTTIJD=12000;
  var HAPERT='De opname laadt niet of hapert. Controleer je verbinding en probeer het opnieuw, of lees de uitleg op de kaart.';
  function load(){
    if(!loading)loading=fetch('/audio/noor/manifest.json',{cache:'no-cache'}).then(function(r){
      if(!r.ok)throw Error('Noor-audio is niet beschikbaar.');return r.json();
    }).then(function(m){manifest=m;return m;}).catch(function(e){loading=null;throw e;});
    return loading;
  }
  function match(name,text){
    return manifest&&manifest.clips.find(function(c){
      return c.name===name&&c.text===name+'. '+text&&/^\/audio\/noor\/[a-f0-9]+\.mp3$/.test(c.src);
    });
  }
  function stopWacht(){if(wacht){clearTimeout(wacht);wacht=null;}}
  function stop(){serial++;stopWacht();if(player){player.onended=null;player.onerror=null;player.onplaying=null;player.onwaiting=null;player.onstalled=null;player.ontimeupdate=null;player.pause();player.removeAttribute('src');player.load();player=null;}}
  async function play(items,done,error){
    stop();var token=serial;
    try{
      await load();if(token!==serial)return;
      var clips=items.map(function(x){return match(x.name,x.text);});
      if(!clips.length||clips.some(function(x){return !x;}))throw Error('Voor deze uitleg is nog geen actuele Noor-opname beschikbaar. Lees de uitleg op de kaart.');
      player=new Audio();player.preload='auto';var i=0,laatsteTijd=0;
      function fail(bericht){if(token!==serial)return;stop();if(error)error(bericht||'De Noor-opname kon niet worden afgespeeld. Probeer opnieuw of lees de uitleg.');}
      // wachttijd starten als er nog geen loopt; een lopende wachttijd niet verlengen
      function waak(){if(token!==serial||wacht)return;wacht=setTimeout(function(){wacht=null;fail(HAPERT);},WACHTTIJD);}
      function loopt(){if(token===serial)stopWacht();}
      // 'stalled' kan komen terwijl er nog genoeg gebufferd is: zolang de tijd echt
      // vooruitgaat hoort de patiënt geluid en is er niets aan de hand
      function voortgang(){
        if(token!==serial||!player)return;
        var t=Number(player.currentTime)||0;
        if(t>laatsteTijd){laatsteTijd=t;stopWacht();}
      }
      function next(){
        if(token!==serial)return;
        stopWacht();laatsteTijd=0;
        if(i===clips.length){stop();if(done)done();return;}
        player.src=clips[i++].src;
        waak();
        var promise=player.play();if(promise&&promise.catch)promise.catch(function(){fail();});
      }
      player.onplaying=loopt;player.onwaiting=waak;player.onstalled=waak;player.ontimeupdate=voortgang;
      player.onerror=function(){fail();};player.onended=next;next();
    }catch(e){if(token!==serial)return;stop();if(error)error(e.message);}
  }
  root.NoorAudio={load:load,match:match,play:play,stop:stop};
  load().catch(function(){});
})(window);
