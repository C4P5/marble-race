# Marble Race — Contrato de Integración de Gráficos

> Para quien construye la parte gráfica. Esto dice **qué es fijo (no tocar)**, **qué construís vos**,
> y **las reglas que no se pueden romper**. Si seguís esto, tu pista encaja sin retoques.

---

> **Actualización — pivot a Three.js (3D).** Todo lo de abajo sigue valiendo: el motor de coreografía
> es **agnóstico al renderer**. Pasar de canvas 2D a Three.js cambia **una sola cosa** — `pointAt(f)`
> devuelve un punto **3D** sobre el spline de la pista en lugar de 2D. El resto del contrato es idéntico.

---

## 0. La regla de oro

**Coreografía, no física.** La cadena ya decidió quién gana antes del primer frame. Tu animación no
simula una carrera para ver quién gana — *reproduce* un resultado que ya está decidido y **llega** a
él. Nunca dejes que la física, el azar por frame o los gráficos decidan el podio. Si lo hacen, se
rompe lo único que hace especial a este juego: que es probadamente justo.

> ⚠️ **Con un motor 3D esto se vuelve más tentador y más peligroso.** Un engine de carreras quiere
> *simular*: darle física a la bolita, que ruede y choque, y ver quién gana. Si hacés eso, el ganador
> en pantalla no va a coincidir con la cadena. En 3D la bolita se mueve **por el spline según el
> `progress` del motor** (`0→1` → posición), nunca por física. La física puede dar sabor visual
> (bamboleo, sacudida de cámara) pero **jamás** tocar el avance sobre la pista.

---

## 1. Flujo de datos

```
  CADENA (evento Settled)          MOTOR (choreography.js)        VOS (la pista)
  ───────────────────────          ───────────────────────       ──────────────
  entrants[]  (tokenIds)   ──►      buildSchedules(order, seed)    pointAt(f) → x,y
  raceSeed                 ──►      → progreso por bolita  ──►      dibujás cada bolita
  finishingOrder[]         ──►        en el tiempo                  cámara + obstáculos
```

- **`finishingOrder`** son **todas** las bolitas que entraron, en orden de llegada (índice 0 = ganador).
  Con Chainlink VRF todos los que entran corren y terminan — **no hay DNF que renderizar** (una cosa
  menos para vos).
- El motor convierte eso en *dónde está cada bolita en cada instante*. Vos lo dibujás.

---

## 2. Lo que YA está y NO se toca — el motor

Archivo: **`docs/prototype/choreography.js`**. Verificado en 1000 carreras (desvío cero, 98,7% con
cambios de liderazgo). No lo edites; consumilo.

| Función | Qué te da |
|---|---|
| `buildSchedules(order, seed)` | El "cronograma" de cada bolita: su tiempo total y sus tiempos por tramo. Pasale el `finishingOrder` de la cadena como `order`. |
| `progressAt(schedule, t)` | La posición de una bolita en `[0,1]` a lo largo del recorrido, en el instante `t` (segundos). **Este es tu input principal.** |
| `renderedFinishOrder(schedules)` | El orden en que tu animación va a terminar. **Garantizado igual a `order`.** Usalo para auto-verificar. |
| `leaderAt(schedules, t)` | Quién va puntero en el instante `t` (para la cámara follow). |

Constante clave: `Choreo.DEFAULTS.segments = 10` — la cantidad de tramos/obstáculos.

---

## 3. Lo que construís VOS — la parte gráfica

1. **La pista.** La geometría sale del render 360 de Seedance. La convertís en una **línea de carrera**
   (una polilínea o spline de puntos de control).
2. **La función clave — `pointAt(f)`.** Dado un `f ∈ [0,1]`, devolvés dónde está esa fracción del
   recorrido sobre el spline 3D de la pista: `{ x, y, z, tangente, normal }`. La `tangente` orienta la
   bolita y la cámara en la dirección de avance; la `normal` (perpendicular a la pista) separa las
   bolitas en carriles. **Este es el único puente entre el motor y tu arte** — en 2D devolvía
   `{ x, y, normal }`; en 3D suma `z` y `tangente`, nada más.
3. **Sprites de bolitas**, coloreadas/identificadas por su `tokenId`.
4. **Offset de carril** para que hasta 16 bolitas no se apilen (usá la `normal` de `pointAt`).
5. **Obstáculos visuales** en los límites de tramo, es decir en `f = i / segments` para `i` de 0 a 10.
   Ahí es donde los cambios de liderazgo se leen naturalmente.
6. **Cámara:** vista general (todo el mapa) y follow (sigue al puntero). El MVP prioriza la general —
   el juez tiene que ver *quién ganó* de un vistazo.

---

## 4. Las reglas que NO podés romper — el contrato

1. **El podio en pantalla == `finishingOrder` de la cadena. Siempre.** Si pasás el `order` de la
   cadena a `buildSchedules`, el motor te lo garantiza. No re-derives el ganador por tu cuenta.
2. **`segments = 10`.** Tu pista necesita 10 puntos de obstáculo. Si querés otra cantidad, se cambia
   en el motor *y* en la pista, juntos — nunca desalineados.
3. **El único acoplamiento es `progress ∈ [0,1]`.** Cómo lo mapeás a pantalla es 100% tuyo — el motor
   no sabe nada de tu arte, tu cámara ni tus píxeles.
4. **Determinismo.** Mismo `seed` → misma carrera, idéntica. Nada de `Math.random()` por frame que
   cambie posiciones o resultado. Si querés variación visual, sembrala con el `seed`.
5. **≤16 bolitas legibles.** La cantidad de participantes varía entre 8 y 16; los carriles se asignan
   dinámicamente.
6. **Todas las bolitas que entran, terminan.** Con VRF no hay abandonos: renderizás a todos los
   participantes cruzando la meta, en el orden que dio la cadena.

---

## 5. El handoff de Seedance — el único paso manual

```
render 360 de Seedance  →  trazás la línea de carrera  →  puntos de control  →  pointAt(f)
```

En el spike de referencia esto son 13 puntos en el arreglo `CONTROL`, que pasan por `buildPath()` y
producen `pointAt()`. **Tu trabajo es reemplazar esos 13 números por los de tu pista real.** Nada más
cambia. Por eso el spike se hizo *antes* que el arte: para que el arte sea un reemplazo, no una
reescritura.

---

## 6. Referencia viva — el spike

**`docs/prototype/index.html`** es un renderer funcionando (abrilo en el navegador, sin build). Copiá
su patrón:

```
progress = Choreo.progressAt(schedule, t)   // del motor
punto    = pointAt(progress)                // tu pista
dibujar bolita en punto + offset de carril  // tu arte
```

Reemplazá la pista placeholder por la tuya y listo. El spike es 2D, pero el **patrón** (progreso →
`pointAt` → dibujar) es idéntico en Three.js; solo cambia el dibujo. Guardá el spike 2D como **plan B**:
si el 3D no llega a tiempo para el sábado, el 2D ya demuestra el loop completo probadamente justo.

---

## 7. Placeholders honestos — todavía no es final

- **El PRNG del spike (`mulberry32`) es un placeholder de `keccak256`.** No te afecta: vos consumís
  `raceSeed` y `finishingOrder`, no las tripas del RNG. Pero los números concretos van a cambiar
  cuando se cablee a la cadena.
- **La pista de 13 puntos es placeholder** — vos la reemplazás.
- **El contrato `MarbleRace` se construye durante el evento.** Por ahora la interfaz sale de la spec:
  ver `data-model.es.md` §7 (eventos) — en especial `Settled(poolId, raceSeed, finishingOrder)`, que
  es el disparador de tu animación.
- **El magnitud del offset de carril** está tuneada a la escala de la pista del spike; ajustala a la
  escala de la tuya.

---

## 8. phoboslab / WipEout — la técnica sí, los assets no

phoboslab.org (el rewrite de WipEout) es oro para la **técnica**: cómo renderizar una pista basada en
spline en WebGL, cómo mover la cámara sobre la línea de carrera, cómo armar el loop de render. Eso reusalo.

**Ojo con dos cosas, porque el hackathon tiene cláusula de originalidad:**

1. **Los assets de WipEout (pistas, naves, texturas, música) son de Sony/Psygnosis.** Ni phoboslab los
   distribuye — hay que tener el juego. **No subas ningún asset de WipEout al repo ni al demo:**
   violaría la declaración de "obra original o con derechos" que firmamos al inscribirnos.
2. **Verificá la licencia del código antes de copiarlo** y atribuí si corresponde.

No los necesitás igual: Seedance siempre fue el camino a una pista **original**. Usá el motor, traé tu
propio circuito.

---

## 9. Checklist de integración

- [ ] `pointAt(f)` devuelve posición 3D + tangente + normal para `f ∈ [0,1]`
- [ ] 10 obstáculos ubicados en `f = i/10`
- [ ] bolitas identificadas por `tokenId`, ≤16 legibles con offset de carril
- [ ] el orden en pantalla coincide con `finishingOrder` (verificalo con `renderedFinishOrder`)
- [ ] cámara: vista general + follow
- [ ] mismo `seed` → misma carrera (sin azar por frame)
