# Beginhouding en pijl — V2

310 bestaande reviewillustraties geïmporteerd uit de Carla-controleset. De gecorrigeerde 076-abwheel-v2 is gebruikt. Geen oefening nieuw gegenereerd en geen uitvoering aangepast in deze release.

Alle bestanden hebben een canvas van 800×1200. Alleen lege buitenmarges zijn verkleind op basis van alle pixels donkerder dan 245; 2,5% veiligheidsruimte wordt toegevoegd, daarna proportioneel passend gemaakt. CSS gebruikt contain, center en border-box op scherm en print.

De broncatalogi en oude afbeeldingen blijven intact. De server vervangt uitsluitend de V2-lijnweergave via een mapping op het oorspronkelijke afbeeldingspad, nadat de stabiele exerciseId is bepaald. Avatar blijft ongewijzigd. De landingkaart, de papieren fotomontage en de twee HTML-telefoonvoorbeelden gebruiken dezelfde nieuwe assets. De lifestylefoto van de telefoon is geen exacte screenshot en is niet opnieuw gegenereerd.

Negen beelden blijven bewust ongewijzigd wegens bestaande inhoudelijke reviewblokkades. IDs: 179, 192, 219, 221, 222, 230, 238, 251, 252. Redenen staan in content/beginhouding-pijl.json. Visuele review is geen klinische goedkeuring.

Controle: test-arrow-assets, test-image-mode, test-landing-assets, test-privacy, build en HTTP-controle van alle 319 afbeeldingen. V1 ontvangt nul nieuwe beeldpaden.
