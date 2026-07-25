# 🔵 Marble Race

> **Carreras de bolitas probadamente justas sobre Ethereum.**
> Ethereum Uruguay 2026 · Track General.

Las carreras de bolitas ya son un fenómeno de masas — Jelle's Marble Runs tiene 1,45 M de
suscriptores y ~200 M de vistas, pasó por HBO y ESPN. Pero esa audiencia es **100 % pasiva**: mirás,
pero no podés tener una bolita, competir con ella, ni probar que el resultado no se armó en la
edición. Marble Race le agrega las tres cosas que un video no puede: **propiedad, participación y
justicia demostrable** — y es una puerta de entrada de baja fricción a Ethereum, porque todo el mundo
ya entiende una carrera de bolitas.

---

## Cómo funciona — el loop

```
mintear bolita (NFT) → acumular crédito (MRBL) → entrar a una carrera
       → sorteo por Chainlink VRF → settle → cobrar el premio
```

Las 16 bolitas **especiales** siembran los premios desde sus emisiones. El ganador lo decide
**Chainlink VRF** (aleatoriedad verificable on-chain); la animación es una **reproducción
determinista** que *llega* a ese resultado — la pantalla nunca puede diferir de la cadena.

## Arquitectura

| Contrato | Rol |
|---|---|
| `MarbleNFT` | 256 bolitas. 1–16 especiales, 17–256 públicas (mint gratis, 1 por wallet). Arte **100 % on-chain** (SVG generado en `tokenURI`). |
| `MarbleToken` (MRBL) | Crédito de arcade de circuito cerrado. Se gana solo por emisión; quemable. |
| `MarbleVault` | "La casa es un contrato que posee sus propias bolitas." Custodia de las especiales + premios. |
| `MarbleRace` | Pools de carrera: entrar → VRF → settle → cobros tipo *pull*. |

**Justicia:** Chainlink VRF v2.5 (aleatoriedad) + coreografía determinista (animación).
**Linaje:** aplica Speedrun Ethereum **#08 (mercados de predicción)** y **#10 (multisig/custodia)**.

## Estado

| Pieza | Estado |
|---|---|
| Contratos Stage 1 (NFT · Token · Vault) | ✅ **32/32 tests** |
| Arte on-chain (`tokenURI`) | 🎨 diseño aprobado (SVG generado, 100 % on-chain) |
| `MarbleRace` + frontend | 🔨 construyéndose durante el evento |
| Red | Sepolia (testnet) |

## Probadamente justo, sin trampa

El número aleatorio lo genera Chainlink VRF **con prueba criptográfica** — fuera del alcance de los
jugadores, del operador y del validador. Cada resultado y cada pago quedan verificables en Etherscan.
Es una economía de arcade cerrada (sin valor en efectivo), no un producto financiero.

## Correr localmente

```bash
yarn install
yarn chain      # blockchain local (anvil)
yarn deploy     # desplegar contratos
yarn start      # frontend en http://localhost:3000
```

Sepolia: `yarn deploy --network sepolia`. Detalle de comandos y convenciones en [AGENTS.md](AGENTS.md).

## Direcciones desplegadas (Sepolia)

| Contrato | Dirección |
|---|---|
| MarbleNFT | `por desplegar` |
| MarbleToken | `por desplegar` |
| MarbleVault | `por desplegar` |
| MarbleRace | `por desplegar` |

## Documentación / Entregables

| Documento | Qué es |
|---|---|
| [Modelo de datos](docs/data-model.es.md) | Spec de contratos + máquina de estados de `MarbleRace` (también sirve de spec de build) |
| [Brainstorming](docs/brainstorming.es.md) | Cómo llegamos a la idea: observación, alternativas, decisiones |
| [Business Model Canvas](docs/business-model-canvas.es.md) | Los 9 bloques del modelo de negocio |
| [Wireframes](docs/wireframes.es.md) | Flujo de pantallas y arquitectura de información |
| [Guion del video pitch](docs/pitch-video-script.es.md) | Guion ≤ 5 min |
| [Integración de gráficos](docs/graphics-integration.es.md) | Contrato entre la cadena y el motor de render (Three.js) |
| [Prototipo de coreografía](docs/prototype/) | Motor determinista + spike visual (verificado en 1000 carreras) |

## Roadmap (visión)

Carreras físicas semanales transmitidas con las 16 bolitas reales espejadas on-chain, y apuestas
parimutuel verificables. Un fenómeno pasivo que se convierte en un juego que se juega, se posee y se
puede probar.

---

<sub>Construido con [Scaffold-ETH 2](https://scaffoldeth.io) (Foundry). Aleatoriedad por
[Chainlink VRF](https://docs.chain.link/vrf).</sub>
