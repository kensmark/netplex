# NetPlex Design 2

## Udgave 1.4.2: enklere modulstyring

Det valgte modul har et skraldespandsikon direkte i modulrækken. Forsidens rod kan ikke slettes. Sletning opdaterer forhåndsvisningen og kan fortrydes/gentages; Gem design og Annullér styrer fortsat, om ændringen bevares. Den tidligere Fjern modulet-knap langt nede i egenskaberne er fjernet.

Den globale Tilføj færdig kategori-vælger er fjernet. Tilføj en kategori med + Kategori, og anvend Brug færdig kategori inde i kategoriens justeringer. Sektioner/Side om side er taget ud af Studio. Klientens normalisering flader ældre indlejrede sektioner ud til almindelige moduler i samme rækkefølge uden at miste kategorier, id'er eller filtre. Den gemte fil overskrives først ved Gem design. Det eksisterende filformat accepteres fortsat af hensyn til gamle designfiler.

## Udgave 1.4: katalog fra flere servere

`server/catalog.js` ejer serveropdagelse, fravalg, pagineret indlæsning, kildeidentitet, samling af dubletter og kompatibilitet med tidligere lister. Indstillingerne udvides bagudkompatibelt med servers, serverSelections og catalogBookmarks. Tokens og serveradresser opbevares lokalt, adskilt fra designfiler. Kontoens fravalg overlever ny login; en manuel forbindelse opgraderes fra connection.

Den oprindelige servers numeriske ratingKey-id'er bevares. Andre kopier har et kvalificeret id med serverhash og lokal ratingKey. Globale metadata-id'er danner grupper; titel og år bruges ikke til at gætte. Offentlige source-objekter indeholder id, serverId, navn, opløsning og udgave. Detaljer kan vælge en kopi, og begge afspillere videresender sourceId. Sessions gemmer en privat kopi af forbindelsen og den lokale ratingKey til streaming og historik. Billedproxyen slår kun op i valgte, kendte forbindelser.

Servere indlæses uafhængigt. Fejl giver warnings sammen med øvrige resultater. Cachegenerationer afviser forældede resultater, når valg eller bruger ændres. Gamle serverbaserede favoritter matches til globale identiteter før oprindelsesserveren fravælges. Sæsoner og episoder samles via global eller betroet forældreidentitet og bevarer den valgte kopis afspilningskilde.

Gem-knappen på kortet er en søskende til plakatknappen og er derfor uafhængig af detaljeklik. Billede og mørk gradient har samme transformerede forælder. Karrusellen fylder modulet med et helt antal lige brede kort, beregnet ud fra syv størrelsestrin. Samme kolonneantal bruges på delvist fyldte sider, der starter fra venstre; pile bliver ved modulets kanter. Alle kort reserverer ni pixels under billedet til fremdrift, uanset om titlen er påbegyndt. Windows-testen dækker stabile modul-/pilepositioner på sider med og uden fremdrift, flere størrelser, delvise sider, servervalg, kildeskift, gemning og gradientdækning.

## Udgave 1.3.2: samme kort i hele programmet

Film, Serier og Din liste bruger samme FilmCard-komponent og fælles størrelsestrin som forsiden. Den faktiske kortbredde tilpasses beholderen med lige brede gridkolonner. Den særskilte kompakte kortvariant er fjernet. Ældre library.layout=list vises som gitter i klienten; tidligere list-kategorier vises som lodrette kolonner med fælles kort. JSON-formatets width accepterer stadig eksisterende pixelværdier og fortolkes som det nærmeste størrelsestrin. Opgraderingen ændrer ikke gemte filer, før brugeren gemmer eksplicit.

Topmenuens søgeformular er en rigtig input. Fokus skifter ikke side. Søgninger gemmes i hash-ruten som search?q=…, mens efterfølgende tastetryk erstatter samme historikpost. Headeren forbliver monteret under resultatopdateringer, og lokale film-/seriesøgninger holdes adskilt. Ctrl+K fokuserer feltet. Globale resultater viser ikke et ekstra lokalt søgefelt.

## Udgave 1.3.1: enkle kort og medvirkende

Filmkort viser nu fast titel, år og bedømmelse. Hoverportalen er fjernet, og hele billedet åbner detaljerne. Det eksisterende korttræ bevares i filkontrakten af hensyn til importerede temaer; billedfelt og billedformat læses fra træet, mens øvrige metadata og handlinger aktuelt tegnes fast. Kortindstillingerne styrer størrelse, billedformat og afrunding. Fremdrift ligger i normalt dokumentflow efter den afrundede billedramme, så linjen beholder hele sin bredde.

`public/metadata-display.js` forkorter medvirkende til højst 300 Unicode-tegn og leverer HTML-escaped indhold. Detaljedialogens Mere information/Vis mindre skifter mellem forhåndsvisning og fuld liste uden at tegne dialogen på ny. Korte lister har ingen udfoldningsknap. Menuetiketter normaliseres i klienten til Forside og Din liste; gemte filer overskrives først ved eksplicit gemning.

## Udgave 1.3: tema og layout hver for sig

Den aktive opsætning er fortsat et bagudkompatibelt `netplex.design` i version 2. To uafhængige delingsformater tilføjes: `netplex.theme` version 1 (theme, cards og navigation.position) og `netplex.layout` version 1 (pages, library og navigation.items). Hvert format har et særskilt schema, som bygges og valideres på forhånd. Import af én del ændrer aldrig den anden; gamle komplette filer kan opdeles ved import. En komplet sikkerhedskopi er stadig tilgængelig.

Temaer har fire indbyggede valg og et lokalt bibliotek i `themes.json`, adskilt fra aktivt design og Plex-login. Det gemmes atomisk gennem autentificerede, CSRF-beskyttede `/api/themes`-endepunkter. Gemning i biblioteket er en selvstændig handling og fortrydes ikke ved annullering af aktiv forhåndsvisning.

Sektioner understøtter stack, columns (side om side) og masonry (lodret modulflow). Side om side kan fordeles 1:1, 2:1 eller 1:2; sektioner kan indrammes som paneler. Kategorier kan vise vandret karrusel, gitter, kompakt liste eller lodret plakatkolonne. Færdige kategoriopskrifter gemmer almindelige query-regler og tilføjer kun navne fra biblioteket for genrer.

Filmkortets billede forbliver klikbart. Overlayet viser kun titel og år og har ingen pegeinteraktion. Øvrige oplysninger og runde ikonhandlinger vises i en portal uden for karrusellens beskæring. Panelets tekst ombrydes og kan rulle ved lange beskrivelser; dets størrelse afhænger ikke af billedets højde. Tastaturfokus åbner panelet, pil ned går til handlingerne, og Escape vender tilbage. Listevisning viser kompakte billeder med tekst ved siden af.

`npm run test:ui` kører Studio-, customization-, multi-server- og search-checks i isolerede Windows-profiler. Tests dækker små bredformatkort, lange tekster, plakathitområder, gemmeikoner, stabile rækker, separate JSON-filer, temaer, kategoriopskrifter, sektioner, global søgning og lokale film-/seriefiltre.

Windows-programmets brugerflade har nu en fælles TypeScript/React-motor. Den samme motor kan bruges af webappen. Plex-login, medier, personlige lister og afspilning ligger i værtsappen; designfiler beskriver kun præsentation og biblioteksregler.

## Lag og filer

- `src/design/types.ts`: typer for design, layout, kort, filmdata og kategorier.
- `scripts/design-schema.mjs`: den autoritative JSON Schema-kontrakt. Bygningen offentliggør `public/design/schema.json` og genererer en validator på forhånd.
- `src/design/core.ts`: validering, kompleksitetsgrænser, kategorifiltre og opslag i hele biblioteket. Bygges til `public/design/core.js`, som deles af den lokale server og brugerfladen.
- `src/ui/components.tsx`: React-komponenter til navigation, layout, hero, kategorier og filmkort.
- `src/ui/studio.tsx`: Designstudio med live forhåndsvisning, modultræ, flytning, tema, kort, JSON, fortryd/gentag og deling.
- `src/ui/store.ts`: aktivt design, gemt design og historik. Forhåndsvisning gemmes først ved **Gem design**.
- `src/ui/index.tsx`: adapteren mellem designmotoren og værtsappen. Værten leverer filmillustrationer, ikoner, ruter og personlige listeoplysninger.
- `public/app.js`: den eksisterende værtsapp med Plex-login, biblioteksnavigation, detaljer og afspilning. Hjemmesiden og filmkortene tegnes af React; dialoger og afspilningslogik migreres efter behov.
- `server/design-store.js`: separat, atomisk lagring og genopretning af designfiler.
- `designs/`: tre komplette, delbare eksempelpakker: Premiere, Obsidian og Archive.

## Format

Rodobjektet har `format: "netplex.design"` og `formatVersion: 2`. Tema, navigation, én fælles kortskabelon i cards.shared, biblioteksvisning og forsidelayout er obligatoriske. JSON Schema-filen indeholder alle felter, værdier og grænser. Ukendte felter og versioner bliver afvist med en fejl; den aktive visning bevares.

Forsiden er et træ i `pages.home`. Layouttyperne er `container`, `text`, `spacer`, `hero` og `collection`. En container har stak eller kolonner og vilkårlige understøttede underbyggesten. Filmkort har deres eget træ af `container`, `image`, `field`, `action` og `progress`. Det giver eksempelvis rating over et kvadratisk billede og en gem-knap under titlen, uden en ny kortkomponent.

`query` vælger `library`, `continuing` eller `saved`. Filtre omfatter types, genres, directors og actors som flervalg samt år fra og før, minimumsbedømmelse, usete film, opløsning, tekst og maksimal spilletid i minutter. Året `lt: 1990` betyder før 1990; manglende årstal matcher ikke et årstalsfilter. Sortering og antal vælges separat. Kategorier med samme regler virker med modtagerens eget Plex-bibliotek. Query-resultater beregnes på serverens fuldt paginerede bibliotek.

Tilføj en byggesten ved at opdatere typen, schemaet, rendererens komponent og eventuelt studiets egenskabspanel. Importér aldrig komponenter eller funktionsnavne fra en designfil. Handlinger vælges gennem den faste kontrakt `play`, `details` og `save` og går gennem værtsappens normale adgangskontrol.

## Lagring og deling

Windows bruger `%APPDATA%/NetPlex Desktop/design.json`; udviklingsudgaven bruger sit valgte datakatalog. Designet gemmes separat fra `settings.json`. Sidste gyldige version bevares som `design.backup.json`. Et ugyldigt gemt design åbner Premiere med en forklaring; den ugyldige fil overskrives ikke automatisk.

Eksportér en `.netplex.json`-fil i Designstudio. Filen indeholder ingen automatisk eksporterede Plex-login, serveradresser, medie-id'er, film eller historik. **Hent guide til ChatGPT** giver design, schema og en redigeringsprompt i én Markdown-fil. Importen understøtter de tre indbyggede skrifttypevalg og serverens egne filmillustrationer. Frie CSS-filer, eksterne assets og kodeplugins er udvidelser til en senere formatversion.

Designformatet har faste grænser på 64 KB, 180 sidemoduler og 8 niveauer. De samme begrænsninger og schema bruges i klient og server. Validatoren kompileres ved bygning, så CSP ikke kræver `unsafe-eval`. JSON-kontrolleret tekst rendres som tekst, og alle side- og korttyper er fast definerede React-komponenter.

## Bygning og test

`npm run build:ui` bygger de lokale, selvstændige UI-filer og de delbare eksempler. `npm start`, `npm test` og `npm run check` bygger automatisk først. Windows-bygningen gør det samme, før UI-filerne pakkes sammen med Electron og mpv.

`npm test` kontrollerer format, filtre, API, sikker import og lagring. `npm run test:ui` kontrollerer studiet i Windows-programmets Electron-vindue med et isoleret testbibliotek og en separat profil. Desktop-tests kontrollerer fortsat originalafspilning, undertekster og den snævre IPC-adgang.

Den native afspillers eget vindue og afspilningskontroller er aktuelt en del af værtsappen. Designformatet ændrer navigation, forside, kategorier og filmkort; det flytter ikke den native videoflade eller dens kontrolområder.


## Version 2 og livevisning

Version 1 valideres først mod det frosne schema i scripts/design-schema-v1.json og opgraderes derefter til version 2. Eksisterende layout, farver og kategorier bevares. Alle filmkort samles i cards.shared; afrunding flyttes fra temaet til kortet. Modulernes individuelle kortoverskrivninger og temaets breddebegrænsning fjernes. Den gemte fil ændres først ved eksplicit gemning.

Livevisningen holder React-rødderne monteret. Visuelle ændringer opdaterer kun komponenter og CSS-variabler. Kun ændringer i modulernes query-signatur genhenter kategoridata, mens de eksisterende resultater bliver stående. Scrollforankring og React-nøgler bevarer viewport, billeder og katalogside.

GET /api/design/catalog udleder valgmuligheder fra det fuldt paginerede bibliotek og fortsæt-listen. Genrer, instruktører og medvirkende matches med ELLER inden for samme liste og OG mellem de forskellige lister. Rollelisten afkortes ikke til de første otte personer.

Windows-testen køres med npm run test:ui eller npm run test:studio fra desktop-mappen og kontrollerer de faktiske Electron-komponenter, filtre, hover, sideomløb, trækmarkering og stabil livevisning.


## macOS-værten

Windows og macOS deler React-motor, designkontrakter og lokal Plex-backend. macOS gemmer brugerfiler i `~/Library/Application Support/NetPlex Desktop`; Windows beholder sit eksisterende datakatalog. Den platformsspecifikke afspiller er uden for designformatet: Windows bruger den indlejrede Win32-videoflade, mens Mac bruger et separat medfølgende mpv-vindue. `desktop/platform.js` vælger spillersti, argumenter og privat IPC. `desktop/native-video.js` indlæser kun Windows-FFI på Windows. Begge Mac-arkitekturer bygges og testes på native GitHub-runners.
