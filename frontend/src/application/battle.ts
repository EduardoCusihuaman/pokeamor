/**
 * Batallas/duelos de refinamiento (aplicación + motores, sin Svelte).
 *
 * Extraído de `src/app.js`: `cueBattleEntrance`, `battleFeedback`,
 * `markBattleChoice`, `battleProgressState`/`paintBattleProgress`/
 * `commitBattleProgress`, `refinementFavorites`, `validRefinementSession`,
 * `prepareRefinementPair`, `prepareAutomaticBattle`/`clearAutomaticBattle` y la
 * promoción de `renderDiscovery`.
 *
 * El módulo es independiente del framework: no importa Svelte ni consulta
 * `window`, el DOM global, `performance`, `Math.random` ni storage. Todo el
 * I/O y el estado compartido se inyectan desde el adaptador de presentación.
 *
 * Contratos preservados del legacy (plan §5.2/§5.4):
 * - La entrada de batalla mueve cada mitad ±22 px (eje vertical en pantallas
 *   angostas, horizontal en `battle-wide`), impacta a los 140 ms y programa la
 *   respiración a los 1150 ms. Una animación dura 280 ms y el rayo 740 ms.
 * - `prefers-reduced-motion` cancela por completo animaciones y temporizadores.
 * - La preparación de una pareja espera `artReady` **y** `cardReady` **y**
 *   `naturalWidth > 0`; una imagen `complete` pero vacía no cuenta. El timeout
 *   es de 22000 ms y un fallo deja la pareja reintentable.
 * - La batalla automática espera las DOS imágenes decodificadas, conserva los
 *   mismos nodos y libera ambos si el reset o un favorito cambian.
 * - La promoción espera a que terminen el swipe saliente y el dedo activo.
 * - Los puntos de progreso usan la firma `total:active`, marcan `filled` para
 *   `i < done`, `current` para `i === done` y mantienen el último círculo lleno
 *   durante 650 ms (limpieza a los 660 ms) aunque la sesión se desmonte.
 *
 * Seams de presentación diferidos:
 * - El adaptador debe crear los nodos reales (`<span>`, `<img>`, `<button>`),
 *   escuchar `pointerdown`/`keydown` y escribir en `eventLayer`/`#front-refine`.
 * - `sound`, `tactile`, `adaptiveBlock`, `exitRefinement` y el montaje de la
 *   siguiente pareja siguen siendo orquestación de la capa de presentación.
 * - El layout (`ResizeObserver`, `innerWidth >= 760`) se inyecta como
 *   `isWide`; este módulo no mide la ventana.
 */

/* -------------------------------------------------------------------------- */
/* Tipos compartidos de carta y temporizadores                                */
/* -------------------------------------------------------------------------- */

/** Carta mínima que necesita una batalla de refinamiento. */
export interface BattleCard {
  readonly id: number;
  /** Impresión concreta de la carta (`catalog` puede repetir especie). */
  readonly card?: string;
  readonly name: string;
  readonly image?: string;
  readonly surface?: {
    readonly assets?: { readonly front?: string };
  } | null;
}

/** Pareja de cartas enfrentadas. */
export type BattlePair<TCard extends BattleCard = BattleCard> = readonly TCard[];

/** Resultado de una elección: `0` primera mitad, `1` segunda, `2` empate. */
export type BattleWinner = 0 | 1 | 2;

/** Puerto de temporizadores; admite handles opacos de navegador o de test. */
export type BattleTimerHandle = unknown;

export interface BattleTimerApi {
  setTimeout(handler: () => void, delayMs: number): BattleTimerHandle;
  clearTimeout(handle: BattleTimerHandle): void;
}

/** Voto mínimo para saber si una carta sigue siendo favorita. */
export interface BattleVote {
  readonly value?: 'yes' | 'no';
}

/** Mapa de votos indexado por id de especie (o por string en storage). */
export type BattleVotes = Readonly<Record<string | number, BattleVote | undefined>>;

/* -------------------------------------------------------------------------- */
/* 1. Entrada de batalla (Web Animations)                                     */
/* -------------------------------------------------------------------------- */

/** Keyframe mínimo del legacy (`translate`, `opacity`, `transform`, `offset`). */
export interface BattleKeyframe {
  readonly translate?: string;
  readonly opacity?: number;
  readonly transform?: string;
  readonly offset?: number;
}

export interface BattleAnimationOptions {
  readonly duration: number;
  readonly delay?: number;
  readonly easing?: string;
  readonly fill?: 'forwards';
}

/** Animación devuelta por `element.animate()`. */
export interface BattleAnimation {
  cancel(): void;
  readonly finished?: Promise<unknown>;
}

export interface EntranceClassList {
  add(token: string): void;
  remove(token: string): void;
  contains(token: string): boolean;
}

/** Nodo mínimo para el rayo y los botones de la entrada. */
export interface EntranceNode {
  className?: string;
  innerHTML?: string;
  hidden?: boolean;
  readonly classList: EntranceClassList;
  readonly style: { animation?: string };
  setAttribute(name: string, value: string): void;
  animate(frames: readonly BattleKeyframe[], options: BattleAnimationOptions): BattleAnimation;
  remove(): void;
  addEventListener(
    type: string,
    listener: () => void,
    options?: boolean | { readonly capture?: boolean },
  ): void;
  removeEventListener(
    type: string,
    listener: () => void,
    options?: boolean | { readonly capture?: boolean },
  ): void;
}

export interface EntranceLayer extends EntranceNode {
  append(node: EntranceNode): void;
}

/** Botón/mitad administrado por la entrada. */
export type EntranceButton = EntranceNode;

/** Dependencias inyectadas de la entrada de batalla. */
export interface BattleEntranceOptions {
  readonly createElement: (tagName: string) => EntranceNode;
  readonly pairBox: { readonly children: ArrayLike<EntranceButton> };
  readonly eventLayer: EntranceLayer;
  readonly equalTools: Pick<EntranceNode, 'addEventListener' | 'removeEventListener'>;
  readonly timers: BattleTimerApi;
  readonly reducedMotion: { readonly matches: boolean };
  readonly sound: (kind: 'battle') => void;
  readonly isInlinePair: () => boolean;
  readonly isInlineBusy: () => boolean;
  /** `#app.classList.contains('battle-wide')`; por defecto `false`. */
  readonly isWide?: () => boolean;
  /** Visibilidad de `eventLayer`; por defecto `eventLayer.hidden`. */
  readonly isLayerHidden?: () => boolean;
}

export interface BattleEntranceController {
  /** Programa la entrada; si ya había una, la cancela primero. */
  cue(): void;
  /** Cancela animaciones, temporizadores y listeners pendientes. */
  stop(): void;
  dispose(): void;
}

/** Geometría exacta del rayo, idéntica a `src/app.js`. */
export const BATTLE_CLASH_SPINE =
  'M4 32 39 29 57 38 78 21 106 35 130 27 149 36 164 17 182 34 206 26 230 38 254 24 278 34 316 30';
export const BATTLE_CLASH_BRANCHES =
  'M78 21 86 8 103 5 M149 36 137 51 119 57 M182 34 196 49 218 54 M254 24 265 10 283 7';

/** Duraciones del legacy, en milisegundos. */
export const ENTRANCE_SLIDE_MS = 280;
export const ENTRANCE_BOLT_MS = 740;
export const ENTRANCE_IMPACT_MS = 140;
export const ENTRANCE_IDLE_MS = 1150;
export const ENTRANCE_IDLE_BREATH_MS = 400;
export const ENTRANCE_IDLE_STAGGER_MS = 440;
export const ENTRANCE_SLIDE_EASING = 'cubic-bezier(.2,.75,.25,1)';
export const ENTRANCE_IDLE_EASING = 'ease-in-out';

/** SVG del rayo; conserva `preserveAspectRatio` y la rotación en modo ancho. */
export function battleClashMarkup(wide: boolean): string {
  const viewBox = wide ? '64 320' : '320 64';
  const transform = wide ? 'transform="matrix(0 1 1 0 0 0)"' : '';
  return (
    `<svg viewBox="0 0 ${viewBox}" preserveAspectRatio="none">` +
    `<g ${transform}>` +
    `<path class="clash-aura" d="${BATTLE_CLASH_SPINE}"/>` +
    `<path class="clash-branches" d="${BATTLE_CLASH_BRANCHES}"/>` +
    `<path class="clash-edge" d="${BATTLE_CLASH_SPINE}"/>` +
    `<path class="clash-core" d="${BATTLE_CLASH_SPINE}"/>` +
    '</g></svg>'
  );
}

/**
 * Crea el controlador de la entrada de batalla.
 *
 * No arranca nada hasta `cue()`. `stop()` es idempotente y replica el
 * `battleEntranceCleanup` del legacy (lo invoca el primer toque/tecla).
 */
export function createBattleEntrance(options: BattleEntranceOptions): BattleEntranceController {
  const isLayerHidden = options.isLayerHidden ?? (() => Boolean(options.eventLayer.hidden));

  let cleanup: (() => void) | null = null;

  function stop(): void {
    cleanup?.();
  }

  function cue(): void {
    // El legacy cancela la entrada anterior antes de comprobar reduced motion.
    stop();
    if (options.reducedMotion.matches) return;

    const wide = options.isWide?.() ?? false;
    const buttons = Array.from(options.pairBox.children);
    const animations: BattleAnimation[] = [];
    let idleTimer: BattleTimerHandle = undefined;
    let impactTimer: BattleTimerHandle = undefined;
    let disposed = false;

    const bolt = options.createElement('span');
    bolt.className = 'battle-clash';
    bolt.setAttribute('aria-hidden', 'true');
    bolt.innerHTML = battleClashMarkup(wide);
    options.eventLayer.append(bolt);

    const cancel = (): void => {
      if (disposed) return;
      disposed = true;
      options.timers.clearTimeout(idleTimer);
      options.timers.clearTimeout(impactTimer);
      for (const animation of animations) animation.cancel();
      bolt.remove();
      options.eventLayer.classList.remove('battle-entering');
      for (const type of ['pointerdown', 'keydown']) {
        options.eventLayer.removeEventListener(type, cancel, true);
      }
      options.equalTools.removeEventListener('pointerdown', cancel, true);
    };

    cleanup = cancel;
    options.eventLayer.classList.add('battle-entering');

    buttons.forEach((button, index) => {
      const sign = index === 0 ? -1 : 1;
      button.style.animation = 'none';
      const from = wide ? `${String(sign * 22)}px 0` : `0 ${String(sign * 22)}px`;
      const overshoot = wide ? `${String(-sign * 3)}px 0` : `0 ${String(-sign * 3)}px`;
      animations.push(
        button.animate(
          [{ translate: from }, { translate: overshoot, offset: 0.55 }, { translate: '0 0' }],
          { duration: ENTRANCE_SLIDE_MS, easing: ENTRANCE_SLIDE_EASING },
        ),
      );
    });

    animations.push(
      bolt.animate(
        [
          { opacity: 0, transform: 'scale(.9)' },
          { opacity: 1, transform: 'scale(1)', offset: 0.19 },
          { opacity: 1, transform: 'scale(1)', offset: 0.76 },
          { opacity: 0, transform: 'scale(1.025)' },
        ],
        { duration: ENTRANCE_BOLT_MS },
      ),
    );

    impactTimer = options.timers.setTimeout(() => {
      if (disposed) return;
      options.sound('battle');
      options.eventLayer.classList.remove('battle-entering');
    }, ENTRANCE_IMPACT_MS);

    idleTimer = options.timers.setTimeout(() => {
      if (disposed || !options.isInlinePair() || options.isInlineBusy() || isLayerHidden()) {
        return;
      }
      buttons.forEach((button, index) => {
        animations.push(
          button.animate(
            [{ translate: '0 0' }, { translate: '0 -4px', offset: 0.45 }, { translate: '0 0' }],
            {
              duration: ENTRANCE_IDLE_BREATH_MS,
              delay: index * ENTRANCE_IDLE_STAGGER_MS,
              easing: ENTRANCE_IDLE_EASING,
            },
          ),
        );
      });
      bolt.remove();
    }, ENTRANCE_IDLE_MS);

    for (const type of ['pointerdown', 'keydown']) {
      options.eventLayer.addEventListener(type, cancel, true);
    }
    options.equalTools.addEventListener('pointerdown', cancel, true);
  }

  return { cue, stop, dispose: stop };
}

/* -------------------------------------------------------------------------- */
/* 2. Feedback de la mitad elegida                                            */
/* -------------------------------------------------------------------------- */

/** Nodo mínimo del overlay de corazón. */
export interface FeedbackNode {
  className: string;
  innerHTML: string;
  setAttribute(name: string, value: string): void;
}

/** Corazón exacto del legacy (viewBox 24×24). */
export const BATTLE_FEEDBACK_HTML =
  '<span class="battle-heart"><svg viewBox="0 0 24 24"><path d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z"/></svg></span>';

/** Crea el overlay `span.battle-feedback` con `aria-hidden="true"`. */
export function createBattleFeedback(
  createElement: (tagName: string) => FeedbackNode,
): FeedbackNode {
  const layer = createElement('span');
  layer.className = 'battle-feedback';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = BATTLE_FEEDBACK_HTML;
  return layer;
}

/** Botón al que se le marca la elección. */
export interface BattleChoiceButton {
  readonly classList: {
    toggle(token: string, force?: boolean): void;
  };
}

/**
 * Marca solo la mitad elegida; `2` (empate) marca ambas.
 *
 * Equivalente exacto a `markBattleChoice` del legacy.
 */
export function markBattleChoice(
  buttons: readonly BattleChoiceButton[],
  winner: BattleWinner,
): void {
  buttons.forEach((button, index) => {
    button.classList.toggle('battle-picked', winner === 2 || winner === index);
  });
}

/* -------------------------------------------------------------------------- */
/* 3. Progreso de la sesión (puntos)                                          */
/* -------------------------------------------------------------------------- */

/** Sesión mínima observada por los puntos de progreso. */
export interface ProgressSession {
  done: number;
  target: number;
  choiceCommitted?: boolean;
}

/** Estado visible de los puntos. */
export interface BattleProgress {
  readonly total: number;
  readonly done: number;
  readonly active: boolean;
}

/** Cue temporal que mantiene la ronda completa visible tras desmontar. */
export interface CompletedBattleCue {
  readonly total: number;
  readonly until: number;
}

/** 650 ms de permanencia y 660 ms de limpieza, como en el legacy. */
export const PROGRESS_CUE_MS = 650;
export const PROGRESS_CUE_CLEANUP_MS = 660;

/** Flecha de "salir del afinador" mientras la sesión está activa. */
export const BATTLE_PROGRESS_ARROW =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';

export interface BattleProgressDataset {
  progressSignature?: string;
}

export interface BattleProgressDot {
  readonly classList: {
    toggle(token: string, force?: boolean): void;
  };
}

export interface BattleProgressDotList {
  forEach(callback: (dot: BattleProgressDot, index: number) => void): void;
}

/** Vista mínima de `#front-refine` que consume el pintor. */
export interface BattleProgressView {
  readonly dataset: BattleProgressDataset;
  innerHTML: string;
  readonly classList: {
    toggle(token: string, force?: boolean): void;
    remove(token: string): void;
  };
  setAttribute(name: string, value: string): void;
  querySelectorAll(selector: string): BattleProgressDotList;
}

export interface BattleProgressOptions {
  readonly getSession: () => ProgressSession | null;
  readonly now: () => number;
  readonly timers: BattleTimerApi;
  /** Vista opcional; si se omite, `onPaint` recibe el modelo. */
  readonly view?: BattleProgressView;
  readonly manualIcon?: string;
  readonly isInlinePair?: () => boolean;
  readonly onPaint?: (progress: BattleProgress | null) => void;
}

export interface BattleProgressController {
  state(): BattleProgress | null;
  commit(): void;
  paint(): void;
  /** Fuerza a reescribir los puntos aunque la firma no cambie. */
  invalidate(): void;
  dispose(): void;
}

/** Estado de progreso derivado de la sesión o del cue temporal. */
export function battleProgressState(
  session: ProgressSession | null,
  cue: CompletedBattleCue | null,
  now: number,
): BattleProgress | null {
  if (session) {
    return {
      total: session.target,
      done: Math.min(session.target, session.done + (session.choiceCommitted ? 1 : 0)),
      active: true,
    };
  }
  if (cue && now < cue.until) {
    return { total: cue.total, done: cue.total, active: false };
  }
  return null;
}

/**
 * Pinta los puntos y la etiqueta accesible en `#front-refine`.
 *
 * Con `progress === null` y sin pareja inline restaura el icono manual.
 */
export function renderBattleProgress(
  view: BattleProgressView,
  progress: BattleProgress | null,
  manualIcon: string,
  inlinePair: boolean,
): void {
  if (!progress) {
    if (inlinePair) return;
    delete view.dataset.progressSignature;
    view.classList.remove('session-complete');
    view.innerHTML = manualIcon;
    view.setAttribute('aria-label', 'Afinar mis favoritos');
    return;
  }

  const signature = `${String(progress.total)}:${String(progress.active)}`;
  if (view.dataset.progressSignature !== signature) {
    view.dataset.progressSignature = signature;
    const dots =
      '<span class="refine-dots" aria-hidden="true">' +
      Array.from({ length: progress.total }, () => '<i></i>').join('') +
      '</span>';
    view.innerHTML = dots + (progress.active ? BATTLE_PROGRESS_ARROW : manualIcon);
  }

  view.querySelectorAll('.refine-dots i').forEach((dot, index) => {
    dot.classList.toggle('filled', index < progress.done);
    dot.classList.toggle('current', index === progress.done);
  });

  view.classList.toggle('session-complete', progress.done === progress.total);
  view.setAttribute(
    'aria-label',
    progress.done === progress.total
      ? 'Ronda completada'
      : `Salir del afinador, ${String(progress.done)} de ${String(progress.total)}`,
  );
}

/**
 * Crea el controlador de progreso de la sesión manual.
 *
 * `commit()` replica `commitBattleProgress`: marca `choiceCommitted`, y cuando
 * la elección cierra la ronda arma el cue de 650 ms. El cue se limpia solo a
 * los 660 ms, por lo que el último punto sigue lleno durante el desmontaje.
 */
export function createBattleProgress(options: BattleProgressOptions): BattleProgressController {
  let cue: CompletedBattleCue | null = null;
  let cueTimer: BattleTimerHandle;
  let disposed = false;

  function state(): BattleProgress | null {
    return battleProgressState(options.getSession(), cue, options.now());
  }

  function paint(): void {
    const progress = state();
    if (options.view) {
      renderBattleProgress(
        options.view,
        progress,
        options.manualIcon ?? '',
        options.isInlinePair?.() ?? false,
      );
      return;
    }
    options.onPaint?.(progress);
  }

  function commit(): void {
    const session = options.getSession();
    if (!session) return;
    session.choiceCommitted = true;

    if (session.done + 1 === session.target) {
      cue = { total: session.target, until: options.now() + PROGRESS_CUE_MS };
      options.timers.clearTimeout(cueTimer);
      cueTimer = options.timers.setTimeout(() => {
        if (disposed) return;
        cue = null;
        paint();
      }, PROGRESS_CUE_CLEANUP_MS);
    }

    paint();
  }

  function invalidate(): void {
    if (options.view) delete options.view.dataset.progressSignature;
  }

  function dispose(): void {
    disposed = true;
    options.timers.clearTimeout(cueTimer);
  }

  return { state, commit, paint, invalidate, dispose };
}

/* -------------------------------------------------------------------------- */
/* 4. Preparación de parejas y validación de sesión                           */
/* -------------------------------------------------------------------------- */

/** Arte observado por la preparación. */
export interface BattleArtwork {
  src?: string;
  artReady?: Promise<boolean> | boolean | null;
  cardReady?: boolean;
  naturalWidth?: number;
  complete?: boolean;
  readonly artTiming?: {
    readonly started?: number;
    readonly loaded?: number;
    readonly decodeMs?: number;
  };
}

/** Fallo de carga registrado para diagnóstico (plan §19). */
export interface BattleLoadFailure {
  readonly card: string | undefined;
  readonly source: string | undefined;
  readonly reason: 'image-not-ready' | 'preparation-timeout';
}

/** Sesión de refinamiento (manual o candidata automática). */
export interface RefinementSession<TCard extends BattleCard = BattleCard> {
  done: number;
  target: number;
  pairs: readonly (readonly TCard[])[];
  ready: Map<number, Promise<boolean>>;
  art?: Map<string, BattleArtwork>;
  favorites: string;
  resetAt: number;
  signature?: string;
  planMs?: number;
  loadFailures?: BattleLoadFailure[];
  choiceCommitted?: boolean;
}

export type RefinementResourceRole = 'battle' | 'battle-preview';

/** Dependencias inyectadas de `prepareRefinementPair`. */
export interface RefinementPreparationOptions<TCard extends BattleCard = BattleCard> {
  readonly warmArtwork: (card: TCard, priority: number) => void;
  readonly getWarmArt: (url: string) => BattleArtwork | undefined;
  readonly deleteWarmArt: (url: string) => void;
  readonly fallback: (card: TCard) => string;
  readonly isManualSession: (session: RefinementSession<TCard>) => boolean;
  readonly timers: BattleTimerApi;
  /** `window.PokeResources?.plan(...)`; se omite si no hay coordinador. */
  readonly planResources?: (role: RefinementResourceRole, pair: readonly TCard[]) => void;
  /** Timeout de preparación; por defecto 22000 ms. */
  readonly timeoutMs?: number;
}

/** Timeout exacto del legacy. */
export const PREPARATION_TIMEOUT_MS = 22000;
/** Prioridad de arte: la batalla manual va primero, la candidata después. */
export const BATTLE_ART_PRIORITY = 0;
export const BATTLE_PREVIEW_PRIORITY = 20;

/** URL canónica/arte usada por `warmArtwork` y el fallback. */
export function battleArtUrl<TCard extends BattleCard>(
  card: TCard,
  fallback: (card: TCard) => string,
): string {
  return card.surface?.assets?.front ?? card.image ?? fallback(card);
}

/** Firma de favoritos del legacy: orden del catálogo, `id:card`. */
export function refinementFavorites<TCard extends BattleCard>(
  cards: readonly TCard[],
  votes: BattleVotes,
): string {
  return cards
    .filter((card) => votes[card.id]?.value === 'yes')
    .map((card) => `${String(card.id)}:${String(card.card)}`)
    .join('|');
}

/**
 * Valida una sesión contra la foto actual de favoritos y `resetAt`.
 *
 * El legacy compara `favorites` y `resetAt`; ambos deben coincidir para que la
 * sesión siga siendo usable tras un cambio de perfil o un reset.
 */
export function validRefinementSession(
  session: Pick<RefinementSession, 'favorites' | 'resetAt'>,
  favorites: string,
  resetAt: number,
): boolean {
  return session.favorites === favorites && session.resetAt === (resetAt || 0);
}

/**
 * Prepara (calienta y espera) la pareja `index` de una sesión.
 *
 * Es una única promesa por índice: llamadas concurrentes devuelven la misma
 * instancia. Solo resuelve `true` cuando ambas imágenes están decodificadas
 * (`artReady`, `cardReady` y `naturalWidth > 0`). Un fallo elimina la entrada
 * de `ready` para que la pareja siga siendo reintentable.
 */
export function prepareRefinementPair<TCard extends BattleCard>(
  session: RefinementSession<TCard>,
  index: number,
  options: RefinementPreparationOptions<TCard>,
): Promise<boolean> {
  const cached = session.ready.get(index);
  if (cached) return cached;

  const pair = session.pairs[index];
  if (!pair) return Promise.resolve(false);

  const manual = options.isManualSession(session);
  options.planResources?.(manual ? 'battle' : 'battle-preview', pair);
  session.art ??= new Map<string, BattleArtwork>();

  const timeoutMs = options.timeoutMs ?? PREPARATION_TIMEOUT_MS;

  const readiness = pair.map(
    (card) =>
      new Promise<boolean>((resolve) => {
        options.warmArtwork(card, manual ? BATTLE_ART_PRIORITY : BATTLE_PREVIEW_PRIORITY);
        const url = battleArtUrl(card, options.fallback);
        const art = options.getWarmArt(url);
        if (!art) {
          resolve(false);
          return;
        }

        session.art?.set(`${String(card.id)}:${String(card.card)}`, art);

        let done = false;
        const finish = (ok: boolean): void => {
          if (done) return;
          done = true;
          options.timers.clearTimeout(timer);
          if (!ok) {
            session.loadFailures ??= [];
            session.loadFailures.push({
              card: card.card,
              source: art.src,
              reason: art.cardReady === false ? 'image-not-ready' : 'preparation-timeout',
            });
            if (options.getWarmArt(url) === art) options.deleteWarmArt(url);
          }
          resolve(ok);
        };

        const timer = options.timers.setTimeout(() => finish(false), timeoutMs);

        // Un `img` sin src también es `complete`: solo el arte decodificado
        // exacto cuenta como listo.
        void Promise.resolve(art.artReady).then(
          (ok) => finish(Boolean(ok && art.cardReady && (art.naturalWidth ?? 0) > 0)),
          () => finish(false),
        );
      }),
  );

  const ready = Promise.all(readiness)
    .then((results) => {
      const ok = results.every(Boolean);
      if (!ok) session.ready.delete(index);
      return ok;
    })
    .catch(() => {
      session.ready.delete(index);
      return false;
    });

  session.ready.set(index, ready);
  return ready;
}

/* -------------------------------------------------------------------------- */
/* 5. Batalla automática: precarga, liberación y promoción                    */
/* -------------------------------------------------------------------------- */

/** Imagen mínima creada por el adaptador para la batalla automática. */
export interface AutomaticBattleArtwork {
  alt?: string;
  decoding?: string;
  draggable?: boolean;
  src?: string;
  cardReady?: boolean;
  naturalWidth?: number;
  resourceState?: string;
  artReady?: Promise<boolean>;
}

export interface AutomaticBattle<TCard extends BattleCard = BattleCard> {
  pair: readonly TCard[];
  art: Map<string, AutomaticBattleArtwork>;
  resetAt: number;
  status: 'loading' | 'ready';
}

/**
 * Estado compartido del legacy (`automaticBattle`, `queuedPair`, `inlinePair`
 * y `activeEncounter`). Se expone mutable para que la presentación y el
 * planificador de eventos lo compartan.
 */
export interface BattleRuntimeState<TCard extends BattleCard = BattleCard> {
  automaticBattle: AutomaticBattle<TCard> | null;
  queuedPair: readonly TCard[] | null;
  inlinePair: readonly TCard[] | null;
  activeEncounter: unknown;
}

export interface AutomaticBattleOptions<TCard extends BattleCard = BattleCard> {
  readonly state?: BattleRuntimeState<TCard>;
  readonly createImage: () => AutomaticBattleArtwork;
  readonly bindImage: (
    art: AutomaticBattleArtwork,
    card: TCard,
    options: { readonly priority: number },
  ) => void;
  readonly releaseImage: (art: AutomaticBattleArtwork) => void;
  /** Orden aleatorio de la pareja; por defecto `Math.random`. */
  readonly random?: () => number;
  readonly getResetAt: () => number;
  readonly isFavorite: (card: TCard) => boolean;
  /** `scheduleEvents` legacy: reevalúa eventos al quedar `ready`. */
  readonly scheduleEvents?: () => void;
}

export interface AutomaticBattleController<TCard extends BattleCard = BattleCard> {
  readonly state: BattleRuntimeState<TCard>;
  /** Precarga ambas mitades; no hace nada si ya hay una batalla en curso. */
  prepare(selected: readonly TCard[]): void;
  /** Libera ambas imágenes y limpia la pareja en cola. */
  clear(): void;
}

export function createAutomaticBattle<TCard extends BattleCard>(
  options: AutomaticBattleOptions<TCard>,
): AutomaticBattleController<TCard> {
  const state: BattleRuntimeState<TCard> = options.state ?? {
    automaticBattle: null,
    queuedPair: null,
    inlinePair: null,
    activeEncounter: null,
  };
  const random = options.random ?? Math.random;

  function clear(): void {
    if (!state.automaticBattle) return;
    for (const art of state.automaticBattle.art.values()) {
      options.releaseImage(art);
    }
    state.automaticBattle = null;
    state.queuedPair = null;
  }

  function prepare(selected: readonly TCard[]): void {
    if (state.automaticBattle) return;

    const pair = random() < 0.5 ? selected : [...selected].reverse();
    const candidate: AutomaticBattle<TCard> = {
      pair,
      art: new Map<string, AutomaticBattleArtwork>(),
      resetAt: options.getResetAt() || 0,
      status: 'loading',
    };
    state.automaticBattle = candidate;

    const valid = (): boolean =>
      state.automaticBattle === candidate &&
      candidate.resetAt === (options.getResetAt() || 0) &&
      pair.every((card) => options.isFavorite(card));

    const readiness = pair.map((card) => {
      const art = options.createImage();
      art.alt = card.name;
      art.decoding = 'async';
      art.draggable = false;
      options.bindImage(art, card, { priority: 1 });
      candidate.art.set(`${String(card.id)}:${String(card.card)}`, art);
      const ready = art.artReady;
      if (!ready) return Promise.resolve(false);
      return ready.then((ok) =>
        Boolean(
          ok && art.cardReady && art.resourceState === 'presentable' && (art.naturalWidth ?? 0) > 0,
        ),
      );
    });

    void Promise.all(readiness).then((results) => {
      if (!valid()) {
        if (state.automaticBattle === candidate) clear();
        return;
      }
      if (!results.every(Boolean)) {
        clear();
        return;
      }
      candidate.status = 'ready';
      state.queuedPair = pair;
      options.scheduleEvents?.();
    });
  }

  return { state, prepare, clear };
}

/** Condiciones de UI que bloquean la promoción de la pareja en cola. */
export interface BattlePromotionUi {
  isBusy(): boolean;
  isDocumentHidden(): boolean;
  hasActiveCard(): boolean;
  isSheetOpen(): boolean;
  hasOpenDialog(): boolean;
  hasExitingCard(): boolean;
}

export interface BattlePromotionOptions<TCard extends BattleCard = BattleCard> {
  readonly state: BattleRuntimeState<TCard>;
  readonly ui: BattlePromotionUi;
  readonly eventSeen: () => number;
  /** `refinementSchedule.nextSeen`; por defecto 20. */
  readonly nextSeen?: () => number;
  /** Por defecto `Boolean(state.activeEncounter)`. */
  readonly hasActiveEncounter?: () => boolean;
  readonly render: () => void;
  readonly paintRefinement: () => void;
}

export interface BattlePromotionController {
  /** Promueve la pareja en cola si la UI está libre; siempre repinta. */
  renderDiscovery(): boolean;
}

/**
 * Envuelve `render` para montar la batalla automática solo cuando:
 * está `ready`, no hay batalla inline/encuentro/gesto, no hay tarjeta saliendo
 * ni activa, la pestaña está visible, no hay sheet/diálogo y se alcanzó
 * `nextSeen`. Después siempre ejecuta `render()` y `paintRefinement()`.
 */
export function createBattlePromotion<TCard extends BattleCard>(
  options: BattlePromotionOptions<TCard>,
): BattlePromotionController {
  const nextSeen = options.nextSeen ?? (() => 20);
  const hasActiveEncounter =
    options.hasActiveEncounter ?? (() => Boolean(options.state.activeEncounter));

  function renderDiscovery(): boolean {
    const { state, ui } = options;
    let promoted = false;

    if (
      state.queuedPair &&
      state.automaticBattle?.status === 'ready' &&
      !state.inlinePair &&
      !ui.isBusy() &&
      !hasActiveEncounter() &&
      !ui.hasExitingCard() &&
      !ui.hasActiveCard() &&
      !ui.isDocumentHidden() &&
      !ui.isSheetOpen() &&
      !ui.hasOpenDialog() &&
      options.eventSeen() >= nextSeen()
    ) {
      state.inlinePair = state.queuedPair;
      state.queuedPair = null;
      promoted = true;
    }

    options.render();
    options.paintRefinement();
    return promoted;
  }

  return { renderDiscovery };
}
