# Marble Race — Modelo de Datos y Especificación de Contratos

> Entregable del hackathon (**Modelo de datos**) para Ethereum Uruguay 2026 · Track General.
> Este documento funciona además como la especificación de implementación de `MarbleRace`, el
> contrato que se construye durante el evento.

**Linaje:** el pool de carrera es un mercado de predicción con forma de carrera. Su diseño aplica
dos desafíos de Speedrun Ethereum — **Challenge 08 (Mercados de Predicción)**: pagos tipo *pull* en
lugar de `transfer()`, un camino de reembolso explícito y cero fees varados; y
**Challenge 10 (Multisig)**: custodia en manos del contrato con una frontera de autorización y
compromisos (*commitments*) protegidos contra *replay*.

---

## 0. Vista general del sistema

Cuatro contratos. El orden de despliegue es el orden de dependencias, así que no hacen falta
transacciones de cableado posteriores al deploy.

| # | Contrato | Rol | Estado |
|---|---|---|---|
| 1 | `MarbleVault` | "La casa es un contrato que posee sus propias bolitas." Guarda las 16 especiales y sus emisiones. | ✅ Construido, 13 tests |
| 2 | `MarbleNFT` | 256 bolitas. Ids 1–16 especiales (en la bóveda), 17–256 públicas de minteo gratuito, 1 pública por wallet. | ✅ Construido, 9 tests |
| 3 | `MarbleToken` | `MRBL`, crédito de arcade de circuito cerrado. El único camino de minteo es reclamar emisiones. Quemable. | ✅ Construido, 5 tests |
| 4 | `MarbleRace` | Pools de carrera: entrar + *commit* → *reveal* → *settle* → cobros tipo *pull*. | ⬜ **Objetivo de construcción** |

Orden de deploy: `Vault → NFT(vault) → Token(nft) → Race(nft, token, vault)`.

---

## 1. Entidades y almacenamiento

### 1.1 MarbleNFT (construido)

| Campo | Tipo | Significado |
|---|---|---|
| `MAX_SUPPLY` | `uint256` const = 256 | Total de bolitas |
| `SPECIAL_COUNT` | `uint256` const = 16 | Ids 1–16 espejan el set físico |
| `nextId` | `uint256` | Próximo id público a mintear (arranca en 17) |
| `mintedAt[tokenId]` | `mapping → uint256` | Timestamp de minteo; la acumulación de emisiones arranca acá |
| `publicHoldings[addr]` | `mapping → uint256` | Impone 1 bolita pública por wallet, en minteo **y** en transferencia |

`isSpecial(id)` es un chequeo puro de rango (`1 <= id <= 16`) — sin flag en storage.

### 1.2 MarbleToken (construido)

| Campo | Tipo | Significado |
|---|---|---|
| `nft` | `MarbleNFT` immutable | Fuente de propiedad + timestamps de minteo |
| `ratePerDay` | `uint256` | Tasa de emisión por bolita (ajustable por el owner) |
| `lastClaim[tokenId]` | `mapping → uint256` | Checkpoint de acumulación; cae de vuelta a `mintedAt` |

La acumulación es continua: `claimable = (now - from) * ratePerDay / 1 days`. El acumulado sin
reclamar se transfiere junto con el NFT.

### 1.3 MarbleVault (construido)

| Campo | Tipo | Significado |
|---|---|---|
| `authorizedManager` | `address` | El `MarbleRace` actual. Cambiarlo = una tx `setManager`. |

Las direcciones de los activos son **parámetros de llamada, no storage** — por eso la bóveda puede
desplegarse primero. La suite de rescate solo-owner (`rescueSpecial`, `sweepTokens`) está testeada
contra un manager hostil.

### 1.4 MarbleRace (a construir)

```solidity
enum Status { Open, Locked, Settled, Cancelled }

struct Pool {
    uint16  specialId;      // 1..16 — la bolita especial que ancla este pool (identidad del pool)
    uint128 entry;          // MRBL requerido por jugador. Igual al seed ("1X").
    uint128 seed;           // MRBL tomado de las emisiones de la especial; el piso de premio
    uint128 pot;            // seed + suma de las entradas recaudadas
    uint64  joinDeadline;   // después de esto: lock (si >= minPlayers) o cancel
    uint64  revealDeadline; // se fija al momento del lock
    Status  status;
    address creator;        // recibe el corte del creador
    uint16  playerCount;
    uint16  revealedCount;
    bytes32 raceSeed;       // se fija en el settlement; maneja la animación del frontend
}

struct Player {
    uint16  marbleId;   // la bolita pública que corre
    bytes32 commitment; // keccak256(abi.encode(secret, msg.sender, poolId))
    bool    revealed;
    bool    exists;
}

mapping(uint256 poolId => Pool)                        public pools;
mapping(uint256 poolId => mapping(address => Player))  public entrants;
mapping(uint256 poolId => address[])                   public roster;       // enumeración para el settlement
mapping(uint256 poolId => bytes32)                     internal entropyAcc; // acumulador (XOR/hash) de los reveals
mapping(address => uint256)                            public winnings;     // libro de pagos tipo pull
mapping(uint16 specialId => uint256 poolId)            public activePool;   // un pool vivo por especial
```

**Relaciones.** Un `Pool` está anclado a exactamente una bolita especial (≤16 pools simultáneos).
Una wallet posee ≤1 bolita pública, por lo tanto ≤1 entrada por pool. `winnings` es global entre
pools, así que un jugador retira una sola vez por todo lo que se le debe.

---

## 2. Máquina de estados

```
                    createPool (manager, sembrado desde la bóveda)
                                  │
                                  ▼
                            ┌──────────┐
              entrar+commit │   OPEN   │ ──── venció el plazo y count < minPlayers ───┐
              (≤ maxPlayers)└──────────┘                                              │
                                  │                                                   ▼
       count == maxPlayers (auto) │  O  venció el plazo y count >= minPlayers    ┌───────────┐
                                  ▼      (poke permisionless startRace)          │ CANCELLED │
                            ┌──────────┐                                         └───────────┘
                     reveal │  LOCKED  │                                          solo reembolsos
                            └──────────┘
                                  │ venció revealDeadline (settle permisionless)
                                  ▼
                            ┌──────────┐
                            │ SETTLED  │  → se acreditan las ganancias, retiros tipo pull
                            └──────────┘
```

| Desde | Hacia | Disparador | Guarda |
|---|---|---|---|
| — | Open | `createPool(specialId, seed)` | el que llama es el manager; no hay pool activo para esa especial |
| Open | Open | `join(poolId, marbleId, commitment)` | estado Open, antes de `joinDeadline`, el que llama posee una bolita **pública**, no entró todavía, `playerCount < maxPlayers` |
| Open | Locked | `join` llenando el último lugar | `playerCount == maxPlayers` — **atómico**, misma tx |
| Open | Locked | `startRace(poolId)` | pasado `joinDeadline`, `playerCount >= minPlayers`. Permisionless; el que llama gana la recompensa del poke |
| Open | Cancelled | `cancel(poolId)` | pasado `joinDeadline`, `playerCount < minPlayers`. Permisionless |
| Locked | Locked | `reveal(poolId, secret)` | estado Locked, antes de `revealDeadline`, el commitment coincide |
| Locked | Settled | `settle(poolId)` | pasado `revealDeadline`. Permisionless |

Todo lo posterior a la ventana de inscripción es **permisionless** — ningún operador puede frenar
una carrera.

---

## 3. Ciclo de vida de una carrera

1. **Sembrar (seed).** El manager toma las emisiones acumuladas de una bolita especial desde la
   bóveda (`vault.transferToken`) y abre un pool. Ese monto es a la vez el piso de premio y el
   tamaño de la entrada — cada jugador iguala a la casa en "1X".
2. **Entrar + commit (Open).** Quien posee una bolita pública deposita `entry` MRBL y envía
   `commitment = keccak256(abi.encode(secret, msg.sender, poolId))`. Atar el sender y el id del pool
   dentro del hash evita que se repita (*replay*) el commitment de otro jugador (la lección de replay
   del Challenge 10).
3. **Lock.** Llenar el último lugar hace lock atómicamente en la misma transacción. Si no, una vez
   que vence el plazo de inscripción con al menos `minPlayers`, cualquiera puede hacer *poke* a
   `startRace` y cobrar una recompensa.
4. **Reveal (Locked).** Cada jugador revela su `secret`. El contrato lo verifica contra el commitment
   y lo mezcla en `entropyAcc`. Los jugadores que nunca revelan quedan **excluidos del podio y
   pierden su entrada, que queda en el pot** — la entrada funciona como depósito anti-griefing.
5. **Settle.** `raceSeed = keccak256(abi.encode(entropyAcc, block.prevrandao, poolId))`. Un shuffle
   Fisher–Yates sobre el roster que reveló, manejado por `raceSeed`, produce el orden de llegada.
   Cada bolita que reveló tiene igual probabilidad de ganar. Se emiten el podio y el orden completo.
6. **Cobrar (claim).** Los pagos se acreditan en `winnings` y el jugador los retira. Nunca se empuja
   nada (la lección del `transfer()` del Challenge 08).
7. **Cancelar.** Por debajo de `minPlayers` al vencimiento, a cada jugador se le acredita el
   **reembolso completo** de su entrada y el seed vuelve a la bóveda. Ningún fondo queda varado.

**Contrato con el frontend.** La animación es coreografía, nunca física. Lee el `raceSeed` emitido y
el orden de llegada, y reproduce el circuito fijo de Seedance con la bolita de cada participante
coloreada por su id de NFT, usando `keccak(raceSeed, obstacleId)` para derivar el timing por
obstáculo. El mismo circuito en cada carrera; el *resultado* es el que decidió la cadena. El podio en
pantalla siempre debe igualar al podio on-chain.

---

## 4. Matemática de pagos

Porcentajes del **pot total** (`seed + todas las entradas`, incluyendo las entradas perdidas):

| Destinatario | Porción |
|---|---|
| 1º | 50.0% |
| 2º | 25.0% |
| 3º | 12.5% |
| Quemado (sink de circuito cerrado) | 10.0% |
| Creador del pool | 2.5% |

Ejemplo trabajado — seed 100 MRBL, 8 jugadores a 100 cada uno → pot = 900 MRBL:

| Destinatario | MRBL | Neto para el jugador (puso 100) |
|---|---|---|
| 1º | 450 | +350 |
| 2º | 225 | +125 |
| 3º | 112.5 | +12.5 |
| Quema | 90 | — |
| Creador | 22.5 | — |

La casa siembra cada pool con emisiones de las bolitas especiales, así que las especiales (6.25% del
supply) financian todo el piso de premio. La quema del 10% es el sink que evita que el circuito
cerrado infle.

La división entera trunca; cualquier remanente en wei se suma a la quema para que el pot siempre
reconcilie a cero. **Cero fees varados** — la primera trampa del Challenge 08.

---

## 5. Aleatoriedad y justicia

**Modelo de amenaza.** La aleatoriedad no puede ser predecible ni orientable unilateralmente por
ningún jugador, el creador del pool, ni el que hace el settlement.

- **Commit–reveal** impide que un jugador elija su entropía después de ver la de los demás.
- **`block.prevrandao`** se mezcla para que el resultado no quede fijado al momento del reveal.
- **La entrada como depósito** es la palanca anti-griefing: el único ataque que queda es un jugador
  al que no le gusta el seed emergente y retiene su reveal, y hacerlo le cuesta perder toda su
  entrada además de sacarlo del podio.

**Limitación honesta (decirla en el pitch, no esconderla).** El validador que propone el bloque del
settlement tiene influencia limitada sobre `prevrandao`, y el último en revelar tiene un bit de
elección: revelar o no. Para un arcade en testnet con crédito de circuito cerrado y sin valor en
efectivo, este es un trade-off aceptable y estándar. **Chainlink VRF es el upgrade drop-in
documentado** para mainnet o cualquier deploy con valor real: se reemplaza la derivación del seed del
paso 5, y todo lo demás queda intacto.

Decir esto claramente es una fortaleza frente a los jueces: muestra que el modelo de amenaza se pensó
de verdad, en lugar de barrerlo bajo la alfombra.

---

## 6. Parámetros ajustables por el owner

Toda constante económica es ajustable; ninguna está hardcodeada en la lógica.

| Parámetro | Default | Por qué es ajustable |
|---|---|---|
| `minPlayers` | 8 | **Bajarlo para el demo en vivo** para que una carrera pueda correr con pocas wallets |
| `maxPlayers` | 16 | Espeja el set físico de 16 bolitas |
| `joinWindow` | 24h | Acortarlo drásticamente para el demo |
| `revealWindow` | 1h | Acortarlo drásticamente para el demo |
| `pokeBounty` | MRBL chico | Le paga al que llama `startRace` (permisionless); puede ser 0 |
| `ratePerDay` (token) | 10e18 | Tasa de emisión por bolita |

---

## 7. Eventos

```solidity
event PoolCreated(uint256 indexed poolId, uint16 indexed specialId, uint128 seed, uint128 entry, uint64 joinDeadline);
event Joined(uint256 indexed poolId, address indexed player, uint16 indexed marbleId);
event Locked(uint256 indexed poolId, uint64 revealDeadline);
event Revealed(uint256 indexed poolId, address indexed player);
event Settled(uint256 indexed poolId, bytes32 raceSeed, uint16[] finishingOrder);
event Cancelled(uint256 indexed poolId);
event Withdrawn(address indexed player, uint256 amount);
```

`Settled` es el disparador de la animación del frontend: lleva el seed y el orden autoritativo.

---

## 8. Decisiones ratificadas

Estaban marcadas como "decidir al momento de codear" en la spec original. Ratificadas 2026-07-21.

1. **El seed va adentro del pot** (piso de premio) en lugar de solo definir el tamaño de la entrada.
   Hace atractivo entrar (ganás 4.5× tu apuesta con 8 jugadores) y le da a las especiales un trabajo
   económico real.
2. **El cancel devuelve el seed a la bóveda; no se quema.** Un cancel significa que el pool no se
   llenó, que es la condición de arranque en frío. Quemar el seed ahí vacía la tesorería justo cuando
   el proyecto está más frágil — menos seeds, pisos de premio más chicos, menos razón para entrar,
   más cancels. La deflación va en el camino de *settle*, donde está atada a actividad real. Ver §10
   para el equilibrio de supply que esto implica.
3. **El corte del creador va al proyecto/bóveda** porque en v1 los pools los crea el sistema.
   **Restricción de roadmap:** una vez que las especiales se distribuyan a dueños individuales, el
   pool anclado a la especial *N* debe pagar su corte de creador al dueño de *N*. El campo `creator`
   por pool existe justo para esto — no lo saques en el diseño.
4. **El orden de llegada completo se computa on-chain** (no solo el podio), para que la animación del
   frontend tenga un orden autoritativo al que llegar. Barato con ≤16 participantes, y la pantalla
   nunca puede diferir de la cadena.
5. **`minPlayers` es ajustable por el owner.** El reparto de pagos asume ≥3 que llegan, así que hace
   falta un piso. 8 es el default; tiene que ser ajustable por el drop-off del funnel el día del demo
   (ver §11).

---

## 9. Orden de construcción para el día del evento

Red-first, en esta secuencia. Cada paso es committeable por separado.

1. Creación del pool + sembrado desde la bóveda (camino del manager).
2. `join` con commitment + escrow de la entrada; guardas de elegibilidad de wallet/bolita.
3. Caminos de lock: llenado atómico, y el poke permisionless por vencimiento.
4. **Cancel + reembolsos antes del camino feliz** — disciplina de rescate-primero, como con la bóveda.
5. `reveal` con verificación de commitment y contabilidad de los que no revelan.
6. `settle`: derivación del seed, shuffle, acreditación de pagos, quema.
7. `withdraw`, pagos tipo pull.
8. Deploy en Sepolia + smoke test con `cast` de toda la columna vertebral.

---

## 10. Supply del token y equilibrio

`MRBL` tiene exactamente un camino de minteo (emisiones) y un sink sistemático (la quema de la
carrera al settlear).

**Emisión.** Cada bolita minteada acumula de forma continua. Con la tasa default de 10 MRBL/día y las
256 bolitas minteadas, la emisión es de **2.560 MRBL/día**, sin techo y lineal. Las 16 especiales
representan 160 MRBL/día — todo el presupuesto de sembrado de pools (6.25% del supply, por diseño).

**Sink.** Una carrera al settlear quema el 10% del pot. Para un pot de seed 100 + 8 jugadores × 100 =
900 MRBL, eso es 90 MRBL quemados por carrera.

**Equilibrio.** Mantener el supply plano requiere `2.560 / 90 ≈ 28 carreras settleadas por día`.
Entre 16 pools simultáneos eso es **~1,8 ciclos de carrera por pool por día** — alcanzable con
ventanas de inscripción cortas, no un número teórico.

**Palancas si se quiere una historia deflacionaria más fuerte** (en orden de honestidad y efecto):

1. Subir la quema del settle por encima del 10% — escala con actividad real.
2. Decaimiento o halving de la emisión en el tiempo — el arreglo estructural de fondo al supply
   lineal sin techo.
3. Sinks de quema adicionales atados a acciones deseables (crear pool, cosméticos, re-entrada).

Deliberadamente *no* es una palanca: quemar en el cancel. Ver §8.2.

---

## 11. Runbook del día del evento (onboarding en vivo por QR)

El flujo previsto en el venue es: compartir el QR de minteo → los asistentes mintean una bolita →
los asistentes entran a una carrera → la carrera settlea en vivo. Hay una trampa de funnel acá que
hay que manejar.

**La trampa.** Las emisiones acumulan *desde el timestamp de minteo*. Una bolita minteada hace dos
minutos acumuló ≈0,03 MRBL, mientras que la entrada cuesta 100. **Una bolita recién minteada no
puede pagar para entrar.**

**El arreglo — sin cambios de contrato.** `ratePerDay` es ajustable por el owner y aplica de forma
retroactiva al tiempo no reclamado. Subirla hace que las bolitas frescas sean financiables al toque:
a 100.000 MRBL/día, una bolita minteada hace dos minutos vale ~138 MRBL.

**El orden de las operaciones importa:**

1. **Reclamar primero las emisiones de las 16 especiales**, a la tasa baja. Esto fija el checkpoint
   `lastClaim` y evita que días de tiempo no reclamado de las especiales se multipliquen por la tasa
   del demo.
2. **Después** subir `ratePerDay` al valor del demo.
3. Fijar `entry`/`seed` a algo que una bolita de 2 minutos pueda pagar.
4. Acortar `joinWindow` y `revealWindow` a minutos.
5. Fijar `minPlayers` a la asistencia real, minutos antes de demostrar — mintear no es entrar, y
   reclamar más entrar son transacciones adicionales donde los asistentes se caen.

**Ensayar esta secuencia antes del venue.** Cada paso es una transacción del owner; ninguno requiere
redeploy.
