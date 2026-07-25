# Marble Race — Brainstorming

> Entregable del hackathon (**Brainstorming**) para Ethereum Uruguay 2026 · Track General.
> Cómo llegamos a la idea: la observación, las alternativas, y por qué quedó lo que quedó.

---

## 1. El disparador

Las carreras de bolitas ya son un fenómeno de masas. **Jelle's Marble Runs**: 1,45 millones de
suscriptores, ~204 millones de vistas, transmitido en **HBO** (Last Week Tonight) y en **ESPN**
("The Ocho"), explotó durante la pandemia como "el deporte sin temporada cancelada". Y las bolitas son
uno de los juegos más viejos de la humanidad — se encontraron en el antiguo Egipto y Roma.

La observación incómoda: **toda esa audiencia es 100% pasiva.** Mirás, pero no podés tener una bolita,
no podés apostar por una, y no podés probar que el resultado no se armó en la edición.

## 2. La pregunta central

> ¿Y si a un fenómeno con audiencia probada le agregamos las tres cosas que un video no puede dar —
> **propiedad, participación y justicia demostrable**— usando lo único que las hace posibles de verdad:
> una blockchain pública?

## 3. Divergencia — lo que exploramos

- **Modelo de participación:** ¿solo mirar y apostar? ¿posesión de bolitas? ¿carreras jugables?
  → Convergió en: **poseés una bolita (NFT), ganás crédito, y competís.**
- **Origen de la aleatoriedad:** oráculo, VRF, bloque, commit-reveal.
- **Render de la carrera:** video generado por IA (Seedance) como fuente de verdad vs. animación
  determinista.
- **Economía:** token abierto/comprable vs. crédito de circuito cerrado.
- **Capa física:** las 16 bolitas físicas transmitidas (phygital) como espejo de las especiales.
- **Monetización:** gratis vs. apuestas con plata real.

## 4. Convergencia — el loop que quedó

`mintear una bolita → acumular crédito (MRBL) → entrar a una carrera → sorteo por Chainlink VRF → settle → cobrar`,
con las 16 bolitas especiales financiando los premios desde sus emisiones. Un loop cerrado, completo y
demostrable de punta a punta.

## 5. Decisiones clave y alternativas descartadas

| Decisión | Opciones | Elección | Por qué |
|---|---|---|---|
| Estructura del NFT | 16 contratos separados vs. 1 contrato con 16 ids especiales | **1 contrato, ids 1–16** | Corrección temprana: mucho más simple, un solo estándar, ids especiales por rango puro |
| Aleatoriedad | Oráculo · VRF · prevrandao solo · commit-reveal | **Chainlink VRF v2.5** | Aleatoriedad verificable on-chain; sin sponsor que lo condicione, elimina la fase de reveal (una sola acción para el jugador) y simplifica el contrato |
| Render de la carrera | Video IA como resultado vs. animación determinista | **Coreografía determinista** | Un video generativo no puede garantizar que el ganador en pantalla == el de la cadena; rompería la justicia |
| Token | Abierto/comprable vs. circuito cerrado | **Circuito cerrado (solo por emisión)** | Se lee como arcade, no como security; neutraliza la óptica de timba |
| Custodia de las especiales | Wallet del proyecto vs. contrato | **MarbleVault** ("la casa es un contrato") | Narrativa + seguridad: nadie confía en nuestra wallet; rescate testeado contra manager hostil |
| Pagos | Push (enviar) vs. pull (reclamar) | **Pull en todos lados** | Nada se traba; lección del Challenge 08 de Speedrun |
| Deflación | Quemar también en cancel vs. solo en settle | **Solo en settle** | Quemar en cancel vacía la tesorería en el arranque en frío; la deflación viene del éxito, no del fracaso |
| 1 bolita por wallet | Aplicar a todas vs. eximir especiales | **Especiales exentas** | Una dirección (la bóveda) tiene las 16; las públicas sí respetan el límite |

## 6. Riesgos identificados y cómo los diseñamos para afuera

- **Óptica de timba** → enmarcar como *carrera de arcade probadamente justa*, crédito ganado sin valor
  en efectivo; las apuestas con plata real quedan explícitamente en la Fase 2.
- **Manipulación de la aleatoriedad** → Chainlink VRF: número aleatorio con prueba criptográfica,
  fuera del alcance de jugadores, operador y validador.
- **Pantalla que no coincide con la cadena** → el orden de llegada se computa on-chain y la animación
  *llega* a él; verificado en 1000 carreras (desvío cero).
- **Copyright de la técnica de render** → usar el motor/técnica, construir pista **original** (Seedance
  / código propio), nunca assets de terceros.

## 7. Fuera de alcance (a propósito, para el hackathon)

Apuestas parimutuel con plata real en las carreras IRL, pares/DEX del token, semillas variables,
carreras P2P, y la red de carreras físicas semanales. Todo eso es **Fase 2 y roadmap** — el hackathon
demuestra el núcleo probadamente justo.
