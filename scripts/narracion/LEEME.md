# Biblia narrada con varias voces (Reina Valera Gómez)

El pastor pidió toda la Biblia narrada: un narrador, Jesús con su voz, y cada persona que habla con otra voz
(mujeres con voz de mujer, niños con voz de niño, mayores con voz mayor). Orden: Mateo → Apocalipsis, después Génesis → Malaquías.
Él va a escuchar con los meses y avisar los errores; no hay que esperarlo entre libros.

## Cómo se hace cada capítulo
1. Leer el capítulo en `src/data/bible/rvg/LL.json` (LL = libro de 00 a 65; Mateo es 39).
2. Escribir `scripts/narracion/tags/LL/CC.txt`: una línea por cada cita hablada (formato arriba de `armar.py`).
   Con MUCHO cuidado: la cita termina donde deja de hablar la persona. Si una persona sigue hablando en la oración siguiente, va en la misma cita.
   Lo que "dijo el profeta" (citas del Antiguo Testamento) lo lee el narrador, salvo que lo diga una persona dentro de su propia cita.
   Los capítulos sin diálogo (cartas, salmos, leyes) no llevan archivo de tags: los lee todo el narrador.
3. `python3 scripts/narracion/armar.py LL CC` → deja `planes/LL-CC.json`. Revisar la lista que imprime.
4. Subir los planes (commit a main) y bajarlos en el sandbox de Higgsfield:
   `curl -fsS -o nar/LL-CC.json https://raw.githubusercontent.com/10xchurch-coder/la-mies/main/scripts/narracion/planes/LL-CC.json`
5. Por cada tanda: `generate_audio_batch` con `requests: {"ref": "sandbox:~/nar/LL-CC.json#/batches/N"}` (máximo 8 a la vez), después `jobs_wait`.
6. `python3 scripts/narracion/juntar.py LL CC /home/claude/audio-rvg  nombre0 nombre1 ...` (los nombres en orden de index).
7. `bash scripts/narracion/subir.sh` → rama `audio-rvg` + `index.json`. La app (`src/lib/bibleAudio.ts`) ya lo toma sola.
8. Anotar en `scripts/narracion/AVANCE.md` hasta dónde se llegó y cuántos créditos quedan (`balance`). Si quedan menos de 100 créditos, parar y decirlo.

## Voces (ids en armar.py)
Narrador: Andre. Jesús: Xavier. Dios Padre: Marcus. Ángeles: Gideon. Hombres: Desmond, Sterling, Arthur, Julian. Mayores: Desmond, Arthur.
Mujeres: Elena, Naomi, Helena, Soraya. Niños: Benji.

## Cuatro tareas a la vez (desde el 25 nov 2026, el pastor pidió ir más rápido)
Cada tarea narra su parte y anota en su propio archivo, para no pisarse:
- A: Mateo → Apocalipsis (libros 39 a 65) → `AVANCE.md`
- B: Génesis → 1 Samuel (libros 00 a 08) → `AVANCE-B.md`
- C: 2 Samuel → Salmos (libros 09 a 18) → `AVANCE-C.md`
- D: Proverbios → Malaquías (libros 19 a 38) → `AVANCE-D.md`
Si `git push` a main falla porque otra tarea subió antes: `git pull --rebase origin main` y de nuevo. `subir.sh` ya reintenta solo.
Cuando una tarea termina su parte, escribe TERMINADO arriba de su archivo.
