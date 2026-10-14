# GtJ

Un videogioco per desktop che fonde tre minigiochi in un unico percorso a sblocchi: si completa il primo, poi il secondo, poi il terzo. Ogni minigioco ha anche una modalità a sopravvivenza per battere il proprio record.

## Language

**GtJ**:
Il prodotto intero, formato da tre capitoli giocati in sequenza. Nome provvisorio.
_Avoid_: il gioco, la fusione

**Capitolo**:
Uno dei tre giochi che compongono GtJ: Jump Guy, Clear the Room, One Tower Defense. Si sblocca solo completando il capitolo precedente.
_Avoid_: gioco, minigioco, mondo

**Livello**:
Uno stadio a difficoltà crescente dentro un capitolo, con una condizione di fine propria. Completare un capitolo significa superarne tutti i livelli.
_Avoid_: stage, round, schermata

**Modalità Endless**:
La modalità a sopravvivenza di un capitolo, senza fine, in cui conta quanto si dura. Si sblocca solo dopo aver completato quel capitolo.
_Avoid_: infinita, survival

**Vita**:
Una possibilità di fallire in un livello. Esaurite le vite, si riparte dall'inizio del capitolo.
_Avoid_: tentativo, cuore

**Salute**:
I cuori del giocatore dentro un livello del Capitolo 2. Finiti i cuori si perde una **Vita** e il livello ricomincia. Non va confusa con la Vita.
_Avoid_: HP, vita

**Stanza**:
Un'area chiusa del Capitolo 2 da ripulire dai nemici prima di passare alla successiva. Le stanze di un livello formano una catena lineare, senza tornare indietro.
_Avoid_: schermata, mappa

**Ondata**:
Un gruppo di nemici che compare insieme in una stanza. Una stanza ha più ondate; si ripulisce sconfiggendole tutte.
_Avoid_: wave, turno

**Boss**:
Il nemico finale del Capitolo 2, nell'ultima stanza del Livello 5. Sconfiggerlo completa il capitolo.
_Avoid_: capo

## Capitoli

**Jump Guy**:
Capitolo 1. Un runner a scorrimento automatico con un solo tasto per saltare gli ostacoli. Un livello è un percorso di lunghezza fissa.

**Clear the Room**:
Capitolo 2. Un gioco d'azione in cui si attraversano stanze collegate colpendo i nemici che inseguono il giocatore. Un livello è una serie di stanze da ripulire; l'ultima del Livello 5 ospita il Boss. Si muove con WASD e si spara col mouse; i nemici (Grunt, Runner, Brute, Splitter) inseguono sempre il giocatore. La Modalità Endless si misura in stanze ripulite.

**One Tower Defense**:
Capitolo 3. Si difende una torretta lanciando incantesimi attivi, multipli e potenziabili. Un livello è un'ondata di nemici da sconfiggere.
