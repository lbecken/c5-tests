/**
 * Asynchronous telemetry feed for ISS (NORAD 25544) via the Where The ISS At API.
 *
 * The loop is self-scheduling rather than setInterval-based: each cycle is
 * queued only once the previous request has settled, so a slow or hung request
 * can never stack up a backlog of overlapping fetches.
 *
 * Two details matter for positional accuracy:
 *
 *  1. CLOCK SKEW. Positions are stamped with the *server's* clock. Dead-reckoning
 *     between 5-second samples against a client clock that is even a few seconds
 *     off would displace the station by ~7.7 km per second of error, so an
 *     NTP-style offset is estimated from each round trip and applied.
 *
 *  2. SAMPLE BASELINE. Angular velocity is differenced over a long baseline
 *     (~90 s) rather than between adjacent 5-second samples: the API stamps
 *     positions to whole seconds, and over a 5 s gap that quantisation would
 *     dominate the derived speed.
 */

import * as THREE from 'three';
import { geoToVector, angularVelocity } from '../astro/geo.js';

export const ISS_API_URL = 'https://api.wheretheiss.at/v1/satellites/25544';

/** Preferred and minimum separation, in seconds, for velocity differencing. */
const BASELINE_TARGET_S = 90;
const BASELINE_MIN_S = 20;
const HISTORY_LIMIT = 64;

export class IssFeed {
  constructor({ url = ISS_API_URL, intervalMs = 5000, timeoutMs = 9000 } = {}) {
    this.url = url;
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;

    /** @type {Array<object>} newest last */
    this.history = [];
    this.consecutiveFailures = 0;
    this.lastError = null;
    this.clockOffsetMs = 0;
    this._offsetSamples = [];

    this._running = false;
    this._timer = null;
    this._controller = null;
    this._listeners = { fix: [], status: [] };
    this.nextPollAt = 0;
  }

  on(event, callback) {
    this._listeners[event]?.push(callback);
    return this;
  }

  _emit(event, payload) {
    for (const cb of this._listeners[event] ?? []) cb(payload);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._poll();
  }

  stop() {
    this._running = false;
    clearTimeout(this._timer);
    this._controller?.abort();
  }

  /** Server-corrected wall clock, in ms since the Unix epoch. */
  now() {
    return Date.now() + this.clockOffsetMs;
  }

  get latest() {
    return this.history[this.history.length - 1] ?? null;
  }

  /** Seconds since the newest fix was stamped, on the corrected clock. */
  get ageSeconds() {
    const latest = this.latest;
    return latest ? (this.now() - latest.epochMs) / 1000 : Infinity;
  }

  async _poll() {
    if (!this._running) return;

    this._controller = new AbortController();
    const timeout = setTimeout(() => this._controller.abort(), this.timeoutMs);
    const sentAt = Date.now();

    try {
      const response = await fetch(`${this.url}?units=kilometers`, {
        signal: this._controller.signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

      const data = await response.json();
      const receivedAt = Date.now();
      this._ingest(data, sentAt, receivedAt);

      this.consecutiveFailures = 0;
      this.lastError = null;
      this._emit('status', { ok: true, failures: 0, error: null });
    } catch (error) {
      this.consecutiveFailures++;
      this.lastError = error.name === 'AbortError' ? 'Request timed out' : error.message;
      this._emit('status', {
        ok: false,
        failures: this.consecutiveFailures,
        error: this.lastError,
      });
    } finally {
      clearTimeout(timeout);
      this._controller = null;
    }

    if (!this._running) return;

    // Steady 5 s cadence when healthy; back off (capped at 60 s) when not, so a
    // sustained outage does not hammer the API.
    const delay =
      this.consecutiveFailures === 0
        ? this.intervalMs
        : Math.min(60000, this.intervalMs * 2 ** Math.min(this.consecutiveFailures, 4));

    this.nextPollAt = Date.now() + delay;
    this._timer = setTimeout(() => this._poll(), delay);
  }

  _ingest(data, sentAt, receivedAt) {
    const lat = Number(data.latitude);
    const lon = Number(data.longitude);
    const altitude = Number(data.altitude);
    const timestamp = Number(data.timestamp);

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(altitude)) {
      throw new Error('Malformed telemetry payload');
    }

    // NTP-style offset: assume symmetric latency and take the median of recent
    // samples so one slow round trip cannot yank the estimate around.
    const roundTrip = receivedAt - sentAt;
    const serverInstant = timestamp * 1000;
    this._offsetSamples.push(serverInstant - (sentAt + roundTrip / 2));
    if (this._offsetSamples.length > 12) this._offsetSamples.shift();
    const sorted = [...this._offsetSamples].sort((a, b) => a - b);
    this.clockOffsetMs = sorted[sorted.length >> 1];

    const fix = {
      lat,
      lon,
      altitudeKm: altitude,
      reportedVelocityKmh: Number(data.velocity),
      visibility: data.visibility ?? 'unknown',
      // The API reports footprint as a diameter; halve it for a ground radius.
      footprintRadiusKm: Number.isFinite(Number(data.footprint))
        ? Number(data.footprint) / 2
        : null,
      solarLat: Number.isFinite(Number(data.solar_lat)) ? Number(data.solar_lat) : null,
      solarLon: Number.isFinite(Number(data.solar_lon)) ? Number(data.solar_lon) : null,
      epochMs: serverInstant,
      receivedAt,
      roundTripMs: roundTrip,
      unit: geoToVector(lat, lon, 1),
    };

    const previous = this.latest;
    // Guard against the API replaying an identical or out-of-order sample.
    if (previous && fix.epochMs <= previous.epochMs) {
      this._emit('fix', { fix: previous, omega: this.deriveOmega(), stale: true });
      return;
    }

    this.history.push(fix);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();

    this._emit('fix', { fix, omega: this.deriveOmega(), stale: false });
  }

  /**
   * Earth-fixed angular velocity from the widest usable pair of samples.
   * Returns null until two sufficiently separated fixes exist.
   */
  deriveOmega() {
    const latest = this.latest;
    if (!latest || this.history.length < 2) return null;

    let chosen = null;
    for (let i = this.history.length - 2; i >= 0; i--) {
      const candidate = this.history[i];
      const dt = (latest.epochMs - candidate.epochMs) / 1000;
      if (dt <= 0) continue;
      chosen = candidate;
      if (dt >= BASELINE_TARGET_S) break;
    }
    if (!chosen) return null;

    const dt = (latest.epochMs - chosen.epochMs) / 1000;
    const omega = angularVelocity(chosen.unit, latest.unit, dt);
    if (!omega) return null;

    return { ...omega, baselineSeconds: dt, converged: dt >= BASELINE_MIN_S };
  }

  /**
   * Ground-relative speed between the two widest samples, km/s -- speed over the
   * ground rather than inertial orbital speed.
   */
  groundSpeedKms() {
    const omega = this.deriveOmega();
    const latest = this.latest;
    if (!omega || !latest) return null;
    return omega.rate * (6371.0088 + latest.altitudeKm);
  }
}

/** Reusable scratch vector so callers avoid per-frame allocation. */
export const scratchVector = new THREE.Vector3();
