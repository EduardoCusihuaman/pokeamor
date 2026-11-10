/**
 * Estado de aplicación compartido para la sesión y el catálogo.
 *
 * Solo este módulo (y los componentes que lo consumen) usa runes. El catálogo
 * se guarda con `$state.raw` porque es grande e inmutable: no debe convertirse
 * en un proxy reactivo profundo.
 */

import type { Card } from '@/domain/catalog';
import { getCatalogBundle, getSession, type SessionSnapshot } from '@/infrastructure/api';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface LoadOptions {
  /**
   * Token de sesión explícito. Si se omite, se lee el enlace existente `#s=`.
   * `null` desactiva la carga remota de sesión.
   */
  readonly sessionToken?: string | null;
}

export interface AppSession {
  readonly status: LoadStatus;
  readonly loading: boolean;
  readonly error: string | null;
  readonly sessionError: string | null;
  readonly catalog: readonly Card[];
  readonly session: SessionSnapshot | null;
  readonly cardCount: number;
  readonly firstCard: Card | null;
  load(options?: LoadOptions): Promise<void>;
}

const SESSION_HASH_KEY = 's';

let status = $state<LoadStatus>('idle');
let catalog = $state.raw<readonly Card[]>([]);
let session = $state.raw<SessionSnapshot | null>(null);
let error = $state<string | null>(null);
let sessionError = $state<string | null>(null);

const cardCount = $derived(catalog.length);
const firstCard = $derived(catalog[0] ?? null);

let inFlight: Promise<void> | null = null;

/**
 * Lee el token del enlace de sesión existente (`#s=...`). No crea ni administra
 * un router hash: ese formato ya pertenece a la aplicación.
 */
function readSessionTokenFromLocation(): string | null {
  if (typeof globalThis.location === 'undefined') return null;

  const params = new URLSearchParams(globalThis.location.hash.slice(1));
  const token = params.get(SESSION_HASH_KEY)?.trim();
  return token ? token : null;
}

function describeError(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  return 'Error desconocido al cargar los datos.';
}

async function runLoad(options: LoadOptions): Promise<void> {
  status = 'loading';
  error = null;
  sessionError = null;

  try {
    const bundle = await getCatalogBundle();
    catalog = bundle.catalog;
    // El catálogo ya es usable; la sesión se resuelve sin bloquear la vista.
    status = 'ready';

    const token =
      options.sessionToken === undefined ? readSessionTokenFromLocation() : options.sessionToken;

    if (token) {
      try {
        const result = await getSession(token);
        session = result.body;
      } catch (cause) {
        // La sesión no es crítica para mostrar el catálogo; se informa aparte.
        session = null;
        sessionError = describeError(cause);
      }
    } else {
      session = null;
    }
  } catch (cause) {
    status = 'error';
    error = describeError(cause);
  }
}

/** Carga el catálogo y, si hay token, la sesión remota. Ignora cargas solapadas. */
export function load(options: LoadOptions = {}): Promise<void> {
  if (inFlight) return inFlight;

  inFlight = runLoad(options).finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/**
 * Fachada estable para componentes. Las propiedades son getters, de modo que
 * leerlas dentro de una plantilla mantiene la reactividad de las runes.
 */
export const appSession: AppSession = {
  get status() {
    return status;
  },
  get loading() {
    return status === 'loading';
  },
  get error() {
    return error;
  },
  get sessionError() {
    return sessionError;
  },
  get catalog() {
    return catalog;
  },
  get session() {
    return session;
  },
  get cardCount() {
    return cardCount;
  },
  get firstCard() {
    return firstCard;
  },
  load,
};
