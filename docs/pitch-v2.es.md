# MARBLESS — Pitch V2 (final)

> **Blockchain Summit Global · 31 de julio de 2026.** 3 minutos de pitch + 2 minutos de Q&A.
> Jurado: 2 jueces que ya nos vieron + jueces nuevos, orientados a **producto y plata**.
> Objetivo declarado: **ganar**. Todo lo demás es un plus.
>
> Fuente de verdad para armar las slides. V1 = 7 slides técnicas; V2 = 9 slides, bloque de negocio real.

---

## Presupuesto de tiempo — 180 segundos

| # | Slide | Seg | Acumulado |
|---|---|---|---|
| 1 | Portada | 10 | 0:10 |
| 2 | El problema | 25 | 0:35 |
| 3 | La solución | 25 | **1:00** |
| 4 | Cómo funciona + la prueba | 40 | **1:40** |
| 5 | Mercado | 20 | 2:00 |
| 6 | Modelo de negocio | 20 | 2:20 |
| 7 | Competencia / por qué nosotros | 20 | **2:40** |
| 8 | Equipo | 10 | 2:50 |
| 9 | Roadmap + cierre | 10 | **3:00** |

**Táctica:** la slide 9 queda en pantalla durante los 2 minutos de Q&A. Son 2 minutos gratis de
pantalla — que lleve logo, la frase clave, el QR a la dApp y las direcciones de contrato.

---

## Cambios obligatorios heredados de V1

| # | Qué | Por qué |
|---|---|---|
| 1 | **ARCTURITO → ARTURITO** en la portada | Typo en la portada de un deck de finales |
| 2 | **Eliminar toda mención a "onboardeamos wallets con QR"** (slides 6 y 7 de V1) | `nextId = 26`: 9 bolitas minteadas, todas nuestras. La afirmación no se sostiene y es la pregunta más probable del Q&A |
| 3 | **Sacar Three.js del stack** | El 3D se dropeó el 2026-07-29 |
| 4 | **Fusionar slides 5 y 6 de V1** | Repetían "aleatoriedad verificable" como columna titulada en las dos |
| 5 | **El video de YouTube va de fondo en la slide 2**, no como slide propia | Es B-roll: hablás encima. Como slide suelta cuesta una transición |
| 6 | **Atribuir el video en pantalla** ("footage: Jelle's Marble Runs") | Es material de terceros en un deck de competencia. Además refuerza el dato de 1,5 M |
| 7 | Correcciones de ortografía | "o **que** la física" · "el **pool de tokens**" · "un juego **que** se posee" |

---

# SLIDE 1 · Portada — 10s

**En pantalla**
```
FINALISTA · ETHEREUM BUILDATHON URUGUAY 2026 · ARTURITO LABS

MARBLESS
Carreras de bolitas probadamente justas, onchain.

Propiedad · Participación · Justicia demostrable
— las tres cosas que un video no puede darte.
```
*(Mantener el diseño de V1: fondo oscuro, bolitas numeradas 1/3/7/9. Funciona.)*

**Decís (10s)**
> Soy [NOMBRE], de Arturito Labs. Esto es MARBLESS: carreras de bolitas probadamente justas,
> sobre Ethereum.

**Nota:** "FINALISTA" en el encabezado es una credencial gratis. Que se lea.

---

# SLIDE 2 · El problema — 25s

**En pantalla** — B-roll de la carrera de fondo, números grandes encima

```
UNA AUDIENCIA MASIVA. CERO PARTICIPACIÓN.

1,5 M          200 M+          HBO · ESPN
suscriptores   vistas          las bolitas ya llegaron a la TV
(un solo canal)

No podés tener una bolita.
No podés competir con ella.
No podés probar que el resultado no se armó en la edición.

                                    footage: Jelle's Marble Runs
```

**Decís (25s)**
> Las carreras de bolitas ya son un fenómeno de masas. Un solo canal — Jelle's Marble Runs — tiene
> un millón y medio de suscriptores y más de doscientos millones de vistas. Estuvo en HBO y en ESPN.
> Y mirá bien lo que está pasando acá: **todo el mundo mira. Nadie participa.** No podés tener una
> bolita, no podés competir con ella, y no podés probar que el resultado no se armó en la edición,
> o que la física no está arreglada a favor de una.

**Nota:** V1 decía 1,45 M. El número actualizado a junio 2026 es ~1,51 M. Usá **1,5 M**.

---

# SLIDE 3 · La solución — 25s

**En pantalla**
```
MARBLESS convierte esa audiencia pasiva en jugadores.

Tenés tu bolita. Corrés con ella.
El resultado lo firma la cadena — no nosotros.

PROPIEDAD          PARTICIPACIÓN          JUSTICIA DEMOSTRABLE
tu bolita es un    entrás y podés         Chainlink VRF decide;
NFT tuyo           ganar, no solo mirar   cualquiera lo verifica
```

**Decís (25s)**
> MARBLESS agarra ese fenómeno y le agrega las tres cosas que un video no puede dar.
> **Propiedad:** tu bolita es un NFT tuyo. **Participación:** entrás a la carrera y podés ganar.
> Y **justicia demostrable:** el ganador lo elige Chainlink VRF, con prueba criptográfica —
> fuera del alcance nuestro, del jugador y del validador. Nadie tiene que confiar en nosotros.

---

# SLIDE 4 · Cómo funciona + la prueba — 40s ← **LA SLIDE**

**En pantalla** — arriba el loop, abajo el recibo de una carrera real

```
EL LOOP                                          (compacto, 4 pasos visibles)
 Minteás  ›  Acumulás  ›  Entrás  ›  Sorteo VRF  ›  Cobrás
 tu bolita   crédito     1 acción   + settle       verificable

────────────────────────────────────────────────────────────

NO ES UNA MAQUETA. ES UNA CARRERA REAL, EN SEPOLIA.

Carrera #1 · 8 jugadores · pot 18 MRBL
Orden de llegada  [22, 23, 24, 21, 20, 18, 19, 25]
Pagos  9,0 / 4,5 / 2,25   ·   quemado 1,8   ·   dust 0
Chainlink VRF: 60 segundos, 5 bloques

▶ Recomputamos el sorteo fuera de la cadena, desde el
  randomWord público: dio el mismo podio. 8 de 8.
```

**Decís (40s)**
> El loop es simple: minteás tu bolita, va acumulando crédito, entrás a una carrera con una sola
> acción, y el ganador lo sortea Chainlink.
> Pero no les quiero mostrar una maqueta. **Esta carrera pasó de verdad, en Sepolia.** Ocho
> jugadores, pot de dieciocho, este fue el orden de llegada, estos los pagos, cero dust. VRF
> respondió en sesenta segundos.
> Y acá está lo importante: **agarramos el número aleatorio público, rehicimos el sorteo por
> nuestra cuenta fuera de la cadena, y nos dio exactamente el mismo podio. Ocho de ocho.**
> Cualquiera en esta sala puede hacer lo mismo desde el celular, ahora.

**Notas de producción**
- Poner el link/QR a la tx de `settle` en Etherscan. Contrato `MarbleRace`:
  `0x48C6f3607474A0bF013924987371eeaF3A252215`
- Si llega la UI de carrera: clip editado de 8–10s **por encima** del recibo. Si no llega, el recibo
  de Etherscan solo alcanza y sobra.
- **No hacer la carrera en vivo.** VRF tarda 60s y `rescueStalled` recién habilita a `deadline + 1 día`:
  si se cuelga en el escenario, no hay recuperación.

---

# SLIDE 5 · Mercado — 20s

**En pantalla**
```
UN MERCADO QUE CRECE, SOBRE UNA AUDIENCIA QUE YA EXISTE.

TAM   Gaming Web3 — US$ 48,5 mil M en 2026, +22,4% anual
      (Research and Markets)

SAM   La audiencia de contenido de carreras — millones de
      espectadores recurrentes, hoy 100% pasivos

SOM   256 bolitas · 16 licencias de creador
      (el MVP es chico a propósito)

No existe hoy un producto que le dé participación
verificable a esta audiencia. Ese es el hueco.
```

**Decís (20s)**
> El gaming Web3 es un mercado de cuarenta y ocho mil millones de dólares este año, creciendo al
> veintidós por ciento anual. Pero lo que nos importa no es el tamaño del mercado: es que **la
> audiencia de las carreras de bolitas ya existe, ya es de millones, y no hay nada que le permita
> participar.** Nosotros no tenemos que crear la demanda. Tenemos que darle una puerta.

**Nota de defensa:** las estimaciones de gaming Web3 varían muchísimo según la definición
(de 33 a 279 mil M). Elegí a propósito la más conservadora. Si un juez tira otro número, la
respuesta es exactamente esa.

---

# SLIDE 6 · Modelo de negocio — 20s

**En pantalla**
```
FASE 1 — HOY
16 licencias de creador   Las bolitas «especiales» hospedan carreras,
                          cobran su corte y llevan estadísticas propias.
                          Se venden o licencian a streamers y creadores.
Contenido                 La carrera es el contenido; el contenido es el canal.

FASE 2 — «APOSTÁ LO QUE GANASTE»
El MRBL que acumulaste entra a las apuestas de la carrera
física semanal de las 16 bolitas reales. La casa toma un corte chico.

        SIN DEPÓSITO. SIN ON-RAMP.
        Apostás lo que ganaste jugando, no lo que sacaste del bolsillo.
```

**Decís (20s)**
> Fase uno: las dieciséis bolitas especiales son licencias de creador. Hospedan carreras, cobran su
> corte, tienen estadísticas propias — un streamer compra una y corre carreras para su audiencia.
> Fase dos es donde esto se pone interesante: el crédito que ganaste jugando puede entrar a las
> apuestas de la carrera física semanal. **Sin depósito, sin on-ramp — apostás lo que ganaste
> jugando, no lo que sacaste del bolsillo.** Eso no existe en ningún lado.

**Barandas — no romper**
- **No** digas que la quema hace deflacionario al token. A la tasa de emisión actual haría falta el
  orden de ~280 carreras por día. Decí **"cada carrera quema el 10% del pot"** y nada más.
- **No** presentes el corte de las carreras digitales como ingreso de Fase 1: hoy va al *host* y
  está denominado en un token sin valor de mercado. Es ingreso cuando MRBL tiene mercado.
- El mint público **es gratis**. Lo que se vende son **las 16 especiales**. Si decís "venta de NFTs"
  a secas, la repregunta es "¿cuáles, si son gratis?".

---

# SLIDE 7 · Competencia / por qué nosotros — 20s

**En pantalla** — tres columnas, la nuestra iluminada

```
                        AUDIENCIA   PARTICIPACIÓN   RESULTADO
                        PROBADA     REAL            VERIFICABLE

Contenido de bolitas       ✓             ✗                ✗
(YouTube, TV)

Juegos de azar onchain     ✗             ✓                ✓
                                                    (pero es timba)

Apuestas web2              ✓             ✓                ✗
                                                    (confiás en la casa)

MARBLESS                   ✓             ✓                ✓
```

**Decís (20s)**
> El contenido de bolitas tiene la audiencia pero no te deja jugar. Los juegos de azar onchain te
> dejan jugar y son verificables, pero son timba pura — no tienen historia ni audiencia. Y las
> apuestas web2 tienen las dos cosas, pero le tenés que creer a la casa.
> **Somos el único que tiene los tres.** Y el crédito se gana jugando: no es un casino con otra cara.

**Nota:** decisión del owner — **Zed Run no va en la slide**, se contesta en Q&A si aparece.
La respuesta está preparada abajo.

---

# SLIDE 8 · Equipo — 10s

**En pantalla**
```
ARTURITO LABS

[NOMBRE]                        Emanuel Olivera
Fundador · Contratos y producto  Diseño
4 contratos en Sepolia,          Licenciado en Diseño de
verificados · 76/76 tests        Comunicación Visual
```

**Decís (10s)**
> Somos dos. Yo hice los contratos y el producto: cuatro contratos vivos y verificados en Sepolia,
> setenta y seis tests en verde. Emanuel es Licenciado en Diseño de Comunicación Visual y hace todo
> lo que están viendo en pantalla.

**⚠️ COMPLETAR:** falta tu línea de credencial. Lo de arriba es un borrador armado con lo que hay;
cambialo por lo que quieras decir de vos (ETH DevConnect, background técnico, lo que sea).

---

# SLIDE 9 · Roadmap + cierre — 10s · **queda en pantalla durante el Q&A**

**En pantalla**
```
MARBLESS

AHORA          Loop completo probadamente justo, vivo en Sepolia
PRÓXIMO        UI de carrera + primeras carreras con público real
FASE 2         Carrera física semanal transmitida · las 16 bolitas
               reales espejadas onchain · apuestas «apostá lo que ganaste»

Convertimos un fenómeno pasivo en un juego que se posee,
se juega y se puede probar.

[QR a la dApp]     MarbleRace  0x48C6…2215      arturitolabs / @MF_CAPS
                   Sepolia · verificado
```

**Decís (10s)**
> Hoy el loop completo está vivo y verificado en Sepolia. Lo próximo son las primeras carreras con
> público real. Y la fase dos es la carrera física semanal transmitida, con las dieciséis bolitas
> reales espejadas onchain.
> **Convertimos un fenómeno pasivo en un juego que se posee, se juega y se puede probar.** Gracias.

**Táctica:** el QR queda proyectado los 2 minutos del Q&A. Es la única chance de que un juez saque
el celular y mintee. Que ande.

---

# Q&A — 2 minutos, jurado de producto y plata

### "¿Cuántos usuarios tienen?" — **la más probable. No la esquives.**
> Cero usuarios externos hoy, y te digo por qué con precisión: en el buildathon tuvimos gente
> haciendo fila para probarlo y **no llegamos con el QR pronto**. Ese fue nuestro error de
> ejecución y es exactamente la primera línea del roadmap. Lo que sí tenemos es el producto
> funcionando: cuatro contratos verificados y una carrera real de ocho jugadores liquidada onchain.

*Nunca digas un número de wallets. `nextId = 26`: son 9 bolitas y son todas nuestras.*

### "¿Cómo ganan plata?"
> Fase uno, las dieciséis especiales son licencias de creador — un streamer compra una y hospeda
> carreras para su audiencia, con estadísticas propias. Fase dos, la casa toma un corte chico de las
> apuestas de la carrera física, y ahí el token pasa de crédito de arcade a tener mercado.

### "¿Esto no es timba?"
> Hoy no: jugás con crédito que ganaste teniendo una bolita, es circuito cerrado y no tiene valor en
> efectivo. Fichas de arcade, no de casino. En fase dos sí hay apuestas — y ahí está nuestra
> diferencia: **apostás lo que ganaste jugando, no lo que depositaste.** Sin on-ramp de fiat, nadie
> pone plata que no ganó adentro del juego. Y las probabilidades y los pagos están onchain,
> auditables — que es más de lo que ofrece cualquier casa de apuestas.

### "¿Y Zed Run? Eso murió."
> Zed Run era pay-to-play con plata real y un resultado que le tenías que creer al operador. Nosotros
> somos lo inverso en las dos cosas: jugás con crédito que ganaste, no con plata que depositaste, y
> el resultado lo firma Chainlink VRF — cualquiera lo recomputa desde el `randomWord` público y le
> tiene que dar el mismo podio. Nosotros ya lo hicimos: ocho de ocho. Zed Run no podía hacer eso.

### "¿Por qué blockchain y no una base de datos?"
> Una base de datos corre el juego, pero no la confianza. Propiedad real, aleatoriedad verificable y
> pagos auditables necesitan un libro público que nadie pueda editar en silencio. Sacá eso y es otro
> juego más donde confiás en el operador — justo lo que estamos eliminando.

### "¿Qué te impide a vos hacer trampa?"
> La aleatoriedad no es mía: la genera Chainlink VRF con prueba verificable. Los porcentajes de pago
> están fijos en el contrato. La custodia es un contrato, no mi wallet. Y el sorteo lo dispara el
> callback de Chainlink, no yo: no puedo frenar ni torcer una carrera que no me gusta.

### "¿El token es un security?"
> Hoy no puede serlo: no se compra, no se vende, no tiene mercado y no tiene valor en efectivo. Se
> gana solo teniendo una bolita. Fue una decisión de diseño, no una omisión. Cuando abramos mercado
> en fase dos, es el momento de sentarse con un abogado — y lo sabemos.

### "¿Cuánto cuesta operar esto?"
> El deploy del contrato de carreras costó 0,003 ETH y una carrera completa de 44 transacciones
> ~0,04 ETH en testnet. VRF v2.5 lo pagamos en ETH nativo, sin dependencia de LINK.

### "¿Por qué no hay UI de carrera todavía?"
> Prioricé que la parte que no se puede fingir estuviera bien: los contratos, la aleatoriedad y los
> pagos. La carrera ya se liquida correctamente onchain — la UI es la capa que falta y es la que
> menos riesgo tiene. Preferí llegar con la justicia probada y la pantalla a medias que al revés.

### Si preguntan por el premio de sponsor
> Ganamos el premio de **Zenda Cash** en el buildathon. *(Opcional — es chico. Decilo solo si suma.)*

---

## Checklist para mañana

- [ ] ARCTURITO → **ARTURITO** en la portada
- [ ] Borrar las 2 menciones de "onboardeamos wallets con QR"
- [ ] Sacar Three.js del stack
- [ ] B-roll de fondo en slide 2 + atribución "footage: Jelle's Marble Runs"
- [ ] 1,45 M → **1,5 M**
- [ ] Correcciones de ortografía (que/qué, pool de tokens)
- [ ] Completar tu línea de credencial en la slide 8
- [ ] Sacar el link de la tx de `settle` en Etherscan → QR de la slide 4
- [ ] Probar el QR de la slide 9 con un celular que no sea el tuyo
- [ ] Cronometrar en voz alta 3 veces. Si pasás de 3:00, se corta la slide 5, no la 4
- [ ] Cargar la suscripción de VRF por si hay demo en vivo
