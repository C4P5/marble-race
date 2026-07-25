# Marble Race — Modelo de Datos y Especificación de Contratos

> Entregable del hackathon (**Modelo de datos**) para Ethereum Uruguay 2026 · Track General.
> Este documento funciona además como la especificación de implementación de `MarbleRace`, el
> contrato que se construye durante el evento.

**Linaje:** el pool de carrera es un mercado de predicción con forma de carrera. Su diseño aplica
dos desafíos de Speedrun Ethereum — **Challenge 08 (Mercados de Predicción)**: pagos tipo *pull* en
lugar de `transfer()`, un camino de reembolso explícito y cero fees varados; y
**Challenge 10 (Multisig)**: custodia en manos del contrato con una frontera de autorización (la
bóveda). La aleatoriedad la provee **Chainlink VRF v2.5** — aleatoriedad verificable on-chain.

---

## 0. Vista general del sistema

Cuatro contratos. El orden de despliegue es el orden de dependencias, así que no hacen falta
transacciones de cableado posteriores al deploy.

| # | Contrato | Rol | Estado |
|---|---|---|---|
| 1 | `MarbleVault` | "La casa es un contrato que posee sus propias bolitas." Guarda las 16 especiales y sus emisiones. | ✅ Construido, 13 tests |
| 2 | `MarbleNFT` | 256 bolitas. Ids 1–16 especiales (en la bóveda), 17–256 públicas de minteo gratuito, 1 pública por wallet. | ✅ Construido, 9 tests |
| 3 | `MarbleToken` | `MRBL`, crédito de arcade de circuito cerrado. El único camino de minteo es reclamar emisiones. Quemable. | ✅ Construido, 5 tests |
| 4 | `MarbleRace` | Pools de carrera: entrar → sorteo por VRF → settle → cobros tipo *pull*. | ⬜ **Objetivo de construcción** |

Orden de deploy: `Vault → NFT(vault) → Token(nft) → Race(nft, token, vault, coordinatorVRF)`.

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

Hereda `VRFConsumerBaseV2Plus`. La aleatoriedad la pide al Coordinator de Chainlink y llega por
callback en un bloque posterior.

```solidity
enum Status { Open, Locked, Settled, Cancelled }
// Open    = aceptando jugadores
// Locked  = cerrado, se pidió aleatoriedad a VRF, esperando el callback
// Settled = VRF respondió, orden y pagos acreditados
// Cancelled = no se llenó, reembolsos

struct Pool {
    uint16  specialId;      // 1..16 — la bolita especial que ancla este pool (identidad del pool)
    uint128 entry;          // MRBL requerido por jugador. Igual al seed ("1X").
    uint128 seed;           // MRBL tomado de las emisiones de la especial; el piso de premio
    uint128 pot;            // seed + suma de las entradas
    uint64  joinDeadline;   // después de esto: lock (si >= minPlayers) o cancel
    Status  status;
    address creator;        // recibe el corte del creador
    uint16  playerCount;
    bytes32 raceSeed;       // se fija en el callback de VRF; maneja la animación del frontend
}

// --- config VRF (inmutable / owner) ---
bytes32 keyHash;            // gas lane de Sepolia
uint256 subscriptionId;    // suscripción financiada con LINK
uint32  callbackGasLimit;
uint16  requestConfirmations;

mapping(uint256 poolId => Pool)                        public pools;
mapping(uint256 poolId => mapping(address => uint16))  public marbleOf;   // wallet → bolita en el pool
mapping(uint256 poolId => address[])                   public roster;     // enumeración para el settlement
mapping(uint256 requestId => uint256 poolId)          internal requestToPool; // VRF: request → pool
mapping(address => uint256)                            public winnings;   // libro de pagos tipo pull
mapping(uint16 specialId => uint256 poolId)            public activePool; // un pool vivo por especial
```

**Relaciones.** Un `Pool` está anclado a exactamente una bolita especial (≤16 pools simultáneos).
Una wallet posee ≤1 bolita pública, por lo tanto ≤1 entrada por pool. `winnings` es global entre
pools, así que un jugador retira una sola vez por todo lo que se le debe.

**Ya no hay** commitments, reveals ni depósito de slashing: VRF elimina toda esa maquinaria. El que
entra hace **una sola acción** (entrar); no vuelve a firmar nada.

---

## 2. Máquina de estados

```
                    createPool (manager, sembrado desde la bóveda)
                                  │
                                  ▼
                            ┌──────────┐
                     entrar │   OPEN   │ ──── venció el plazo y count < minPlayers ───┐
              (≤ maxPlayers)└──────────┘                                              │
                                  │                                                   ▼
       count == maxPlayers (auto) │  O  venció el plazo y count >= minPlayers    ┌───────────┐
       → requestRandomWords()     ▼      (poke permisionless startRace)          │ CANCELLED │
                            ┌──────────┐  → requestRandomWords()                 └───────────┘
      (esperando a Chainlink)│  LOCKED  │                                         solo reembolsos
                            └──────────┘
                                  │ fulfillRandomWords() ← el Coordinator de VRF
                                  ▼
                            ┌──────────┐
                            │ SETTLED  │  → orden, ganancias acreditadas, retiros tipo pull
                            └──────────┘
```

| Desde | Hacia | Disparador | Guarda |
|---|---|---|---|
| — | Open | `createPool(specialId, seed)` | el que llama es el manager; no hay pool activo para esa especial |
| Open | Open | `join(poolId, marbleId)` | estado Open, antes de `joinDeadline`, el que llama posee una bolita **pública**, no entró todavía, `playerCount < maxPlayers` |
| Open | Locked | `join` llenando el último lugar → `requestRandomWords` | `playerCount == maxPlayers` — **atómico**, misma tx |
| Open | Locked | `startRace(poolId)` → `requestRandomWords` | pasado `joinDeadline`, `playerCount >= minPlayers`. Permisionless; el que llama gana la recompensa del poke |
| Open | Cancelled | `cancel(poolId)` | pasado `joinDeadline`, `playerCount < minPlayers`. Permisionless |
| Locked | Settled | `fulfillRandomWords(requestId, randomWords)` | **solo** el Coordinator de VRF; el `requestId` mapea al pool |

El cierre de inscripción y el sorteo son a prueba de operador: nadie puede orientar el resultado ni
frenar una carrera; el settlement lo dispara el callback de Chainlink.

---

## 3. Ciclo de vida de una carrera

1. **Sembrar (seed).** El manager toma las emisiones acumuladas de una bolita especial desde la
   bóveda (`vault.transferToken`) y abre un pool. Ese monto es a la vez el piso de premio y el
   tamaño de la entrada — cada jugador iguala a la casa en "1X".
2. **Entrar (Open).** Quien posee una bolita pública deposita `entry` MRBL y entra con su `marbleId`.
   **Una sola transacción, sin commitment.**
3. **Lock + pedido de aleatoriedad.** Llenar el último lugar hace lock atómicamente en la misma
   transacción. Si no, una vez vencido el plazo con al menos `minPlayers`, cualquiera hace *poke* a
   `startRace` (y cobra una recompensa). Al hacer lock, el contrato llama
   `requestRandomWords()` a Chainlink y guarda `requestToPool[requestId] = poolId`.
4. **Settle (callback de VRF).** Chainlink llama `fulfillRandomWords(requestId, randomWords)`. El
   contrato deriva `raceSeed = keccak256(abi.encode(randomWords[0], poolId))`, hace un shuffle
   Fisher–Yates sobre el roster (cada bolita con igual probabilidad), acredita los pagos y emite el
   orden. Todo pasa dentro del callback.
5. **Cobrar (claim).** Los pagos se acreditan en `winnings` y el jugador los retira. Nunca se empuja
   nada (la lección del `transfer()` del Challenge 08).
6. **Cancelar.** Por debajo de `minPlayers` al vencimiento, a cada jugador se le acredita el
   **reembolso completo** de su entrada y el seed vuelve a la bóveda. Ningún fondo queda varado.
7. **Salvaguarda.** Si el callback de VRF no llegara (subscripción sin LINK, etc.), el owner puede
   re-pedir la aleatoriedad para un pool `Locked` — nunca fijar el resultado a mano.

**Contrato con el frontend.** La animación es coreografía, nunca física. Lee el `raceSeed` emitido y
el orden de llegada, y reproduce el circuito fijo con la bolita de cada participante coloreada por su
id de NFT, usando `keccak(raceSeed, obstacleId)` para derivar el timing por obstáculo. El mismo
circuito en cada carrera; el *resultado* es el que decidió la cadena. El podio en pantalla siempre
debe igualar al podio on-chain.

---

## 4. Matemática de pagos

Porcentajes del **pot total** (`seed + todas las entradas`):

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
cerrado infle. La división entera trunca; cualquier remanente en wei se suma a la quema para que el
pot siempre reconcilie a cero. **Cero fees varados** — la primera trampa del Challenge 08.

---

## 5. Aleatoriedad y justicia — Chainlink VRF v2.5

**Modelo de amenaza.** La aleatoriedad no puede ser predecible ni orientable por ningún jugador, el
creador del pool, ni el operador.

**La solución:** cuando el pool cierra, el contrato pide un número aleatorio a **Chainlink VRF**.
Chainlink responde por callback con el número **y una prueba criptográfica** de que se generó
correctamente y no fue manipulado. El `raceSeed` sale de ahí. Ni nosotros, ni un jugador, ni el
validador del bloque pueden predecir ni torcer el resultado.

Esto es un salto sobre el esquema anterior (commit-reveal + prevrandao), que tenía dos límites
honestos — la influencia marginal del proposer sobre `prevrandao` y el bit de "revelar o no" del
último jugador. Con VRF esos límites desaparecen: es el estándar de la industria para aleatoriedad
verificable on-chain.

**Consideraciones operativas** (no de seguridad):

- El settlement es **asíncrono**: llega por callback un puñado de bloques después del lock (~30–60 s
  en Sepolia). El frontend lo muestra como "obteniendo aleatoriedad verificable de Chainlink…" — y de
  paso *demuestra* el mecanismo de justicia en vivo.
- La **suscripción de VRF necesita LINK.** Hay que financiarla y agregar el contrato como consumer.
  Ver §11 (runbook del evento).

---

## 6. Parámetros ajustables por el owner

Toda constante económica es ajustable; ninguna está hardcodeada en la lógica.

| Parámetro | Default | Por qué es ajustable |
|---|---|---|
| `minPlayers` | 8 | **Bajarlo para el demo en vivo** para que una carrera pueda correr con pocas wallets |
| `maxPlayers` | 16 | Espeja el set físico de 16 bolitas |
| `joinWindow` | 24h | Acortarlo drásticamente para el demo |
| `pokeBounty` | MRBL chico | Le paga al que llama `startRace` (permisionless); puede ser 0 |
| `ratePerDay` (token) | 10e18 | Tasa de emisión por bolita |
| `callbackGasLimit` / `requestConfirmations` | según red | Config de VRF; ajustable por el owner |

---

## 7. Eventos

```solidity
event PoolCreated(uint256 indexed poolId, uint16 indexed specialId, uint128 seed, uint128 entry, uint64 joinDeadline);
event Joined(uint256 indexed poolId, address indexed player, uint16 indexed marbleId);
event RandomnessRequested(uint256 indexed poolId, uint256 requestId);
event Settled(uint256 indexed poolId, bytes32 raceSeed, uint16[] finishingOrder);
event Cancelled(uint256 indexed poolId);
event Withdrawn(address indexed player, uint256 amount);
```

`Settled` es el disparador de la animación del frontend: lleva el seed y el orden autoritativo.

---

## 8. Decisiones ratificadas

Marcadas como "decidir al momento de codear" en la spec original. Última ratificación 2026-07-24.

1. **El seed va adentro del pot** (piso de premio). Hace atractivo entrar (ganás 4.5× tu apuesta con
   8 jugadores) y le da a las especiales un trabajo económico real.
2. **El cancel devuelve el seed a la bóveda; no se quema.** Un cancel significa que el pool no se
   llenó (arranque en frío); quemar ahí vacía la tesorería cuando el proyecto está más frágil. La
   deflación va en el camino de *settle*. Ver §10.
3. **El corte del creador va al proyecto/bóveda** en v1 (pools creados por el sistema).
   **Restricción de roadmap:** cuando las especiales tengan dueños individuales, el pool de la
   especial *N* paga su corte al dueño de *N*. El campo `creator` existe para eso.
4. **El orden de llegada completo se computa on-chain** para que la animación tenga un orden
   autoritativo al que llegar.
5. **`minPlayers` ajustable por el owner** (el reparto asume ≥3 que llegan; ver §11).
6. **Aleatoriedad: Chainlink VRF v2.5** (reemplaza commit-reveal, ratificado 2026-07-24). Sin
   sponsor que lo condicione, VRF es mejor aleatoriedad, elimina la fase de reveal (una sola acción
   para el jugador — clave para el onboarding por QR) y simplifica el contrato. Costo: dependencia
   externa asíncrona en el settle, mitigada con el video de respaldo del demo.

---

## 9. Orden de construcción para el día del evento

Red-first, en esta secuencia. Cada paso es committeable por separado.

1. Creación del pool + sembrado desde la bóveda (camino del manager).
2. `join` con escrow de la entrada; guardas de elegibilidad de wallet/bolita.
3. Caminos de lock: llenado atómico y poke permisionless por vencimiento → `requestRandomWords`.
4. **Cancel + reembolsos antes del camino feliz** — disciplina de rescate-primero, como con la bóveda.
5. `fulfillRandomWords`: derivación del seed, shuffle, acreditación de pagos, quema.
6. `withdraw`, pagos tipo pull.
7. Deploy en Sepolia + suscripción VRF (LINK + consumer) + smoke test con `cast` de toda la columna.

> **Nota de implementación:** el Coordinator de VRF v2.5, el `keyHash` (gas lane) y la dirección de
> LINK en Sepolia se toman de fuentes verificadas al momento de codear — **nunca hardcodear de
> memoria.**

---

## 10. Supply del token y equilibrio

`MRBL` tiene exactamente un camino de minteo (emisiones) y un sink sistemático (la quema al settlear).

**Emisión.** Con la tasa default de 10 MRBL/día y las 256 bolitas minteadas, la emisión es de
**2.560 MRBL/día**, sin techo y lineal. Las 16 especiales representan 160 MRBL/día — todo el
presupuesto de sembrado de pools (6.25% del supply).

**Sink.** Una carrera al settlear quema el 10% del pot (90 MRBL en el ejemplo de 900).

**Equilibrio.** Mantener el supply plano requiere `2.560 / 90 ≈ 28 carreras settleadas por día` —
entre 16 pools, **~1,8 ciclos por pool por día**. Alcanzable, no teórico.

**Palancas para más deflación** (en orden de honestidad): subir la quema del settle; decaimiento/
halving de la emisión; sinks extra por acciones deseables. *No* es palanca quemar en el cancel (§8.2).

---

## 11. Runbook del día del evento (onboarding en vivo por QR)

Flujo previsto: compartir el QR de minteo → los asistentes mintean → entran a una carrera → la
carrera settlea en vivo. Dos cosas a preparar.

**A) La trampa del funnel.** Las emisiones acumulan *desde el timestamp de minteo*. Una bolita
minteada hace dos minutos acumuló ≈0,03 MRBL, y la entrada cuesta 100. **Una bolita recién minteada
no puede pagar para entrar.** Arreglo sin cambios de contrato: `ratePerDay` es ajustable y
retroactivo; subirla hace las bolitas frescas financiables (a 100.000 MRBL/día, ~138 MRBL a los dos
minutos). Orden: **(1)** reclamar primero las emisiones de las 16 especiales a la tasa baja
(checkpoint), **(2)** subir `ratePerDay`, **(3)** fijar `entry`/`seed` accesibles, **(4)** acortar
`joinWindow`, **(5)** fijar `minPlayers` a la asistencia real minutos antes.

**B) VRF.** Antes del evento: **crear la suscripción de VRF, financiarla con LINK de Sepolia
(generoso), y agregar el `MarbleRace` desplegado como consumer.** En el demo, el settle espera el
callback (~30–60 s) — mostralo como "obteniendo aleatoriedad de Chainlink". Si LINK se agota, el
sorteo no llega: por eso, sobre-financiar y tener el video de respaldo.

**Ensayar todo esto contra Sepolia antes del venue.** Cada paso del funnel es una tx del owner;
ninguno requiere redeploy.
