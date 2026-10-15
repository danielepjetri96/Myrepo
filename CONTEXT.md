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
Quanto si può ancora incassare dentro un livello: i cuori del giocatore nel Capitolo 2, la barra della **Torretta** nel Capitolo 3. Finita la Salute si perde una **Vita** e il livello ricomincia. Non va confusa con la Vita.
_Avoid_: HP, vita

**Stanza**:
Un'area chiusa del Capitolo 2 da ripulire dai nemici prima di passare alla successiva. Le stanze di un livello formano una catena lineare, senza tornare indietro.
_Avoid_: schermata, mappa

**Ondata**:
Un gruppo di nemici che arriva insieme: in una stanza (Capitolo 2) o sul campo attorno alla Torretta (Capitolo 3). Una stanza o un livello del Capitolo 3 ha più ondate; si supera sconfiggendole tutte.
_Avoid_: wave, turno

**Boss**:
Il nemico finale di un capitolo, nel Livello 5: nell'ultima stanza nel Capitolo 2, come ultima ondata nel Capitolo 3. Sconfiggerlo completa il capitolo.
_Avoid_: capo

**Torretta**:
La torre al centro del campo nel Capitolo 3, da cui il giocatore lancia gli incantesimi. Non si muove; ha una propria **Salute**.
_Avoid_: torre, base

**Incantesimo**:
Un attacco lanciato dal giocatore nel Capitolo 3 verso il cursore: Dardo, Palla di fuoco, Gelo, Fulmine, Meteora. Se ne sblocca uno nuovo a ogni livello.
_Avoid_: magia, spell, abilità

**Ricarica**:
Il tempo di attesa di un incantesimo prima di poterlo lanciare di nuovo. Ogni incantesimo ha la sua; non esiste una riserva comune (mana).
_Avoid_: cooldown

**Potenziamento**:
Un miglioramento permanente di un incantesimo o della Torretta, scelto 1 tra 3 a fine livello (nell'Endless ogni 3 ondate). Vale per tutta la partita al capitolo e si perde al game over.
_Avoid_: upgrade, bonus

## Capitoli

**Jump Guy**:
Capitolo 1. Un runner a scorrimento automatico con un solo tasto per saltare gli ostacoli. Un livello è un percorso di lunghezza fissa.

**Clear the Room**:
Capitolo 2. Un gioco d'azione in cui si attraversano stanze collegate colpendo i nemici che inseguono il giocatore. Un livello è una serie di stanze da ripulire; l'ultima del Livello 5 ospita il Boss. Si muove con WASD e si spara col mouse; i nemici (Grunt, Runner, Brute, Splitter) inseguono sempre il giocatore. La Modalità Endless si misura in stanze ripulite.

**One Tower Defense**:
Capitolo 3. Si difende la Torretta al centro di una schermata fissa lanciando incantesimi (tasti 1-5 per scegliere, clic per lanciare); i nemici (Goblin, Lupo, Orco, Sciamano) arrivano dai bordi e, raggiunta la Torretta, la colpiscono. Un livello è una serie di ondate; l'ultima del Livello 5 è il Boss. La Modalità Endless si misura in ondate superate.
