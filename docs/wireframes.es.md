# Marble Race — Wireframes / Flujo de Pantallas

> Entregable del hackathon (**Design — wireframes/mockups**) para Ethereum Uruguay 2026 · Track General.
> Baja fidelidad, a propósito: define la arquitectura de información y la acción on-chain de cada
> pantalla. La **vista de carrera** ya tiene un mockup funcional en `docs/prototype/index.html`.

---

## Flujo

```
[Mint/Home] → [Mi Wallet] → [Lobby] → [Carrera] → [Resultados]
     ▲                                                   │
     └───────────────── volver a jugar ──────────────────┘
```

Cada pantalla tiene **una** acción on-chain principal, para no marear al recién llegado.

---

## 1. Home / Mint  ·  acción: `mint()`

```
┌───────────────────────────────────────────┐
│  MARBLE RACE            [Conectar wallet]  │
│                                            │
│      🔵  Consigue tu bolita, gratis        │
│      ┌───────────────────────────┐         │
│      │     [ MINTEAR BOLITA ]    │         │
│      └───────────────────────────┘         │
│      1 bolita pública por wallet            │
│                                            │
│  ¿Qué es esto? · Verificable en Etherscan   │
└───────────────────────────────────────────┘
```
Punto de entrada del QR del evento. Tras mintear, muestra la bolita con su `tokenId` y ofrece "ir a
mi wallet".

## 2. Mi Wallet  ·  acción: `claim()`

```
┌───────────────────────────────────────────┐
│  Mi bolita  #37   🟣                        │
│  Crédito acumulado:  138 MRBL               │
│      ┌───────────────────────────┐         │
│      │     [ RECLAMAR MRBL ]     │         │
│      └───────────────────────────┘         │
│  Balance: 0 MRBL → 138 MRBL                 │
│  [ Ir al lobby de carreras → ]              │
└───────────────────────────────────────────┘
```

## 3. Lobby de carreras  ·  acción: `join()`

```
┌───────────────────────────────────────────┐
│  Carreras abiertas          (una por especial) │
│  ┌─────────────┐  ┌─────────────┐          │
│  │ Pool #3     │  │ Pool #9     │   ...     │
│  │ entrada 100 │  │ entrada 100 │          │
│  │ 6/16 dentro │  │ 12/16 dentro│          │
│  │ [ ENTRAR ]  │  │ [ ENTRAR ]  │          │
│  └─────────────┘  └─────────────┘          │
└───────────────────────────────────────────┘
```
Al entrar: depositás la entrada y quedás en el pool (**una sola acción**). Estado visible: Abierto /
Sorteando / Settleado.

## 4. Vista de carrera  ·  acción: entrar → esperar VRF → animación

```
┌───────────────────────────────────────────┐
│  Pool #3   ·   estado: SORTEANDO (Chainlink)│
│  ┌───────────────────────────────────────┐ │
│  │        (render 3D de la carrera)       │ │
│  │     🔵🟣🟢🟡  bolitas en el circuito    │ │
│  └───────────────────────────────────────┘ │
│  Obteniendo aleatoriedad de Chainlink…      │
│                        cámara: [mapa|follow]│
│  Al llegar el callback: arranca la animación.│
└───────────────────────────────────────────┘
```
Mockup funcional del render: `docs/prototype/index.html`. La animación *llega* al orden on-chain
(ver `graphics-integration.es.md`). El estado "sorteando" mientras se espera el callback de VRF es,
además, una oportunidad de mostrar la justicia en vivo.

## 5. Resultados  ·  acción: `withdraw()`

```
┌───────────────────────────────────────────┐
│  🏁 Resultado — Pool #3                     │
│  🥇 #37   +350 MRBL                         │
│  🥈 #12   +125 MRBL                         │
│  🥉 #48   +12.5 MRBL                         │
│      ┌───────────────────────────┐         │
│      │     [ COBRAR PREMIO ]     │         │
│      └───────────────────────────┘         │
│  [ 🔗 Verificar en Etherscan ]              │
│  [ Volver a jugar → ]                       │
└───────────────────────────────────────────┘
```
El link a Etherscan es clave: cierra la promesa de "probadamente justo".

---

## Notas de UX (del playbook de frontend)

- Cada botón on-chain: estados `idle → firmando → pendiente → confirmado`, nunca se cuelga mudo.
- Mostrar siempre el `tokenId` y el color de la bolita para identidad.
- El recién llegado no debería necesitar saber qué es una wallet para entender la pantalla.
- Con VRF, todas las bolitas que entran terminan; no hay abandonos que dibujar.
