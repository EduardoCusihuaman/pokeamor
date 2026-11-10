/**
 * Cliente HTTP tipado para el catálogo y las sesiones del Worker.
 *
 * No importa Svelte ni componentes de interfaz. Las APIs de red y los tipos
 * del dominio son las únicas dependencias de este módulo.
 */

import { isCatalogBundle, type CatalogBundle } from '@/domain/catalog';

export const CATALOG_BUNDLE_PATH = '/catalog-bundle.json';
export const SESSION_PATH = '/api/session/';

/**
 * Instantánea de sesión. El esquema completo pertenece al backend/legacy y no
 * debe cambiarse silenciosamente desde el frontend; aquí se modela como un
 * objeto JSON opaco pero tipado.
 */
export type SessionSnapshot = Readonly<Record<string, unknown>>;

export interface SessionReadResult {
  /** `false` cuando el Worker responde 404: no existe sesión remota todavía. */
  readonly found: boolean;
  readonly etag: string | null;
  readonly body: SessionSnapshot | null;
}

export interface SaveSessionOptions {
  readonly token: string;
  /**
   * ETag de la última lectura. Sin ETag se usa `If-None-Match: *` para crear
   * la sesión y evitar sobrescribir una existente.
   */
  readonly etag?: string | null;
}

export interface SaveSessionResult {
  readonly etag: string | null;
}

/** Error de red o de protocolo con suficiente contexto para diagnosticar. */
export class ApiError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(message: string, options: { status: number; url: string; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.status = options.status;
    this.url = options.url;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sessionUrl(token: string): string {
  const normalized = token.trim();
  if (!normalized) {
    throw new ApiError('Falta el token de sesión.', { status: 0, url: SESSION_PATH });
  }
  return `${SESSION_PATH}${encodeURIComponent(normalized)}`;
}

async function readJson(response: Response, url: string): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new ApiError('La respuesta del servidor no es JSON válido.', {
      status: response.status,
      url,
      cause,
    });
  }
}

async function request(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    throw new ApiError('No se pudo conectar con el servidor.', {
      status: 0,
      url,
      cause,
    });
  }
}

function assertOk(response: Response, url: string): void {
  if (response.ok) return;
  throw new ApiError(`La petición a ${url} falló con estado ${response.status}.`, {
    status: response.status,
    url,
  });
}

/** Descarga y valida `/catalog-bundle.json`. */
export async function getCatalogBundle(): Promise<CatalogBundle> {
  const url = CATALOG_BUNDLE_PATH;
  const response = await request(url, {
    cache: 'no-cache',
    headers: { Accept: 'application/json' },
  });
  assertOk(response, url);

  const data = await readJson(response, url);
  if (!isCatalogBundle(data)) {
    throw new ApiError('El catálogo recibido no tiene el formato esperado.', {
      status: response.status,
      url,
    });
  }

  return data;
}

/**
 * Lee la sesión remota. Un 404 es un resultado normal (`found: false`), no un
 * error, porque la sesión puede no haberse creado todavía.
 */
export async function getSession(token: string): Promise<SessionReadResult> {
  const url = sessionUrl(token);
  const response = await request(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  const etag = response.headers.get('ETag');

  if (response.status === 404) {
    return { found: false, etag: null, body: null };
  }

  assertOk(response, url);

  const data = await readJson(response, url);
  if (!isRecord(data)) {
    throw new ApiError('La sesión remota no es un objeto JSON.', {
      status: response.status,
      url,
    });
  }

  return { found: true, etag, body: data };
}

/**
 * Guarda la sesión remota.
 *
 * Con `If-Match` el Worker resuelve conflictos por ETag (412). Sin ETag se
 * envía `If-None-Match: *`, tal como exige el Worker actual.
 */
export async function saveSession(
  body: SessionSnapshot,
  options: SaveSessionOptions,
): Promise<SaveSessionResult> {
  const url = sessionUrl(options.token);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.etag ? { 'If-Match': options.etag } : { 'If-None-Match': '*' }),
  };

  const response = await request(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });

  if (response.status === 412) {
    throw new ApiError('La sesión cambió en el servidor. Hay que volver a leerla.', {
      status: 412,
      url,
    });
  }

  assertOk(response, url);

  const data = await readJson(response, url);
  if (!isRecord(data) || data.saved !== true) {
    throw new ApiError('El servidor no confirmó el guardado de la sesión.', {
      status: response.status,
      url,
    });
  }

  return { etag: response.headers.get('ETag') };
}
