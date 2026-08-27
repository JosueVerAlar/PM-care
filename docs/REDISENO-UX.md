# Rediseño de arquitectura de información y acciones

**Origen:** E13 · uso real. El usuario probó la app empaquetada y trajo seis quejas.
**Alcance:** dónde vive cada acción y cada texto. No se toca el modelo de datos, ni los
comandos, ni `derivar()`, ni las reglas duras de `CLAUDE.md`.
**Quién lo implementa:** `frontend`, con `qa` verificando. Este documento no trae código.

> Lo que dijo, textual, y que manda sobre cualquier preferencia de este documento:
>
> «si puedo crear épicas pero no es fácil desplegar para agregar items internos, ni
> tareas… el manejo de los equipos es repetitivo… agregar proyectos parece que está
> replicada de forma innecesaria… cuando tenga más de 6 proyectos a la par, no sería
> manejable en "personas", lo mejor sería quitarlo… hay muchos comentarios en la app,
> quítalos y solo deja lo explicativo; qué teclas hacen qué acción… mueve el botón de
> capturar o deshacer a un lugar más fácil de ubicar… usabilidad tan simple que un niño
> de 5 años pudiera usarla».

---

## 1 · Fuentes consultadas

Todas verificadas (HTTP 200 y contenido leído). Se citan con la clave corta de la columna
izquierda a lo largo del documento. **Lo que no encontré fuente para sostener está dicho
en §1.5**, no disimulado.

### 1.1 · Acciones escondidas tras el ratón

| Clave | Fuente | Lo que dice | Qué implica aquí |
|---|---|---|---|
| **[MENUS-25]** | *Designing Effective Contextual Menus: 10 Guidelines* · NN/g, Kate Kaplan, 2025 · [nngroup.com/articles/contextual-menus-guidelines](https://www.nngroup.com/articles/contextual-menus-guidelines/) | «**Don't:** Tuck them away in hover-only states or reduce their visual salience in an attempt to make the interface feel light and minimalistic.» · «Overly subtle visual design decreases discoverability.» | El asa y «Al sprint» hacen exactamente lo que este artículo nombra como error. |
| **[MENUS-19]** | *Contextual Menus: Delivering Relevant Tools for Tasks* · NN/g, Anna Kaley, 2019 · [nngroup.com/articles/contextual-menus](https://www.nngroup.com/articles/contextual-menus/) | «Because the default view of a contextual menu is usually hidden, users may not know it is available, or how to access it.» | Un menú `⋯` es válido, pero su **disparador** tiene que verse siempre. |
| **[HIDDEN-NAV]** | *Hamburger Menus and Hidden Navigation Hurt UX Metrics* · NN/g, Pernice & Budiu, 2016 · [nngroup.com/articles/hamburger-menus](https://www.nngroup.com/articles/hamburger-menus/) | «a more than **20 % drop in discoverability**» · en escritorio, «people were at least **39 % slower** when the navigation was hidden» · «a **21 % increase**» en dificultad percibida | Cifras duras. Esconder no es neutro, tiene precio medido. |
| **[CHROME]** | *Maximize the Content-to-Chrome Ratio* · NN/g, Budiu, 2014 · [nngroup.com/articles/content-chrome-ratio](https://www.nngroup.com/articles/content-chrome-ratio/) | «the ratio would be slightly better if the navigation is hidden, but **not better enough to justify the cost of hiding**» · «a tiny icon is easier to overlook on a large screen than on a small one» | En una app de escritorio no vale la excusa de «no cabe». |
| **[HEUR-6]** | *10 Usability Heuristics*, nº 6 · NN/g, Nielsen, 1994/2024 · [nngroup.com/articles/ten-usability-heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) | «Minimize the user's memory load by making elements, actions, and options **visible**.» | Regla raíz de P1 y P6. |
| **[HIG-MENUBAR]** | *The menu bar* · Apple HIG · [developer.apple.com/…/the-menu-bar](https://developer.apple.com/design/human-interface-guidelines/the-menu-bar) | «**Always show the same set of menu items.** […] If a menu bar item isn't actionable, **disable the action instead of hiding it**.» | Deshabilitar gana a ocultar. Me hizo cambiar la decisión de solo lectura (§5.6). |
| **[TOP10]** | *Top 10 Application-Design Mistakes* · NN/g, Nielsen & Laubheimer, 2019 · [nngroup.com/articles/top-10-application-design-mistakes](https://www.nngroup.com/articles/top-10-application-design-mistakes/) | «These menu labels have low information scent and are nothing more than a **junk drawer**» | Aviso contra mi propio `⋯`: ver la advertencia de §4.1. |

### 1.2 · Dónde va una acción primaria

| Clave | Fuente | Lo que dice | Qué implica aquí |
|---|---|---|---|
| **[FITTS]** | *Fitts's Law and Its Applications in UX* · NN/g, Budiu, 2022 · [nngroup.com/articles/fitts-law](https://www.nngroup.com/articles/fitts-law/) | «The bigger the distance to the target, the longer it will take» · «The larger the target, the shorter the movement time» · «the *Submit* button in a form should be placed **next to the last form field**» | La acción va pegada al objeto que afecta. |
| **[FITTS-92]** | MacKenzie, I.S., *Fitts' Law as a Research and Design Tool in HCI*, **Human-Computer Interaction 7 (1992) 91–139** · [yorku.ca/mack/hci1992.html](https://www.yorku.ca/mack/hci1992.html) | Modelo formal del tiempo de apuntado. | Respaldo académico, no solo blog de industria. |
| **[PROXIMITY]** | *Dangerous UX: Consequential Options Close to Benign Options* · NN/g, Laubheimer, 2021 · [nngroup.com/articles/proximity-consequential-options](https://www.nngroup.com/articles/proximity-consequential-options/) | «It's okay to leverage Fitts' Law and make it **a little harder** to select the consequential option» · «The few additional milliseconds […] is nothing compared to the frustration […] to undo a major error.» | *Eliminar* va al fondo del `⋯`, separado. |
| **[HIG-TOOLBAR]** | *Toolbars* · Apple HIG · [developer.apple.com/…/toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) | «**Choose items deliberately to avoid overcrowding.**» · «**Add a More menu to contain additional actions.** […] only add this menu if you really need it.» · «**Reduce the use of toolbar backgrounds and tinted controls.**» | Barra superior sin verbos; `⋯` con moderación. |
| **[HIG-BUTTONS]** | *Buttons* · Apple HIG · [developer.apple.com/…/buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | «use a button that has a prominent visual style for **the most likely action** in a view» · «**Keep the number of prominent buttons to one or two per view.**» · «Use **style — not size** — to visually distinguish the preferred choice» | Un solo primario por panel, y con relleno sólido. |
| **[MAT2-BTN]** | *Buttons* · Material Design 2 · [m2.material.io/components/buttons](https://m2.material.io/components/buttons) | Jerarquía explícita: «**Text button** (low emphasis) […] **Outlined Button** (medium emphasis) […] **Contained button** (high emphasis)» | «Capturar» hoy es *outlined* haciendo de primario. |
| **[FAB]** | *FAB* · Material Design 3 · [m3.material.io/components/floating-action-button/guidelines](https://m3.material.io/components/floating-action-button/guidelines) | «Use a FAB for **the most important action** on a screen» · *don't:* «A screen with 3 FABs makes it hard to tell what the primary action should be.» | Tres primarios equivalen a ninguno. |
| **[UICOPY]** | *UI Copy: Guidelines for Command Names and Keyboard Shortcuts* · NN/g, Kaley, 2019 · [nngroup.com/articles/ui-copy](https://www.nngroup.com/articles/ui-copy/) | «**Lead with verbs**» · «If a shortcut is available, **include the function key(s) […] alongside the command text**» | La tecla va **junto a la etiqueta**, dentro del menú. |

### 1.3 · Deshacer

| Clave | Fuente | Lo que dice | Qué implica aquí |
|---|---|---|---|
| **[HIG-UNDO]** | *Undo and redo* · Apple HIG · [developer.apple.com/…/undo-and-redo](https://developer.apple.com/design/human-interface-guidelines/undo-and-redo) | «**Provide undo and redo buttons only when necessary.** People generally expect to initiate undo and redo in **system-supported ways, such as choosing the items in a macOS app's Edit menu**» · «**Help people predict the results** […] menu item labels like *Undo Typing*» · «**Show the results of an undo or redo** […] it's crucial to highlight the result […] to keep people from thinking that the action had no effect.» | La fuente decisiva de P2. El menú es el sitio canónico; el botón en barra es la excepción. |
| **[HIG-EDIT]** | *The menu bar · Edit menu* · Apple HIG (misma URL que [HIG-MENUBAR]) | «Undo — Reverses the effect of the previous user operation. **Clarify the target of the undo.** For example […] append the item's title» | «Deshacer capturar SICOE-T14», no «Deshacer». |
| **[HIG-KEYS]** | *Keyboards · Standard keyboard shortcuts* · Apple HIG · [developer.apple.com/…/keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards) | «Command-Z — Undo the previous operation.» · «**Respect standard keyboard shortcuts.**» · «Avoid creating a new shortcut by adding a modifier to an existing shortcut for an unrelated command.» | `⌘Z` y `⇧⌘Z` ya se respetan en `atajos.ts`. |
| **[HEUR-3]** | *User Control and Freedom (Heuristic #3)* · NN/g, Rosala, 2020 · [nngroup.com/articles/user-control-and-freedom](https://www.nngroup.com/articles/user-control-and-freedom/) | «a clearly marked '**emergency exit**'» · «When a user makes a change to the status of a system, he should be able to easily undo that.» | Deshacer no es un lujo. |
| **[CONFIRM]** | *Confirmation Dialogs Can Prevent User Errors — If Not Overused* · NN/g, Nielsen, 2018/2026 · [nngroup.com/articles/confirmation-dialog](https://www.nngroup.com/articles/confirmation-dialog/) | «Use a confirmation dialog before committing to actions with **serious consequences**» · «**Do go to great lengths to provide undo**, because some user errors will remain despite even the best of confirmation dialogs.» | Deshacer > confirmar, salvo lo irreversible. La app ya tiene **una sola** confirmación y está bien puesta. |

### 1.4 · Navegación, densidad y texto

| Clave | Fuente | Lo que dice | Qué implica aquí |
|---|---|---|---|
| **[FLAT-DEEP]** | *Flat vs. Deep Website Hierarchies* · NN/g, Whitenton, 2013 · [nngroup.com/articles/flat-vs-deep-hierarchy](https://www.nngroup.com/articles/flat-vs-deep-hierarchy/) | «Content is more discoverable when it's not buried under multiple intervening layers.» · «going too far to either extreme will backfire» | No hay número mágico de niveles. |
| **[3CLICKS]** | *The 3-Click Rule for Navigation Is False* · NN/g, Laubheimer, 2019 · [nngroup.com/articles/3-click-rule](https://www.nngroup.com/articles/3-click-rule/) | «has **not** been supported by data in any published studies to date» | Contar clics no mide nada. |
| **[PORTER-03]** | *Testing the Three-Click Rule* · Joshua Porter, UIE, 2003 · [articles.centercentre.com/three_click_rule](https://articles.centercentre.com/three_click_rule/) *(la URL histórica de `articles.uie.com` redirige aquí)* | «there wasn't any more likelihood of a user quitting after **three clicks than after 12 clicks**» · «The satisfaction of users doesn't depend on the number of clicks.» · Base: **más de 8 000 clics en 620 tareas**. | Es lo que me deja cambiar «Al sprint» de un clic a dos sin remordimiento (§10). |
| **[SCENT]** | *Information Scent* · NN/g, Budiu, 2020 · [nngroup.com/articles/information-scent](https://www.nngroup.com/articles/information-scent/) | «Link names should be clear and self-explanatory. If the link name is too obscure and vague, people might miss a good source of information.» | Grupos de la lateral nombrados por lo que se hace, no por lo que son. |
| **[DUP-LINKS]** | *The Same Link Twice on the Same Page* · NN/g, Loranger, 2016 · [nngroup.com/articles/duplicate-links](https://www.nngroup.com/articles/duplicate-links/) | «Each additional link places an extra load on users' working memory because it causes people to **have to remember whether they have seen the link before or it is a new link**.» · Si se duplica, «place redundant links **far apart**». | **La cita de P3.** Es literalmente lo que le pasa con los dos «Equipos» — que además están lejos, que es lo que agrava el recordar. |
| **[NAV-STRAIN]** | *Four Dangerous Navigation Approaches* · NN/g, Cardello, 2013 · [nngroup.com/articles/navigation-cognitive-strain](https://www.nngroup.com/articles/navigation-cognitive-strain/) | «**Repeating links burdens your visitors.**» | Ídem. |
| **[HIG-MACOS]** | *Designing for macOS* · Apple HIG · [developer.apple.com/…/designing-for-macos](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos) | «present more content in **fewer nested levels** and with **less need for modality**» · «Use the menu bar to give people easy access to **all** the commands they need» | Sostiene a la vez el menú de aplicación y la IA más plana. |
| **[PROGRESSIVE]** | *Progressive Disclosure* · NN/g, Nielsen, 2006 · [nngroup.com/articles/progressive-disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | «defers advanced or **rarely used** features to a secondary screen, making applications easier to learn and less error-prone» | El `⋯` y el panel `?`. |
| **[ACCEL]** | *Accelerators Maximize Efficiency* · NN/g, Krause & Harley, 2024 · [nngroup.com/articles/ui-accelerators](https://www.nngroup.com/articles/ui-accelerators/) · y *Heurística #7* · Laubheimer, 2020 · [nngroup.com/articles/flexibility-efficiency-heuristic](https://www.nngroup.com/articles/flexibility-efficiency-heuristic/) | «Accelerators should be **additional, alternate** ways to accomplish a task — something that expert users can take advantage of, but that **others can ignore completely**.» · «*secondary* ways of accomplishing the *same* task» | **El diagnóstico exacto de P1:** hoy la tecla `N` no es un acelerador, es la única vía cómoda. Un acelerador haciendo de camino principal es el error. |
| **[LEGACY]** | *Supporting «Power Users» Isn't Enough: 3 Complex-App User Types* · NN/g, Kaplan, 2025 · [nngroup.com/articles/complex-apps-users](https://www.nngroup.com/articles/complex-apps-users/) | «A **legacy user** has used the software for years or even decades but hasn't become truly efficient.» | Contra «es mi app, ya me la sé»: el usuario *legacy* es él mismo dentro de seis meses. |
| **[DENSITY]** | *Utilize Available Screen Space* · NN/g, Nielsen, 2011 · [nngroup.com/articles/utilize-available-screen-space](https://www.nngroup.com/articles/utilize-available-screen-space/) | «**Higher information density = less need to move around** and higher likelihood that you see what you want.» | Justifica **no** bajar la densidad de filas. |
| **[HEUR-8]** | *10 Usability Heuristics*, nº 8 · NN/g | «Every extra unit of information in an interface **competes** with the relevant units of information and **diminishes their relative visibility**.» | **La cita de P5.** Los 45 bloques de texto no son gratis: se comen la visibilidad de los datos. |
| **[INFOTIPS]** | *Why So Many Info Tips Are Bad* · NN/g, Kaplan, 2026 · [nngroup.com/articles/info-tips-bad](https://www.nngroup.com/articles/info-tips-bad/) | «Info tips are often abused as **band aids** in the interface, used to: **cram in explanations that should've been designed into the UI**» · «Don't: Use info tips as a **crutch for poor labeling** or dense layouts.» | Aviso doble: contra las notas al pie **y** contra mi propia tentación de meterlo todo en `title`. |
| **[HELP-10]** | *Help and Documentation (Heuristic #10)* · NN/g, Kendrick, 2020 · [nngroup.com/articles/help-and-documentation](https://www.nngroup.com/articles/help-and-documentation/) | «it may be necessary to provide help […] easy to search, **focused on the user's task**, list concrete steps, and **not be too large**» | El panel `?` puede existir, pero corto. |
| **[ONBOARD]** | *Onboarding Tutorials vs. Contextual Help* · NN/g, Laubheimer, 2023 · [nngroup.com/articles/onboarding-tutorials](https://www.nngroup.com/articles/onboarding-tutorials/) | «**Push** revelations reveal new information **out of context**, without any specific indication that the user would benefit from the information at that moment.» | La leyenda permanente es *push*. El `?` es *pull*. |
| **[MODAL]** | *Modal & Nonmodal Dialogs* · NN/g, Fessenden, 2017 · [nngroup.com/articles/modal-nonmodal-dialog](https://www.nngroup.com/articles/modal-nonmodal-dialog/) | «They **interrupt** the user's workflow. Modal dialogs force users away from the tasks they were working on.» | Capturar no es modal. |
| **[TABLES]** | *Data Tables: Four Major User Tasks* · NN/g, Laubheimer, 2022 · [nngroup.com/articles/data-tables](https://www.nngroup.com/articles/data-tables/) | «**Edit in place** (where the table row becomes editable). This solution works only **if the table is narrow**.» · «the big downside with a modal implementation […] is that it will **cover adjacent records**» | Sostiene la captura en la fila: aquí la «tabla» es un solo campo de título. |
| **[MODES]** | *Modes in User Interfaces* · NN/g, Laubheimer, 2019 · [nngroup.com/articles/modes](https://www.nngroup.com/articles/modes/) | «**Mode slips** happen because the system doesn't clearly indicate its status to the user.» | La fila en modo captura tiene que **verse** distinta. |
| **[MARK-08]** | Mark, G., Gudith, D., Klocke, U., *The Cost of Interrupted Work: More Speed and Stress*, **CHI 2008** · [ics.uci.edu/~gmark/chi08-mark.pdf](https://www.ics.uci.edu/~gmark/chi08-mark.pdf) *(el DOI de ACM devuelve 403 a acceso automatizado; esta es la copia abierta de los autores)* | «people compensate for interruptions by working faster, but this comes at a price: experiencing **more stress, higher frustration, time pressure and effort**» | Respaldo académico del coste de interrumpir. |

### 1.5 · Accesibilidad · WCAG 2.2 (texto normativo)

W3C Recommendation, 5 oct 2023 · [w3.org/TR/WCAG22](https://www.w3.org/TR/WCAG22/). Para
software de escritorio aplica además **WCAG2ICT** ([w3.org/TR/wcag2ict-22](https://www.w3.org/TR/wcag2ict-22/)),
que traduce estos criterios fuera de la web — relevante porque PM-care es una app Electron.

| Criterio | Nivel | Texto normativo | Estado en PM-care |
|---|---|---|---|
| **1.4.1** Use of Color | A | «Color is not used as **the only** visual means of conveying information…» | ✅ Los tres canales usan forma, banda y palabra. Ya está bien resuelto. |
| **1.4.3** Contrast (Minimum) | AA | «…contrast ratio of at least **4.5:1**…» | ✅ Medido en los 30 pares, en los dos temas. |
| **1.4.11** Non-text Contrast | AA | «…at least **3:1** against adjacent color(s): User Interface Components, Graphical Objects.» | ✅ Medido. Vigilar el asa si se pinta en `--tinta-3`. |
| **2.1.1** Keyboard | A | «**All** functionality […] operable through a keyboard interface…» | ✅ Once atajos. Es la parte más fuerte de la app. |
| **2.5.8** Target Size (Minimum) · [w3.org/WAI/WCAG22/Understanding/target-size-minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | **AA** | «at least **24 by 24 CSS pixels**», salvo excepciones: **Spacing** (un círculo de 24 px centrado en cada objetivo no se corta con otro), **Equivalent** («The function can be achieved through **a different control on the same page** that meets this criterion»), Inline, User Agent Control, Essential. | ❌ **Seis clases lo incumplen** (§2.8). La excepción *Equivalent* es la salida barata y honesta: ver §9.1. |
| **2.5.5** Target Size (Enhanced) | AAA | «at least **44 by 44 CSS pixels**» | ❌ y no se persigue: incompatible con la densidad que el producto necesita. Se declara. |
| **3.2.6** Consistent Help | A | «…they occur in **the same order relative to other page content**…» incluida una «**self-help option**» | ⚠️ Hoy la ayuda está esparcida en 45 sitios. El `?` en el mismo lugar lo resuelve. |
| **4.1.3** Status Messages | AA | «status messages can be programmatically determined through role or properties such that they can be presented to the user by assistive technologies **without receiving focus**» | ⚠️ Falta al capturar y al deshacer. §5.6 y §6.2. |

### 1.6 · Color

| Clave | Fuente | Lo que dice |
|---|---|---|
| **[COLOR]** | *Using Color to Enhance Your Design* · NN/g, Gordon, 2021 · [nngroup.com/articles/color-enhance-design](https://www.nngroup.com/articles/color-enhance-design/) | «**Reserve the accent color** for what you want to stand out the most on your page — for example, the primary call to action.» |
| **[HIERARCHY]** | *Visual Hierarchy in UX* · NN/g, Gordon, 2021 · [nngroup.com/articles/visual-hierarchy-ux-definition](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/) | «**If everything is contrasted, then nothing stands out.**» |
| **[MAT3-COLOR]** | *Color roles* · Material Design 3 · [m3.material.io/styles/color/roles](https://m3.material.io/styles/color/roles) | «Container – Roles used as a fill color for foreground elements like buttons. They **should not be used for text or icons**.» · pares con «minimum 3:1 contrast» |

> **Aviso de honestidad sobre esta sección:** el artículo de color de NN/g **no** dice que el
> color deba ser un canal redundante. Esa regla es de **WCAG 1.4.1** y así se cita. No se le
> atribuye a NN/g lo que no dijo.

### 1.7 · Lo que NO tiene fuente, y lo digo

- **No hay literatura citable sobre «quick add» / creación en línea en herramientas de
  productividad** como patrón estudiado. NN/g, Baymard y la literatura académica no lo
  tratan por ese nombre; lo que circula son entradas de blog y documentación de producto,
  que no sirven de fundamento. **§5 no se apoya en investigación sobre ese patrón**, sino
  en tres cosas que sí son sostenibles: el eje modal/no-modal [MODAL] [TABLES], el coste de
  la interrupción [MARK-08], y **el precedente del propio código** (`CampoTitulo` ya monta
  un `<input>` dentro de un `treeitem` y funciona en producción).
- **Baymard Institute no aportó nada**: su investigación publicada es de comercio
  electrónico y pago. No se cita para no forzar la relevancia.
- Las páginas de Apple HIG y Material 3 se sirven con JavaScript; las URLs canónicas están
  verificadas y las citas se extrajeron del contenido renderizado. La jerarquía de énfasis
  de botones se cita desde **Material 2**, donde el texto «low / medium / high emphasis» es
  literal, porque las páginas equivalentes de Material 3 no expusieron cuerpo de texto.

---

## 2 · Lo que verifiqué en el código

Todo lo que sigue está medido sobre el repositorio, no supuesto.

### 2.1 · La suite de 874 pruebas no cubre ni una línea de interfaz

```
tests/  →  almacen · comandos · dominio · modelo
```

No hay `@testing-library`, ni `jsdom`, ni un solo `.test.tsx`. `npm test` corre en 1.8 s
y las 874 pruebas verifican el reductor, el almacén y las funciones puras.

Dos consecuencias, y las dos importan para priorizar:

1. **Ningún cambio de este documento rompe una prueba.** El costo de cada punto es
   reimplementación pura, no reescritura de pruebas.
2. **Tampoco hay red.** `Arbol.tsx` son 1101 líneas con roving tabindex, dos arrastres,
   filtro por predicado y once atajos, y se va a tocar a ciegas. Ver la pregunta abierta 5.

### 2.2 · Capturar cuesta tres regiones de pantalla y no hay ni un `+`

Para meter una historia dentro de una épica, hoy:

| Paso | Dónde mira el ojo | Qué pasa |
|---|---|---|
| 1 | fila de la épica, centro-izquierda | clic — y de paso **la pliega o la despliega**, porque el mismo `onClick` hace `enfocar` y `alternar` |
| 2 | barra superior, extremo derecho | pulsar «Capturar» — o saber que existe `N` |
| 3 | pie del panel, abajo del todo | aparece el campo; se escribe; Enter |

`Arbol.tsx` no pinta **ningún** botón de añadir en ninguna fila. Grep de `<button` en el
árbol devuelve cuatro: el glifo de estado, «Al sprint» de la tarea, «Al sprint · N» de la
historia y el campo de renombrar. No hay affordance de «aquí dentro cabe algo».

«Capturar» además no dice qué captura: el destino está en el atributo `title`, que exige
apuntar y esperar. Y depende de una selección que el propio clic destruye.

### 2.3 · «Capturar» está marcado como primario pero no lo parece

```css
.tb-primario { height:26px; padding:0 11px; border:1px solid var(--hairline);
               background: var(--fondo-panel); color: var(--tinta-1); font-weight:500; }
.tb-boton    { height:26px; padding:0 9px;  color: var(--tinta-2); }
```

Mismo alto, mismo fondo, sin relleno sólido: junto a «Deshacer» son dos botones del mismo
peso. La app **tiene** un token de acción sólida (`--solido-fondo`) y lo usa en los
formularios (`.boton-solido`), pero no en la única acción que se repite todo el día.

### 2.4 · No hay menú de aplicación. El «Deshacer» del menú de macOS no es el de la app

`electron/main.ts` no llama a `Menu.setApplicationMenu` en ninguna parte. La ventana usa
`titleBarStyle: 'hiddenInset'`, así que Electron monta su menú por omisión, y ese menú
trae **Edición ▸ Deshacer** con `role: 'undo'`, que es el deshacer del campo de texto
enfocado, no el comando de dominio.

Resultado: existen dos «Deshacer» distintos. El del menú —el sitio donde un usuario de
macOS mira primero— no revierte capturar, mover al sprint ni bloquear. Esto no es una
preferencia de diseño: es un defecto.

### 2.5 · «Equipos» aparece dos veces en la misma barra lateral

| | `vistas/globales/VistaEquipos.tsx` | `administracion/SeccionEquipos.tsx` |
|---|---|---|
| Fuente | `proyecto.equipo` | `proyecto.equipo` |
| Rejilla por proyecto con miembros, rol y carga | sí | sí |
| «Con tareas abiertas aquí, sin estar en el equipo» | sí | sí |
| Cruce «personas en más de un equipo» | sí, sección propia | sí, chips dentro de cada tarjeta |
| Editar | no | sí |
| Nota al pie explicando que el equipo no restringe responsables | sí | sí, otra redacción |

Son la misma pantalla dos veces, separadas por seis entradas de barra lateral, con la
misma etiqueta. La justificación escrita en `VistaAdministracion.tsx` —«las de arriba son
de consulta, estas editan el catálogo»— es una distinción del constructor, no del que usa.
Es un solo usuario en una sola máquina: no hay roles, ni permisos, ni revisión.

### 2.6 · La relación persona↔proyecto se edita desde los dos lados, y solo uno puede terminar la tarea

- **Desde el proyecto** (`SeccionEquipos`): se elige del catálogo y **se le pone rol**.
- **Desde la persona** (`SeccionPersonas`): un `chips-sel` con **una casilla por cada
  proyecto activo**, y `editarPersona {equipos}` deja al miembro con `rol: null`.

La razón que dio el usuario —«con más de 6 proyectos no sería manejable»— se sostiene y se
puede medir: el ancho del control crece con el número de proyectos (11 chips por persona,
por fila, para siempre), mientras que el dato que representa casi nunca pasa de tres. El
widget está dimensionado por el eje que no importa.

Pero hay una razón más fuerte que él no dijo: **el rol solo existe del lado del proyecto**.
Editar desde la persona crea una pertenencia incompleta que hay que ir a arreglar a la
otra pantalla. Es un camino que no puede terminar lo que empieza.

### 2.7 · Cuarenta y cinco bloques de texto explicativo permanente

Conteo por clase de componente, sobre `src/renderer`:

| Pieza | Ocurrencias | Qué es |
|---|---|---|
| `<NotaPie>` | 10 | párrafo al pie de la vista explicando el modelo |
| `<ReglaOrden>` | 5 | franja explicando por qué las filas están en ese orden |
| `bloque__nota` | 12 | párrafos dentro de Administración |
| `vacio__nota` | 8 | estados vacíos |
| `seccion__aclaracion` | 4 | párrafos dentro de una sección |
| `__pista` | 6 | pista bajo un formulario |
| `Leyenda` | 1 pieza | 5 glifos + 3 canales + **8 atajos** + una nota de dos frases |

Muestra de lo que hoy lee el usuario, permanentemente, sin haberlo pedido
(texto literal de `VistaBacklog.tsx`, con sus interpolaciones):

> «Se pintan las {conteo.visibles} filas visibles sin virtualizar: con
> {conteo.capturadas} tareas capturadas todavía no hace falta. […] Ya se pasó de las mil
> filas: toca medir el tiempo de pintado antes de que plegar y filtrar dejen de bastar.»

Eso es una nota del programador que salió empaquetada.

> «Crear uno desde la app llega en E7; mientras tanto se puede editar el JSON a mano.»
> — `Avisos.tsx`, estado sin proyectos

E7 se entregó. La app dice al usuario que edite el JSON a mano para algo que ya sabe hacer.

### 2.8 · Seis clases de control por debajo del mínimo táctil, y una definida dos veces

| Clase | Tamaño real | ¿Visible siempre? |
|---|---|---|
| `.asa` | 12 px de ancho | **no** — `visibility:hidden` hasta `:hover`/`:focus-within` |
| `.fila__accion` («Al sprint») | 18 px de alto | **no** — mismo mecanismo |
| `.glifo--boton` | ~14 × 14 px | sí |
| `.cab__accion` | ~19 px de alto | sí |
| `.alternador button` | ~18 px de alto | sí |
| `.mini` | 20 px (`edicion.css`) **y** 22 px (`globales.css`) | sí |
| `.tb-boton`, `.boton-solido` | 26 y 28 px | sí — estos sí cumplen |

`.mini` está declarada con dos alturas distintas en dos hojas; cuál gana depende del orden
de carga.

### 2.9 · Lo que ya está resuelto y solo falta enchufar

- **`maqueta/tema.html`** — `diseno` ya entregó la paleta «Arco» completa: superficies con
  temperatura, acento separado por luminancia (no por matiz, para no robarle canal a
  ninguno de los cuatro estados), y los tokens `--completa-*` para la épica terminada.
  Medida en WCAG y en las tres dicromacias. **No está aplicada**: `base.css` sigue con la
  paleta de E0.
- **El gancho de la épica terminada** ya está en el DOM: `data-derivado="hecha"` en la
  fila, con el selector documentado en `arbol.css` y sin nada pintado todavía.
- **La edición en línea dentro de una fila del árbol ya funciona.** `CampoTitulo` monta un
  `<input>` dentro del `div` que lleva `role="treeitem"`, y renombrar se usa a diario. Este
  precedente decide el rediseño de la captura (§5).

---

## 3 · Diagnóstico de los seis problemas

Ordenados por daño, no por facilidad.

### P1 · Capturar dentro de una épica (daño: alto · frecuencia: la segunda más alta)

**Qué le pasa a la persona:** para meter seis tareas en una historia tiene que descubrir
que existe una tecla que nada en pantalla menciona, o recorrer el ojo tres veces la
ventana entera. Y el clic con el que selecciona el contenedor es el mismo que lo pliega,
así que la acción se pelea consigo misma.

**Por qué está mal, y no es mi gusto:**

- **La distancia se paga.** [FITTS] [FITTS-92]: el tiempo de apuntado crece con la
  distancia y baja con el tamaño del objetivo. En una ventana de 1440 px, del renglón al
  botón de la barra hay ~700–1000 px hasta un objetivo de 26 px de alto; un `＋` en el
  propio renglón está a menos de 40 px. La regla normativa de [FITTS] es literal: *«el
  botón Enviar de un formulario debe colocarse junto al último campo del formulario»*.
- **La tecla `N` está haciendo un trabajo que no le toca.** [ACCEL] es explícito: un
  acelerador es una vía *adicional y alternativa*, «something that expert users can take
  advantage of, but that **others can ignore completely**». Hoy `N` no es alternativa de
  nada: es el único camino cómodo, y nada en pantalla lo anuncia. **Ese es el diagnóstico
  exacto de P1: un acelerador ascendido a camino principal.**
- **Y no vale «ya me la sé».** [LEGACY] describe al *legacy user*: alguien que lleva años
  con la herramienta «but hasn't become truly efficient». Es él mismo dentro de seis meses,
  después de tres semanas sin abrirla.

### P2 · «Capturar» y «Deshacer» en la barra superior (daño: alto)

Dos problemas encadenados. El de colocación —la acción más frecuente está lejos del sitio
donde se trabaja, y la de recuperación ocupa sitio permanente sin usarse casi nunca— y el
de duplicidad: el menú de macOS ofrece un «Deshacer» que hace otra cosa (§2.4).

### P3 · Equipos duplicado (daño: medio-alto · pero barato de arreglar)

Dos entradas con la misma etiqueta en la misma lista. El usuario tiene que aprender una
regla —«la de arriba mira, la de abajo cambia»— que no le sirve para nada más y que no le
dice la propia interfaz.

[DUP-LINKS] describe el coste exacto que él sintió: cada enlace repetido «places an extra
load on users' working memory because it causes people to **have to remember whether they
have seen the link before or it is a new link**». Y la única mitigación que ese artículo
admite para una duplicación deliberada —separarlas mucho— es justo lo que aquí **agrava**
el problema: están a seis filas de distancia, en grupos distintos, con el mismo nombre.
[NAV-STRAIN] lo resume en tres palabras: «Repeating links burdens your visitors».

### P4 · Persona↔proyecto desde dos lados (daño: medio · crece con el tiempo)

Hoy con 3 proyectos molesta poco. Con 11 el control de la ficha de persona mide once
chips. Y es el lado que no puede poner el rol.

### P5 · Texto explicativo (daño: medio · pero es lo que él sintió primero)

45 bloques compitiendo por los mismos píxeles que los datos. El texto no está de más
porque sea malo —está bien escrito— sino porque **explica reglas del modelo a la persona
que inventó el modelo**. «El equipo no restringe quién puede ser responsable de una tarea»
se lo está diciendo a quien decidió que no restringiera.

### P6 · Acciones repartidas en seis sitios (daño: medio · es la causa de P1 y P2)

Una acción de PM-care puede vivir hoy en: la barra superior · la cabecera del panel · el
cuerpo de la fila (arrastre) · el asa de la fila (otro arrastre) · un botón revelado al
pasar el ratón · una tecla suelta sin representación visual · el pie de edición · la
tarjeta del sprint. Ocho sitios, sin una regla que diga cuál.

---

## 4 · La regla que resuelve P6, y de la que sale todo lo demás

**Tres casas para las acciones, y cada una se explica en una frase.**

| Casa | Regla | Qué contiene |
|---|---|---|
| **En la fila** | *actúa sobre esa cosa* | glifo de estado · `+` (solo contenedores) · `⋯` |
| **En la cabecera del panel** | *actúa sobre lo que se ve en el panel* | pestaña · Expandir/Colapsar todo · `+ Nueva épica` · `?` |
| **En el menú de la app** | *actúa sobre el documento o la app* | Deshacer · cerrar sprint · ir a vista |

La regla no es estética: es la heurística 6 de Nielsen [HEUR-6], «*minimize the user's
memory load by making elements, actions, and options **visible***». Hoy, para saber qué se
puede hacer con una fila hay que **recordar** ocho teclas. Después, hay que **mirar**.

**La barra superior deja de tener verbos.** Solo dice dónde estás: colapsar lateral,
título, subtítulo, insignia de solo lectura. Es lo que pide [HIG-TOOLBAR] («*Choose items
deliberately to avoid overcrowding*», «*reduce the use of toolbar backgrounds and tinted
controls*») y lo que [HIG-MACOS] remata: «*use the menu bar to give people easy access to
**all** the commands they need*».

### 4.1 · El menú `⋯` de cada fila

Es el movimiento que hace posible la regla: convierte ocho teclas memorizadas en ocho
etiquetas legibles **con su tecla al lado** —que es literalmente lo que manda [UICOPY]:
«*include the function key(s) and sequence of additional keys alongside the command
text*»— sin gastar ocho botones de ancho [PROGRESSIVE].

Es el sitio donde vive, a partir de ahora, la lista de atajos que hoy está en la leyenda:
pegada a la acción que ejecuta, no en un pie que hay que leer entero.

```
┌──────────────────────────────┐
│ Marcar en curso      Espacio │   ← nombra el SIGUIENTE estado; hoy nada dice que el
│ ──────────────────────────── │      glifo se pueda pulsar
│ Al sprint                  S │   ← hoy es un botón que solo aparece al pasar el ratón
│ Renombrar              Enter │
│ Bloquear…                  B │
│ Cancelar                   C │
│ ──────────────────────────── │
│ Subir                     ⌥↑ │   ← hoy solo se descubre encontrando el asa escondida
│ Bajar                     ⌥↓ │
│ ──────────────────────────── │
│ Eliminar                   ⌫ │   ← al fondo y tras separador, a propósito
└──────────────────────────────┘
```

Tres decisiones dentro del menú, cada una con su razón:

- **«Eliminar» al fondo, después de un separador.** [PROXIMITY] cuenta que juntar lo
  destructivo con lo benigno «is one of the top 10 application design mistakes», y admite
  explícitamente lo contrario: «*It's okay to leverage Fitts' Law and make it a little
  harder to select the consequential option*». Aquí cuesta un recorrido de ratón más largo,
  y eso es exactamente lo que se busca.
- **«Marcar en curso» nombra el estado siguiente, no «Cambiar estado».** [UICOPY]:
  «*Lead with verbs or verb phrases that clearly outline what will happen*». Y de paso
  resuelve algo que hoy no está resuelto: **nada en pantalla dice que el glifo de 14 px es
  un botón**.
- **El disparador `⋯` se ve siempre.** [MENUS-19] avisa de que un menú contextual «is
  usually hidden, users may not know it is available»; [MENUS-25] prohíbe expresamente
  esconder su icono. El menú puede estar cerrado; su puerta, no.

> **Advertencia contra mi propia propuesta.** [TOP10] llama *junk drawer* a los menús cuyo
> nombre no dice nada. Un `⋯` es, por definición, un nombre que no dice nada. Se compensa
> con dos cosas y ninguna es opcional: **(a)** su nombre accesible es específico —
> `aria-label="Acciones de SICOE-104"`, no «Más» —, y **(b)** el menú tiene un techo de
> **ocho ítems**. En cuanto haga falta el noveno, el problema no es el menú: es que se
> añadió una función que nadie pidió.

> **Y una segunda, sobre `title`.** [INFOTIPS] avisa de que los globos de ayuda se usan
> como «*a crutch for poor labeling*». Este documento propone `title` en varios sitios;
> ninguno de ellos puede ser el **único** portador del significado. El `title` es refuerzo:
> la etiqueta visible dentro del `⋯` y el `aria-label` del botón son los que cargan el
> sentido. Un `title` no lo ve quien navega con teclado ni lo anuncia de forma fiable un
> lector de pantalla.

---

## 5 · P1 · El flujo nuevo de capturar

### 5.1 · La decisión: se captura **en la fila**, no en el pie

`PieEdicion.tsx` argumenta que el formulario va al pie porque el único hijo válido de un
`role="tree"` es un `treeitem`, y meterle un formulario rompe el patrón. El argumento es
correcto **para un formulario**. Pero la app ya monta un `<input>` suelto dentro de un
`treeitem` cada vez que se renombra algo, y funciona: `CampoTitulo`.

Capturar es exactamente el mismo gesto que renombrar, con el texto vacío. Se reusa el
mecanismo que ya está probado en producción.

Lo que dice la literatura, hasta donde llega (§1.7 dice hasta dónde **no** llega):

- [TABLES] admite la edición en línea con una condición que aquí se cumple de sobra:
  «*Edit in place (where the table row becomes editable). This solution works only if the
  table is narrow*». La «tabla» aquí es **un solo campo de título**.
- [TABLES] también descarta la alternativa modal: «*the big downside with a modal
  implementation […] is that it will **cover adjacent records***». Y capturar la sexta
  tarea de una historia es justamente mirar las cinco anteriores.
- [MODAL] y [MARK-08] ponen precio a la interrupción: trabajar más rápido a costa de «*more
  stress, higher frustration, time pressure and effort*».
- [MODES] pone la condición: la fila en modo captura **tiene que verse distinta**, o hay
  *mode slip*. De ahí la banda de acento del wireframe de §5.3.

Lo que **sí** se queda en el pie: el formulario de bloqueo (tres controles, uno de ellos un
`select`) y el de compromiso cuando la ventana es angosta. Esos sí son formularios.

### 5.2 · Anatomía de la fila nueva

```
┌─ ÉPICA ──────────────────────────────────────────────────────────────────────────┐
│ ⠿  ▾  ◆  Módulo de regularización              ⚑2   ＋  ⋯   ▓▓▓░ 9/11   SICOE-98 │
└──┬──┬──┬───────────────┬────────────────────────┬───┬───┬──────┬─────────┬───────┘
   │  │  │               │                        │   │   │      │         └ clave, 88px
   │  │  │               │                        │   │   │      └ medidor, 84px
   │  │  │               │                        │   │   └ menú (24×24, siempre visible)
   │  │  │               │                        │   └ añadir (24×24, siempre visible)
   │  │  │               │                        └ contador de bloqueos
   │  │  │               └ título — crece, con elipsis
   │  │  └ glifo derivado, 14px (canal 1, intacto)
   │  └ chevron
   └ asa: 12px, **visible siempre** en --tinta-3 (ver §9.1: se queda a 12px
     porque Subir/Bajar también viven en el ⋯, que sí mide 24×24)

┌─ TAREA ──────────────────────────────────────────────────────────────────────────┐
│ ⠿     ●  Contrato y mock de la API de grupos   ⚑     ⋯        (sin medidor) SICOE-104│
└──────────────────────────────────────────────────────────────────────────────────┘
        └ la tarea NO lleva ＋: es la hoja. Una tarea hermana se añade desde la
          historia o con N.
```

**Por qué `＋` solo en contenedores:** las tareas son dos tercios de las filas y las más
estrechas; ahorrarles un botón devuelve 28 px al título, que con los datos reales
(«QA: pruebas extremo a extremo de grupos de regularización», 58 caracteres) ya se corta.

### 5.3 · El flujo, paso a paso

```
1. El usuario ve la épica plegada.        ▸ ◆ Módulo de regularización   ＋ ⋯  9/11
2. Pulsa ＋  (o N con la fila enfocada).
3. La épica se despliega si estaba plegada, y aparece una fila nueva
   AL FINAL de sus historias, ya en modo edición y con el foco dentro:

      ▾ ◆ Módulo de regularización                              ＋ ⋯  9/11
          ◐ Grupos de recursamiento                             ＋ ⋯   3/5
          ● Grupos extraordinarios                              ＋ ⋯   0/4
          ┃[ Título de la historia______________________ ]      ← foco aquí
             ↑ banda de 3px del acento: esto todavía no existe

4. Escribe y pulsa Enter  →  la historia se crea, la fila se convierte en fila real,
   y DEBAJO aparece otra fila vacía lista. Seis historias son seis títulos y seis Enter.
5. Esc cierra la fila vacía y devuelve el foco a la fila desde la que se empezó.
6. Enter sobre un campo vacío = Esc. No se crea nada sin título.
```

**Lo que cambia respecto de hoy:** desaparece el viaje a la barra superior y el viaje al
pie. El ojo no se mueve del sitio donde va a aparecer la cosa nueva.

**Lo que no cambia:** el encadenado (capturar no cierra), el auto-desplegado del camino, y
que el título vacío no crea nada. Eso ya está bien resuelto en `FormularioCaptura`.

### 5.4 · El caso que no tiene fila donde colgarse

Una épica nueva no cuelga de nada. Va en la cabecera del panel del árbol:

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ Backlog de SICOE      [En backlog|Terminadas]   ▓▓░ 24/38 · 1 sin desglosar     │
│                                       ＋ Nueva épica   Expandir todo    ?       │
└────────────────────────────────────────────────────────────────────────────────┘
```

Es la **única** captura que queda fuera de una fila, y es la única que se hace tres veces
al año. Va con `--solido-fondo` (relleno, no contorno): [MAT2-BTN] separa *text* (bajo
énfasis), *outlined* (medio) y *contained* (alto), y hoy «Capturar» es un *outlined*
haciendo de primario, que es la razón de que no se vea. [HIG-BUTTONS] pone el techo:
«*Keep the number of prominent buttons to **one or two per view***». Con esto hay **uno**
por panel. [FAB] enseña el fallo contrario con un ejemplo: «*A screen with 3 FABs makes it
hard to tell what the primary action should be*».

### 5.5 · El clic de la fila de contenedor

**No lo cambio.** Hoy un clic en la fila enfoca **y** pliega/despliega, que es la
convención de un explorador de archivos y el usuario ya la tiene incorporada. Lo que
estaba mal no era el doble efecto: era que **capturar dependiera de esa selección**. Con el
`＋` en la propia fila, la dependencia desaparece y el conflicto también.

Es la corrección más barata posible de P1: cero cambios en el manejo del clic.

### 5.6 · Los cuatro estados del panel del árbol

| Estado | Qué se ve | Texto exacto |
|---|---|---|
| **Cargando** | El armazón ya lo resuelve arriba (`Cargando`); el panel no tiene estado propio de carga: el JSON es local y tarda milisegundos. | «Abriendo el archivo de datos…» *(se queda como está)* |
| **Vacío — proyecto sin épicas** | Título, una línea, y **el botón**. Hoy no hay botón. | **«SICOE no tiene nada capturado»** · «Una épica es un bloque grande de trabajo; dentro van historias, y dentro tareas.» · `[＋ Capturar la primera épica]` |
| **Vacío — pestaña Terminadas** | Sin botón: no hay nada que hacer aquí. | **«Todavía no se ha cerrado ninguna tarea de SICOE»** · «Aquí aparecen en cuanto marques una como hecha.» |
| **Vacío — contenedor sin hijos** | No es un estado de panel: la fila lo dice sola con «sin desglosar» (regla 2). Con el `＋` al lado, además dice qué hacer. | *(sin texto nuevo)* |
| **Error de un comando** | La franja que ya existe, arriba. | «No se pudo capturar la historia.» + «No se escribió nada. Puedes volver a intentarlo.» *(se queda)* |
| **Sin permiso ≡ solo lectura** | El archivo cambió por fuera o no validó. **Los `＋` y los `⋯` se quedan, deshabilitados.** El motivo va una vez, en la franja. | «Solo lectura: el archivo cambió fuera de PM-care. Nada se está guardando.» + las salidas que ya ofrece `SoloLectura` |

> **Aquí cambié de opinión por una fuente.** Mi primer instinto fue **quitar** los `＋` y
> los `⋯` en solo lectura: 300 filas × 2 botones grises parecen ruido. [HIG-MENUBAR] dice
> lo contrario, y con un argumento que gana: «*Keeping menu items visible helps people
> learn what actions your app supports, even if they're unavailable in the current context.
> If a menu bar item isn't actionable, **disable the action instead of hiding it***». Y hay
> una razón de este código además: si desaparecen, **el árbol reflowea entero** al entrar y
> salir de solo lectura, y el usuario ve la app «cambiar de forma» sin haber hecho nada.
> Se quedan, en gris.

**Lo que se anuncia al cambiar de estado** (WCAG **4.1.3**, «*status messages can be
programmatically determined […] without receiving focus*»): al capturar, un `role="status"`
con «Historia SICOE-H14 capturada en Módulo de regularización». Hoy el usuario ve la fila
aparecer; quien navega con lector, no se entera de nada.

### 5.7 · Pantalla chica (< 1040 px)

El panel del sprint no se pinta y arrastrar deja de ser una opción. Bajo el rediseño:

- El `⋯` **gana importancia**: es la única forma con ratón de mandar algo al sprint. Ya
  está siempre visible, así que no hay nada que adaptar.
- La captura en fila funciona igual: vive dentro del árbol, que es lo único que hay.
- El pie de edición sigue existiendo para el compromiso y el bloqueo. Sin cambios.
- El panel de ayuda `?` se abre como hoja a ancho completo, no como popover.

---

## 6 · P2 · Dónde van Capturar y Deshacer

### 6.1 · Capturar

Deja de existir como botón global. Se reparte en tres, cada uno con su alcance dicho:

| Dónde | Qué crea | Alcance |
|---|---|---|
| `＋` en fila de épica | historia | esa épica |
| `＋` en fila de historia | tarea | esa historia |
| `＋ Nueva épica` en cabecera | épica | el proyecto abierto |

La tecla `N` sigue funcionando exactamente igual y **ahora se ve**: va en el `title` y en
el nombre accesible del `＋` («Nueva historia en Módulo de regularización · N»).

`CapturaEnSprint` (capturar directo en el Sprint global) no se toca: es un cuarto alcance
legítimo y ya tiene su botón en su propia cabecera, que es donde le toca por la regla de §4.

### 6.2 · Deshacer

**La fuente contesta la pregunta sin margen.** [HIG-UNDO]: «*Provide undo and redo buttons
**only when necessary**. People generally expect to initiate undo and redo in
system-supported ways, such as **choosing the items in a macOS app's Edit menu**, using
keyboard shortcuts…*». El botón de barra es la excepción, no la regla. Y hoy PM-care tiene
la excepción **sin tener la regla**: el botón existe y el menú no.

Sale de la barra superior y va a **dos** sitios, que no compiten:

**a) Menú de aplicación real** — `electron/main.ts` monta `Menu.setApplicationMenu` con un
menú Edición cuyo «Deshacer» apunta al comando de dominio, **no** a `role: 'undo'`. Es el
sitio donde un usuario de macOS busca deshacer, y hoy encuentra ahí una función que hace
otra cosa. El ítem lleva el nombre de lo que va a revertir, que es literal en [HIG-EDIT]
(«*Clarify the target of the undo […] append the item's title*») y en [HIG-UNDO] («*menu
item labels like Undo Typing or Redo Bold*»):

```
Edición
  Deshacer capturar SICOE-T14      ⌘Z
  ─────────────────────────────
  Cortar / Copiar / Pegar          (para los campos de texto)
```

Deshabilitado y en gris cuando la pila está vacía —que es exactamente la señal que hoy da
el botón deshabilitado de la barra, pero en el sitio estándar y sin gastar espacio
permanente. Es la misma regla de [HIG-MENUBAR]: deshabilitar, no ocultar.

`⌘Z` desde el renderer sigue como está: un solo escucha en `window`, con la excepción de
los campos de texto ya resuelta en `atajos.ts` — que además cumple [HIG-KEYS] («*Respect
standard keyboard shortcuts*») y deja pasar `⇧⌘Z` sin secuestrarlo, que es lo correcto
cuando no hay rehacer. El menú y el escucha llaman al mismo sitio.

**c) Y hay un tercer requisito que me faltaba, y lo pone [HIG-UNDO]:**

> «**Show the results of an undo or redo.** […] it's crucial to highlight the result of
> each undo and redo **to keep people from thinking that the action had no effect**.»

Deshacer «mover al sprint» de una tarea que está fuera de pantalla no produce hoy ninguna
señal: el usuario pulsa `⌘Z` y no pasa nada visible. **Al deshacer, la app tiene que llevar
el foco a lo que volvió y decir qué fue**, con el mismo `role="status"` de §5.6:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Deshecho: SICOE-T14 salió del sprint y volvió al backlog.          ✕   │
└────────────────────────────────────────────────────────────────────────┘
```

Y si lo que volvió está en otro proyecto o en una rama plegada, se despliega el camino y se
enfoca la fila — exactamente lo que ya hace `irATarea` para las vistas globales. El
mecanismo existe; solo hay que llamarlo desde deshacer.

**b) Franja de confirmación con deshacer al lado** — la app ya tiene `franja-aviso` para
los fallos. Se le añade el gemelo para los aciertos, con la acción de recuperación pegada
al momento en que se puede querer:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Capturada «Contrato y mock de la API».                    Deshacer  ✕  │
└────────────────────────────────────────────────────────────────────────┘
```

Aparece solo en mutaciones destructivas o difíciles de ver (eliminar, mover al sprint en
lote, cancelar, cerrar sprint) y se va sola. **No** aparece al capturar una tarea: ahí el
resultado ya se ve en el árbol y una franja por cada Enter en una captura encadenada sería
insoportable.

Esto es la «salida de emergencia» de la heurística 3 [HEUR-3] puesta donde se necesita. Y
justifica **no añadir más diálogos de confirmación**: [CONFIRM] reserva el diálogo para
«*actions with serious consequences*» y manda hacer lo otro — «*Do go to great lengths to
provide **undo**, because some user errors will remain despite even the best of confirmation
dialogs*». PM-care tiene hoy **una sola** confirmación —borrar un contenedor con hijos, con
el conteo en el botón— y está bien puesta. No se toca, y no se le añaden hermanas.

Cuando la pila se vacía por un cambio externo del archivo, la franja lo dice una vez:
«El archivo cambió fuera de PM-care. Ya no se puede deshacer lo anterior.» Eso es lo que
hoy solo se sabe apuntando al botón gris y leyendo su `title`.

### 6.3 · La barra superior resultante

```
ANTES  [☰]  SICOE  Sistema de control escolar          [Solo lectura] [Deshacer] [Capturar]
DESPUÉS[☰]  SICOE  Sistema de control escolar                             [Solo lectura]
```

Sin verbos. Solo dice dónde estás.

---

## 7 · P3 y P4 · Equipos, Personas y la barra lateral

### 7.1 · Equipos: uno solo

**Desaparece `Administración · Equipos`. `Vistas · Equipos` absorbe la edición.**

Dirección elegida, y por qué no la contraria:

1. La vista de consulta ya trae **lo que la de edición no puede enseñar**: el cruce
   «personas en más de un equipo» leído desde la persona, y la carga abierta por miembro.
   La de edición solo trae las mutaciones. Fusionar añadiendo controles a la rica es menos
   trabajo que reconstruir el cruce en la pobre.
2. No hay ninguna razón de dominio para separar leer de escribir: un usuario, una máquina,
   sin permisos. La separación era una consecuencia del orden de construcción (E11 antes
   que E12), no una decisión.
3. Costo: `SeccionEquipos.tsx` se borra entero (360 líneas); su `TarjetaEquipo` se muda
   dentro de la rejilla de `VistaEquipos`. Los comandos (`editarEquipo`) no se tocan, así
   que `tests/comandos/personas.test.ts` sigue verde sin mirarlo.

```
┌─ Equipos · 5 personas en 3 proyectos ──────────────────────────────────────────┐
│                                                                                │
│  Personas en más de un equipo                                       2 de 5     │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ Josue Vergara      [SICOE · backend] [INFRA · apoyo]      12 abiertas     │  │
│  │ Jesús Castillo     [SICOE · backend] [PED]                 7 abiertas     │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│  Equipos por proyecto                                                          │
│  ┌── SICOE ─────────────── 4 personas ──┐  ┌── INFRA ────────── 3 personas ─┐  │
│  │ JV Josue Vergara     backend   12 ab.⋯│  │ …                             │  │
│  │ JC Jesús Castillo    backend    7 ab.⋯│  │                               │  │
│  │ ─────────────────────────────────────  │  │                               │  │
│  │ ＋ Añadir del catálogo            ▾   │  │ ＋ Añadir del catálogo     ▾   │  │
│  │ ─────────────────────────────────────  │  └───────────────────────────────┘  │
│  │ ⚠ Con tareas abiertas aquí, fuera     │                                     │
│  │   del equipo:  Ana Ruiz        3 ab.  │                                     │
│  └───────────────────────────────────────┘                                     │
└────────────────────────────────────────────────────────────────────────────────┘
```

El `⋯` de cada miembro trae «Cambiar rol…» y «Sacar del equipo». Misma regla de §4: lo que
actúa sobre una fila, vive en su fila.

**Cuatro estados de Equipos:**

| | |
|---|---|
| Cargando | resuelto arriba, sin estado propio |
| **Vacío — no hay personas** | «No hay nadie en el catálogo» · «Un equipo se arma eligiendo del catálogo global de personas.» · `[Dar de alta a alguien]` → lleva a Personas |
| **Vacío — hay personas, ningún equipo** | «Ningún proyecto tiene equipo capturado» · «Mientras no lo tengan, "¿quién está en esto?" solo se contesta mirando quién es responsable de cada tarea.» · el `＋ Añadir del catálogo` de cada tarjeta ya está a la vista |
| Error | franja de arriba, sin cambios |
| **Solo lectura** | los `＋` y los `⋯` **se quedan, deshabilitados** (misma regla de §5.6 y [HIG-MENUBAR]); la franja explica el motivo una vez |

### 7.2 · Personas: se le quita la edición de equipos, como pidió

**Fuera:** el `chips-sel` de una casilla por proyecto en la ficha de cada persona.
Su razón se sostiene (§2.6) y hay una segunda razón más fuerte: ese camino no puede poner
el rol, así que nunca termina lo que empieza.

**Se queda, como etiqueta de solo lectura:** los chips que dicen en qué proyectos está.
Leerlo desde la persona es útil y no cuesta ancho. Lo que se quita es la casilla.

**Matiz que propongo, y que él puede rechazar:** en el **alta** de una persona, en vez de
once casillas, **un solo desplegable de proyecto y un campo de rol al lado**:

```
┌─ Dar de alta ────────────────────────────────────────────────────────┐
│ Nombre  [_________________________]                                  │
│ Entra a [SICOE            ▾]  como [backend______]   (opcional)      │
│                                                     [Dar de alta]    │
└──────────────────────────────────────────────────────────────────────┘
```

Motivo: dar de alta a alguien casi siempre es darlo de alta **para un proyecto**, y
quitarlo del todo obliga a un segundo viaje en el caso normal. Un desplegable no crece con
el número de proyectos, así que el problema que él señaló no reaparece. Y con el rol al
lado, la pertenencia nace completa. **Pregunta abierta 1** si prefiere quitarlo entero.

### 7.3 · La barra lateral

Hoy: 7 vistas + 11 proyectos + 3 secciones de administración = **21 entradas en 3 grupos**,
con «Equipos» apareciendo dos veces.

Con Equipos fusionado, el grupo «Administración» se queda con dos entradas, y su
justificación escrita —«estas editan el catálogo»— deja de ser cierta, porque Equipos
ahora edita desde arriba. Mantener la palabra sería pedirle al usuario que aprenda una
distinción que la interfaz ya no respeta.

**No cuento clics.** [3CLICKS] y [PORTER-03] dejaron claro que la profundidad por sí sola
no predice nada; lo que predice es el **olor informativo** de cada etiqueta [SCENT]: «*Link
names should be clear and self-explanatory. If the link name is too obscure and vague,
people might miss a good source of information*». «Administración» es exactamente una
etiqueta vaga: no dice qué hay dentro, dice de qué categoría es. Y [HIG-MACOS] apunta en la
misma dirección para escritorio: «*present more content in **fewer nested levels***».

Tampoco se trata de aplanarlo todo. [FLAT-DEEP] avisa de los dos extremos: «*going too far
to either extreme will backfire*», y que en jerarquías profundas «*there are only a few
categories on each level, they tend to be more generic and, thus, more confusing*». Cuatro
grupos con nombre concreto son menos genéricos que tres con uno abstracto — la cuenta de
niveles sigue siendo la misma (lateral → vista), lo que cambia es qué prometen las
etiquetas.

**Propuesta:** cuatro grupos nombrados por lo que se va a hacer, sin la palabra
«Administración», y cada sustantivo apareciendo una sola vez.

```
┌──────────────────────┐
│ HOY                  │   lo que pide una decisión ahora
│  ◈ Panorama          │
│  ◈ Sprint 12         │
│  ◈ Bloqueos      ⚑7  │
├──────────────────────┤
│ PROYECTOS        ＋  │   ← el ＋ da de alta (hoy: Administración · Proyectos)
│  SIC SICOE       ⚑3  │
│  INF INFRA           │
│  PED PED             │
│  …                   │
├──────────────────────┤
│ REGISTRO             │   lo que ya pasó
│  ◈ Terminadas        │
│  ◈ Backlog del área  │
├──────────────────────┤
│ GENTE                │
│  ◈ Carga por persona │
│  ◈ Equipos           │   ← una sola vez, y editable
│  ◈ Personas          │
└──────────────────────┘
```

Cerrar y eliminar un proyecto pasan al `⋯` de su fila en esta lista — misma regla de §4.
Eso vacía `Administración · Proyectos` como pantalla; su flujo de borrado con confirmación
por clave escrita a mano se conserva tal cual, solo cambia desde dónde se llama.

**Costo:** este punto es el más caro de la sección y el menos urgente. Va en el nivel 3 de
la tabla, y se puede partir: renombrar los grupos cuesta minutos; mover el alta de
proyectos al `＋` cuesta una tarde.

---

## 8 · P5 · Qué texto se va, qué se queda y dónde vive lo que se queda

### 8.1 · El criterio, en una regla

> **Un texto se queda si nombra un control o una tecla. Se va si explica una regla.**
> Si una función necesita una nota al pie para entenderse, el problema es la función.

Esa última frase no es mía. [INFOTIPS] la dice así: los textos de ayuda «*are often abused
as **band aids** in the interface, used to: cram in explanations that should've been
designed into the UI*», y la prohibición es literal: «*Don't: use info tips as a **crutch
for poor labeling** or dense layouts*». [HEUR-8] pone el precio: «*every extra unit of
information in an interface **competes** with the relevant units of information and
**diminishes their relative visibility***».

Con una excepción, que es la única prosa que se gana el sitio: **los estados vacíos**. Ahí
no hay datos compitiendo por los píxeles y la persona está atascada — es el caso que
[HELP-10] admite: ayuda «*focused on the user's task*», con «*concrete steps*» y «*not too
large*».

### 8.2 · Lo que se borra

| Qué | Cuántos | Por qué |
|---|---|---|
| **Todos los `<NotaPie>`** | 10 | Explican el modelo a quien inventó el modelo. |
| `bloque__nota` explicativos de Administración | ~8 de 12 | Ídem. Se salvan los que son advertencia de consecuencia irreversible. |
| `seccion__aclaracion` | 4 | Párrafos que justifican una sección ya visible. |
| `__pista` bajo el formulario de captura | 1 | «Enter captura y deja el campo listo para la siguiente» — el comportamiento ya lo enseña el primer Enter. |
| La **nota** de `Leyenda` (2 frases) | 1 | «El bloqueo es bandera, no estado…» pasa al panel de ayuda. |
| La **fila de 8 atajos** de `Leyenda` | 1 | Pasa al menú `⋯`, pegada a cada acción. |
| Nota de virtualización de `VistaBacklog` | 1 | Es una nota del programador que salió empaquetada. |
| «Crear uno desde la app llega en E7…» | 1 | Caducado: E7 se entregó. |

**Ejemplos concretos de reescritura, no de borrado:**

| Hoy | Mañana |
|---|---|
| `VistaTerminadas`: «Son conteos de **tareas**, no de esfuerzo. Una tarea de dos horas y una de dos semanas suman igual: la serie dice cuántas cosas se cerraron, no cuánto trabajo se hizo. PM-care no estima, así que no hay velocidad ni proyección.» (39 palabras) | La cabecera ya dice «*N* **tareas**». El sustantivo hace el trabajo. **0 palabras.** |
| `VistaBloqueos`: «Grupos y filas ordenados por **días detenido**, del más viejo al más nuevo. El más viejo lleva *N* días · en *N* proyectos · *N* de *N* están comprometidos en el sprint activo» | Orden: **«Más días detenido primero»** (4 palabras, se queda). Las tres cifras suben a la cabecera, donde son dato y no prosa: «Bloqueos · *N* · *N* proyectos · el más viejo, *N* días». |
| `VistaBacklog`: «Se pintan las *N* filas visibles sin virtualizar…» | Se borra. Si algún día hace falta virtualizar, lo dirá el cronómetro, no la app. |

### 8.3 · Lo que se queda visible siempre

1. **Etiquetas de control.** «Al sprint», «Expandir todo», «Nueva épica». Son nombres, no
   explicaciones.
2. **La tecla, junto a la acción que ejecuta**, dentro del `⋯` y en el `title`/nombre
   accesible de cada botón. Es lo que el usuario pidió explícitamente: *«qué teclas hacen
   qué acción»*.
3. **`ReglaOrden`, en dos vistas y reducida a ≤10 palabras:** Panorama (donde el orden lo
   elige un selector y cambia) y Bloqueos (donde el orden es la información). Se borra de
   las otras tres.
4. **Los 8 estados vacíos**, cada uno con su botón. Ninguno describe la pantalla; todos
   dicen el siguiente paso.
5. **Las advertencias de lo irreversible.** «No hay deshacer para un borrado ya escrito:
   se recupera restaurando un respaldo.» Esa se queda, y se muda al propio diálogo de
   borrado, donde se lee justo antes de decidir.

### 8.4 · Dónde vive lo que se queda: una sola puerta

Toda la referencia que hoy está esparcida —los cinco glifos, los tres canales, la lista de
teclas— entra en **un panel, detrás de un `?` en la cabecera del panel del árbol**. La
misma puerta, en el mismo sitio, en todas las vistas que la tengan.

Eso no es solo orden: es **WCAG 2.2 SC 3.2.6 Consistent Help (nivel A)**, que exige que un
mecanismo de autoayuda repetido en varias pantallas «*occur in the same order relative to
other page content*». Hoy la ayuda está en 45 sitios y en ninguno dos veces igual: es
justo lo que ese criterio existe para evitar.

```
┌─ Cómo se lee esto ────────────────────────────────────  ✕ ─┐
│                                                            │
│  ESTADO — la forma del glifo                               │
│   ○ Pendiente   ◐ En curso   ● Hecha   ⊘ Cancelada         │
│   ◇ Sin desglosar — el contenedor no tiene tareas todavía  │
│                                                            │
│  ┃ NO PLANEADO — banda al borde. Es de dónde vino,         │
│    no en qué estado está.                                  │
│                                                            │
│  ⚑ BLOQUEADA — bandera, no estado: la tarea conserva su    │
│    glifo, para saber a qué vuelve al desbloquearse.        │
│                                                            │
│  Las canceladas no cuentan en ningún total.                │
│                                                            │
│  TECLAS  (sobre la fila enfocada)                          │
│   ↑ ↓ ← →  moverse y plegar        ⌥↑ ⌥↓  subir y bajar    │
│   N  nueva                          S  al sprint           │
│   Espacio  cambiar estado           Enter  renombrar       │
│   B  bloquear    C  cancelar        ⌫  eliminar            │
│   ⌘Z  deshacer                                             │
└────────────────────────────────────────────────────────────┘
```

**Balance:** ~45 bloques permanentes → **~14** (8 estados vacíos + 2 reglas de orden +
confirmaciones) **+ 1 panel bajo demanda**.

### 8.5 · El pie del árbol después de la poda

La `Leyenda` no se borra: se **encoge** a lo que de verdad se consulta de reojo mientras se
mira el árbol —los cinco glifos con su nombre— y suelta los atajos y la nota.

```
ANTES  ○ Pendiente ◐ En curso ● Hecha ⊘ Cancelada ◇ Sin desglosar ┃No planeado ⚑Bloqueada
       [en el sprint]
       N nueva · S al sprint · Espacio estado · Enter renombrar · B bloqueo · C cancelar ·
       ⌫ eliminar · ⌥↑↓ reordenar · ⌘Z deshacer
       El bloqueo es bandera, no estado: la tarea conserva su glifo. Los contenedores
       derivan el suyo; las canceladas no cuentan. Se arrastra por el texto para mandar al
       sprint y por el asa (⠿) para reordenar entre hermanas: una épica se lleva sus
       historias y sus tareas.                                       ← 4 renglones

DESPUÉS ○ Pendiente ◐ En curso ● Hecha ⊘ Cancelada ◇ Sin desglosar ┃No planeado ⚑Bloqueada
                                                                     ← 1 renglón
```

Tres renglones recuperados en el panel más denso de la app.

---

## 9 · Accesibilidad y color

### 9.1 · Tamaño de objetivo — SC 2.5.8, y la excepción que lo resuelve barato

Seis clases están por debajo del mínimo de 24×24 px (§2.8). **La salida no es agrandarlas
todas**: el criterio trae una excepción que encaja exactamente con lo que ya proponía §4.

> **Equivalent** — «The function can be achieved through **a different control on the same
> page** that meets this criterion.»
> — [Understanding SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

Como el menú `⋯` nace con 24×24 y contiene **Subir**, **Bajar**, **Al sprint** y **Marcar
en curso**, los tres controles minúsculos que hacen esas mismas funciones quedan cubiertos
por la excepción sin tocar ni un píxel de la sangría del árbol.

Comprobé también la otra excepción, **Spacing**, y **no** sirve aquí: exige que un círculo
de 24 px centrado en cada objetivo no se corte con el de otro, y el asa (12 px), el chevron
(14 px) y el glifo (14 px) van pegados en 40 px de ancho. Los círculos se cortan. Decirlo
importa porque es la excepción que uno invoca por inercia.

| Clase | Arreglo | Fundamento | Costo |
|---|---|---|---|
| `.asa` 12×26 | **Se queda a 12 px**, pero **visible siempre** en `--tinta-3`. | 2.5.8 por *Equivalent* (Subir/Bajar en el `⋯`) · visibilidad por [MENUS-25] | CSS, 2 líneas |
| `.fila__accion` 18 px | Desaparece: pasa al `⋯` | ya contado en §4 | — |
| `.glifo--boton` 14×14 | Se queda; gana `aria-label` con el estado siguiente | *Equivalent* («Marcar en curso» en el `⋯`) | 1 línea |
| `.cab__accion` ~19 px | Subir a 24 px de alto | sin equivalente en ningún otro control | CSS, 1 línea |
| `.alternador button` ~18 px | Subir a 24 px de alto | ídem | CSS, 1 línea |
| `.mini` 20 px **y** 22 px | Subir a 24 y **borrar la declaración duplicada** | ídem + defecto real | CSS, 2 líneas |

Ninguna de estas cambia la densidad de filas: son controles, no renglones. Y **SC 2.5.5
(AAA, 44×44) no se persigue y se declara**: es incompatible con las 30 filas por pantalla
que el producto necesita, y fingir que se busca sería peor que decir que no.

### 9.2 · El asa deja de esconderse

El argumento no es mío. [MENUS-25] lo dice como prohibición: «*Don't: tuck them away in
hover-only states or reduce their visual salience in an attempt to make the interface feel
light and minimalistic*», porque «*overly subtle visual design decreases discoverability*».
[HIDDEN-NAV] le pone cifra: esconder cuesta **más de un 20 % de descubribilidad**, y en
escritorio los usuarios fueron **al menos un 39 % más lentos**, con un **21 % más** de
dificultad percibida.

Y hay un argumento interno que cierra el caso: hoy **la leyenda tiene que explicar el asa**
—«y por el asa (⠿) para reordenar entre hermanas»— precisamente porque no se ve. Esa
leyenda es justo lo que estamos borrando en §8. Si el asa se ve, la línea sobra; si se
esconde, la línea es obligatoria. No se puede tener las dos cosas.

Contra-argumento previsible («seis puntos grises en 300 renglones es ruido»): por eso va en
`--tinta-3`, el mismo tono que ya tienen el chevron y la clave, que también están en todos
los renglones y nadie los llama ruido. [CHROME] descarta además el argumento del espacio:
«*a tiny icon is easier to overlook on a large screen than on a small one*», y esto es una
app de escritorio.

### 9.3 · Orden de foco, y lo que no se toca

El árbol tiene **una sola parada de tabulador** (roving tabindex) y los botones de fila van
con `tabIndex={-1}`. Eso se conserva: `＋` y `⋯` también nacen con `tabIndex={-1}` y se
llegan con `N` y con una tecla nueva para el menú. **300 filas × 2 botones = 600 paradas de
tabulador es lo que hay que evitar**, y es lo que el diseño actual ya evitó bien.

El menú `⋯` sí atrapa el foco mientras está abierto, con `Escape` para cerrar y devolverlo
a la fila. Es la parte del rediseño que más cuidado pide y no hay librería que lo resuelva
(la app no admite dependencias nuevas de UI, `CLAUDE.md`).

### 9.4 · Color

**La paleta ya está hecha y medida.** `maqueta/tema.html` es la entrega de `diseno`: acento
separado por luminancia y no por matiz —porque con cuatro señales vivas ya no quedaba
matiz seguro— y `--completa-*` para la épica terminada. Solo falta copiar los tokens a
`base.css` y rellenar el selector `data-derivado="hecha"` que ya está en el DOM.

Es el punto de mejor relación entre lo que el usuario va a sentir («colores de buen gusto»)
y lo que cuesta: **son valores de token, ningún componente cambia**.

La restricción que va con él, escrita ya en `arbol.css` y que repito porque es fácil de
romper: **el verde de la épica terminada tiene que recular, no destacar.** Con cinco épicas
cerradas, cinco bloques verdes sólidos convierten el panel en un semáforo y hacen que lo
terminado —que ya no pide ninguna decisión— grite más que lo pendiente, que es lo único
que se mira. [HIERARCHY] lo dice en una frase: «*If everything is contrasted, then nothing
stands out*». Por eso `--completa-lavado` mide 1.09:1 contra el panel: se nota, no llama.

Y el acento nuevo tiene una sola función, que es la que [COLOR] le asigna: «*Reserve the
accent color for what you want to stand out the most on your page — for example, the
primary call to action*». En PM-care eso es **interacción y nada más**: foco, línea de
inserción, banda de la fila en modo captura, botón primario del panel. Nunca un estado —
los estados ya tienen sus cuatro tonos y su forma.

Y las reglas duras del `CLAUDE.md` siguen mandando, que además coinciden con **WCAG 1.4.1**
(«*Color is not used as the only visual means…*»): verde solo con `estado === 'hecha'`
(regla 4), nunca por redondeo; ningún porcentaje sin su conteo (regla 3); contenedor vacío
dice «sin desglosar» (regla 2); los tres canales no se pisan (regla 17).

---

## 10 · La tensión, y dónde cedo

«Tan simple que un niño de 5 años pudiera usarla» tira contra once proyectos y más de mil
tareas. Es una tensión real y estas son las tres decisiones donde la resuelvo, diciendo
qué pierdo:

**Cedo en cuántas acciones se ven a la vez, no en cuántos datos.**
Tres controles permanentes por fila (glifo, `＋`, `⋯`). Todo lo demás, dentro del `⋯`
[PROGRESSIVE].
*Lo que pierdo:* mandar una tarea al sprint con ratón pasa de un clic a dos.
*Por qué acepto:* porque el clic extra no cuesta lo que parece. [PORTER-03] midió más de
**8 000 clics en 620 tareas** y no encontró más abandono a los tres clics que a los doce:
«*The satisfaction of users doesn't depend on the number of clicks*». [3CLICKS] lo remata:
la regla de los tres clics «*has not been supported by data in any published studies to
date*». Y además la ruta de un clic no desaparece: arrastrar sigue siendo un gesto y `S`
sigue siendo una tecla — pasan a ser aceleradores de verdad, en el sentido de [ACCEL], en
vez del único camino.

**Cedo en dónde vive la explicación, no en si existe.**
Todo a un panel `?` [HELP-10] [ONBOARD]. *Lo que pierdo:* un usuario nuevo tiene que
abrirlo una vez. *Por qué acepto:* la alternativa es pagar cuatro renglones de leyenda y
diez notas al pie en cada sesión, para siempre, por una lectura que se hace el primer día.
[ONBOARD] llama a eso *push*: «*reveal new information out of context, without any specific
indication that the user would benefit from the information at that moment*».

**No cedo en densidad, y tengo con qué defenderlo.**
Las filas siguen a 26/28/32 px, el medidor sigue trayendo su conteo crudo, la clave sigue
en su columna. [DENSITY] es explícito: «*Higher information density = less need to move
around and higher likelihood that you see what you want*». Bajar la densidad no simplifica:
obliga a navegar más.

La aparente contradicción con [HEUR-8] —«*every extra unit of information competes with the
relevant units*»— se resuelve mirando **qué** es lo que compite. Los 45 bloques de texto
explicativo compiten con los datos y pierden los datos. Los datos no compiten con los
datos. **Por eso se borran 31 párrafos y no se borra ni una fila.**

**Lo que no toco:** los dos arrastres (regla 10). Cuerpo de la fila → al sprint; asa →
reordenar entre hermanas. Funcionan, están probados, cada uno viaja con su MIME y no se
confunden. Lo único que cambia es que el asa **se ve** — que es lo que hoy le falta al
gesto para ser descubrible.

---

## 11 · Tabla de prioridad

Costo estimado en jornadas de `frontend`. «Riesgo» es probabilidad de romper algo que hoy
funciona, teniendo en cuenta que **ninguna prueba cubre el renderer**.

### Nivel 1 — primero. Barato o duele mucho.

| # | Cambio | Archivos | Costo | Riesgo | Resuelve |
|---|---|---|---|---|---|
| 1.1 | Aplicar los tokens de `maqueta/tema.html` a `base.css` + rellenar `data-derivado="hecha"` | `base.css`, `arbol.css` | **0.5 j** | bajo | color |
| 1.2 | Borrar los 10 `NotaPie`, los `bloque__nota` explicativos, `seccion__aclaracion`, el `__pista` y la nota de la leyenda. Arreglar el copy caducado de E7 | ~12 archivos | **0.5 j** | muy bajo | P5 |
| 1.3 | Asa **visible siempre** (se queda a 12 px, cubierta por la excepción *Equivalent* una vez exista el `⋯`); subir `.cab__accion`, `.alternador button` y `.mini` a 24 px; borrar el `.mini` duplicado | 3 CSS | **0.25 j** | muy bajo | accesibilidad · SC 2.5.8 |
| 1.4 | `＋` siempre visible en fila de épica y de historia, disparando la captura que ya existe | `Arbol.tsx`, `arbol.css` | **1 j** | bajo | **P1 (~70 %)** |
| 1.5 | Quitar «Capturar» y «Deshacer» de la barra superior; `＋ Nueva épica` en la cabecera del panel con `--solido-fondo` | `BarraHerramientas.tsx`, `VistaProyecto.tsx` | **0.5 j** | bajo | P2 |
| 1.6 | Menú de aplicación real en `main.ts` con Edición ▸ Deshacer atado al comando de dominio (hoy el del menú hace otra cosa) | `main.ts`, `preload.ts`, `App.tsx` | **1 j** | medio | **P2 · defecto** |

**Total nivel 1: ~3.75 jornadas.** Con esto solo, cinco de las seis quejas se sienten
atendidas; la que queda entera es la duplicación de Equipos (nivel 3).

**Si solo hubiera dinero para tres cosas:** 1.4 (`＋` en la fila), 1.2 (borrar el texto) y
1.1 (la paleta). Una jornada y media, y es lo que él va a notar al abrirla.

### Nivel 2 — después. Es lo que permite borrar la leyenda de atajos.

| # | Cambio | Archivos | Costo | Riesgo | Resuelve |
|---|---|---|---|---|---|
| 2.1 | Captura **en la fila** reusando el mecanismo de `CampoTitulo`, con encadenado y Esc | `Arbol.tsx`, `PieEdicion.tsx` | **2 j** | **alto** — toca `filas`, teclado y `aria-posinset` | **P1 (100 %)** |
| 2.2 | Menú `⋯` por fila, accesible, con las teclas al lado de cada acción. Absorbe «Al sprint» | componente nuevo + `Arbol.tsx` | **2.5 j** | **alto** — foco atrapado, sin librería | **P6** |
| 2.3 | Panel `?` «Cómo se lee» + «Teclas»; encoger `Leyenda` a los cinco glifos | `Leyenda.tsx`, componente nuevo | **1 j** | bajo | P5 |
| 2.4 | Franja de confirmación con «Deshacer» para las mutaciones destructivas | `App.tsx`, `almacen.tsx` | **0.5 j** | bajo | P2 |
| 2.5 | **Enseñar el resultado de deshacer**: `role="status"` + llevar el foco a lo que volvió, reusando `irATarea` | `App.tsx`, `interfaz.tsx` | **0.5 j** | bajo | P2 · [HIG-UNDO] |
| 2.6 | `role="status"` al capturar (SC 4.1.3) | `Arbol.tsx` | **0.25 j** | muy bajo | accesibilidad |
| 2.7 | Estado vacío del árbol con botón; revisar los 8 estados vacíos | `Arbol.tsx`, `piezas.tsx`, `Avisos.tsx` | **0.5 j** | bajo | P5 |

**Total nivel 2: ~7.25 jornadas.** 2.1 y 2.2 son los dos únicos puntos de riesgo alto del
documento entero.

**Dependencia que hay que respetar:** 1.3 deja el asa a 12 px apoyándose en la excepción
*Equivalent* de SC 2.5.8, y esa excepción **solo es cierta cuando existe el `⋯` (2.2)**.
Si el nivel 2 se abandona a medias, hay que volver a 1.3 y ensanchar el asa a 24 px
moviendo la sangría. Está dicho aquí para que no se olvide.

### Nivel 3 — cuando haya calma. Ninguno duele hoy.

| # | Cambio | Archivos | Costo | Riesgo | Resuelve |
|---|---|---|---|---|---|
| 3.1 | Fusionar Equipos: `VistaEquipos` absorbe la edición, se borra `SeccionEquipos` | 2 archivos, uno se borra | **1.5 j** | bajo | **P3** |
| 3.2 | Quitar el `chips-sel` de equipos de la ficha de persona; alta con un proyecto + rol | `SeccionPersonas.tsx` | **1 j** | bajo | **P4** |
| 3.3 | Renombrar los grupos de la lateral (Hoy · Proyectos · Registro · Gente); quitar la palabra «Administración» | `BarraLateral.tsx`, `registro.ts` | **0.5 j** | bajo | P3 |
| 3.4 | Mover alta/cierre/eliminación de proyecto al `＋` y al `⋯` de la lista lateral; vaciar `SeccionProyectos` como pantalla | `BarraLateral.tsx`, `SeccionProyectos.tsx` | **1.5 j** | medio | P3 |

**Total nivel 3: ~4.5 jornadas.**

### Se puede dejar para siempre

- Virtualizar el árbol. `VistaBacklog` ya vigila el umbral; hasta que el cronómetro diga
  algo, no.
- Rehacer los estados vacíos de las vistas globales. Están bien escritos; solo les faltan
  botones (3.x los recoge).
- Un tema propio con interruptor. La app sigue al sistema y eso es lo correcto en macOS.

---

## 12 · Preguntas abiertas

Cosas que no pude decidir sin información que no está en el código.

1. **El alta de persona: ¿un desplegable de proyecto + rol, o nada?** Propuse conservar un
   desplegable de uno (§7.2) porque dar de alta a alguien suele ser darlo de alta *para*
   algo. Él pidió quitarlo del lado de personas. Si prefiere quitarlo entero, se quita y el
   alta queda con un solo campo — y el segundo viaje a Equipos se acepta como costo.

2. **¿La clave (`SICOE-104`) tiene que verse siempre?** Ocupa 88 px fijos en cada renglón,
   que es exactamente lo que el `＋` y el `⋯` necesitan. Si la clave solo se usa para
   copiar y pegar en Jira, podría aparecer al seleccionar la fila y devolver el ancho al
   título, que con los datos reales ya se corta. Depende de con qué frecuencia mira la
   clave sin querer copiarla.

3. **¿Cuántas épicas tiene de verdad un proyecto suyo?** Con 4–6, la captura en la fila es
   gratis. Con 40, hay que decidir si el `＋` se pinta en todas o solo en la que tiene el
   foco. Los datos de ejemplo traen 3 proyectos y 8 épicas; los reales son 11 proyectos.

4. **¿Cuántas veces al día abre Equipos?** Si es una al mes, no merece entrada propia en la
   lateral y podría ser una pestaña de «Carga por persona». Si es diaria, la propuesta de
   §7.3 se queda como está.

5. **Pruebas de renderer antes de tocar `Arbol.tsx`.** Los puntos 2.1 y 2.2 son los de
   riesgo alto y no hay ni una prueba que los cubra. Añadir `vitest` + `jsdom` +
   `@testing-library/react` son **tres dependencias de desarrollo nuevas**, y `CLAUDE.md`
   exige justificarlas por escrito y pedir autorización. Mi recomendación es pedirla antes
   del nivel 2, no después. Decisión suya.

6. **El `⋯` sin librería.** La app prohíbe dependencias de UI. Un menú accesible a mano
   —foco atrapado, `Escape`, flechas, posicionamiento que no se salga del panel— son unas
   200 líneas bien hechas. La alternativa barata es un `<select>` disfrazado, que el
   sistema resuelve pero se ve como un `<select>`. Habría que verlo antes de decidir.

---

## 13 · Lo que no pude resolver sin verlo usar la app

- **No sé si «no es fácil agregar items internos» es descubrimiento o esfuerzo.** Si no
  sabía que existía `N`, el `＋` visible (1.4) lo cura entero y el nivel 2 sobra para P1. Si
  lo sabía y lo que cansa es el recorrido, hace falta la captura en la fila (2.1). Propongo
  los dos porque no puedo distinguirlos desde el código, y eso es más caro de lo
  necesario. **Diez minutos mirándolo capturar seis tareas ahorran dos jornadas.**

- **No sé si el clic que pliega la épica le estorba.** Decidí no tocarlo (§5.5) porque es
  la convención del Finder, pero es exactamente el punto donde su queja empieza
  («no es fácil desplegar para agregar»).

- **No sé si la banda de «no planeado» y el chip «en el sprint» le sirven o son ruido.**
  Los dejé intactos porque son reglas duras del producto, pero son dos de los tres canales
  que la leyenda tiene que explicar. Si uno de los dos no se usa, la leyenda encoge otro
  renglón.
