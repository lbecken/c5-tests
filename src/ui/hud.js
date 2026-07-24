/**
 * HUD binding layer: owns every DOM write so the render loop stays free of
 * layout-thrashing string work. Values are cached and only written when they
 * actually change, which keeps the panels off the critical path at 60 fps.
 */

import { formatDMS } from '../astro/geo.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      latValue: $('lat-value'),
      latDms: $('lat-dms'),
      lonValue: $('lon-value'),
      lonDms: $('lon-dms'),
      alt: $('alt-value'),
      vel: $('vel-value'),
      velKms: $('vel-kms'),
      groundSpeed: $('ground-speed'),
      period: $('period'),
      orbitRadius: $('orbit-radius'),
      footprint: $('footprint'),
      circularRef: $('circular-ref'),
      velocityNote: $('velocity-note'),

      utcClock: $('utc-clock'),
      solarLat: $('solar-lat'),
      solarLon: $('solar-lon'),
      solarDecl: $('solar-decl'),
      solarEot: $('solar-eot'),
      solarDist: $('solar-dist'),
      solarElev: $('solar-elev'),
      illumination: $('illumination'),
      illuminationText: $('illumination-text'),
      ephemerisCheck: $('ephemeris-check'),

      linkBadge: $('link-badge'),
      linkText: $('link-text'),
      nextFetch: $('next-fetch'),
      rtt: $('rtt'),
      clockOffset: $('clock-offset'),

      reticle: $('reticle'),
      bootBar: $('boot-bar'),
      bootDetail: $('boot-detail'),
      boot: $('boot'),
    };

    this._cache = new Map();
  }

  /** Write only when the rendered string actually changed. */
  _set(node, value) {
    if (!node) return;
    if (this._cache.get(node) === value) return;
    this._cache.set(node, value);
    node.textContent = value;
  }

  setBootProgress(fraction, detail) {
    if (this.el.bootBar) this.el.bootBar.style.width = `${Math.round(fraction * 100)}%`;
    if (detail) this._set(this.el.bootDetail, detail);
  }

  hideBoot() {
    this.el.boot?.classList.add('is-done');
    setTimeout(() => this.el.boot?.setAttribute('hidden', ''), 700);
  }

  /** Live sub-satellite point. */
  setPosition(lat, lon) {
    this._set(this.el.latValue, `${lat >= 0 ? '+' : '−'}${Math.abs(lat).toFixed(4)}°`);
    this._set(this.el.lonValue, `${lon >= 0 ? '+' : '−'}${Math.abs(lon).toFixed(4)}°`);
    this._set(this.el.latDms, formatDMS(lat, 'N', 'S'));
    this._set(this.el.lonDms, formatDMS(lon, 'E', 'W'));
  }

  setOrbital({
    altitudeKm,
    velocityKmh,
    velocityKms,
    groundSpeedKms,
    periodSeconds,
    orbitRadiusKm,
    footprintRadiusKm,
    circularSpeedKms,
    converged,
    baselineSeconds,
    reportedVelocityKmh,
  }) {
    this._set(this.el.alt, Number.isFinite(altitudeKm) ? altitudeKm.toFixed(2) : '—');
    this._set(
      this.el.vel,
      Number.isFinite(velocityKmh) ? Math.round(velocityKmh).toLocaleString('en-US') : '—'
    );
    this._set(this.el.velKms, Number.isFinite(velocityKms) ? `${velocityKms.toFixed(3)} km/s` : '—');
    this._set(
      this.el.groundSpeed,
      Number.isFinite(groundSpeedKms) ? `${groundSpeedKms.toFixed(3)} km/s` : '—'
    );
    this._set(
      this.el.period,
      periodSeconds > 0
        ? `${Math.floor(periodSeconds / 60)}m ${String(Math.round(periodSeconds % 60)).padStart(2, '0')}s`
        : '—'
    );
    this._set(
      this.el.orbitRadius,
      Number.isFinite(orbitRadiusKm) ? `${Math.round(orbitRadiusKm).toLocaleString('en-US')} km` : '—'
    );
    this._set(
      this.el.footprint,
      Number.isFinite(footprintRadiusKm)
        ? `${Math.round(footprintRadiusKm).toLocaleString('en-US')} km`
        : '—'
    );
    this._set(
      this.el.circularRef,
      Number.isFinite(circularSpeedKms) ? `${circularSpeedKms.toFixed(3)} km/s` : '—'
    );

    // Be explicit about where the headline number comes from, and how it
    // compares with the value the API reports independently.
    if (!converged) {
      this._set(
        this.el.velocityNote,
        'Velocity reported by API; local solution converges after ~20 s of samples.'
      );
    } else {
      const delta =
        Number.isFinite(reportedVelocityKmh) && Number.isFinite(velocityKmh)
          ? velocityKmh - reportedVelocityKmh
          : null;
      const deltaText =
        delta === null
          ? ''
          : ` Δ vs API ${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(0)} km/h.`;
      this._set(
        this.el.velocityNote,
        `Differenced over a ${Math.round(baselineSeconds)} s baseline.${deltaText}`
      );
    }
  }

  setSolar({ utc, lat, lon, declination, eqTime, distanceAu, elevation, apiLat, apiLon }) {
    this._set(this.el.utcClock, utc);
    this._set(this.el.solarLat, `${lat.toFixed(3)}°`);
    this._set(this.el.solarLon, `${lon.toFixed(3)}°`);
    this._set(this.el.solarDecl, `${declination >= 0 ? '+' : '−'}${Math.abs(declination).toFixed(3)}°`);
    this._set(
      this.el.solarEot,
      `${eqTime >= 0 ? '+' : '−'}${Math.abs(eqTime).toFixed(2)} min`
    );
    this._set(this.el.solarDist, `${distanceAu.toFixed(5)} AU`);
    this._set(
      this.el.solarElev,
      Number.isFinite(elevation) ? `${elevation >= 0 ? '+' : '−'}${Math.abs(elevation).toFixed(2)}°` : '—'
    );

    // The API publishes its own sub-solar point; showing the disagreement makes
    // the locally computed ephemeris auditable rather than merely asserted.
    if (Number.isFinite(apiLat) && Number.isFinite(apiLon)) {
      const dLat = Math.abs(lat - apiLat);
      const dLon = Math.abs(((lon - apiLon + 540) % 360) - 180);
      this._set(
        this.el.ephemerisCheck,
        `Local ephemeris agrees with API sub-solar point to ${dLat.toFixed(3)}° lat / ${dLon.toFixed(3)}° lon.`
      );
    } else {
      this._set(this.el.ephemerisCheck, 'Ephemeris computed locally from UTC.');
    }
  }

  setIllumination(visibility) {
    const labels = {
      daylight: 'STATION IN SUNLIGHT',
      eclipsed: 'STATION IN EARTH’S SHADOW',
      visible: 'VISIBLE FROM GROUND — ORBITAL NIGHT BELOW',
    };
    this.el.illumination?.setAttribute('data-state', visibility);
    this._set(this.el.illuminationText, labels[visibility] ?? 'UNKNOWN');
  }

  setLink(state, text) {
    this.el.linkBadge?.setAttribute('data-state', state);
    this._set(this.el.linkText, text);
  }

  setStatus({ nextFetchSeconds, rttMs, clockOffsetMs }) {
    this._set(
      this.el.nextFetch,
      Number.isFinite(nextFetchSeconds) ? `${Math.max(0, nextFetchSeconds).toFixed(1)}s` : '—'
    );
    this._set(this.el.rtt, Number.isFinite(rttMs) ? `${Math.round(rttMs)} ms` : '—');
    this._set(
      this.el.clockOffset,
      Number.isFinite(clockOffsetMs)
        ? `${clockOffsetMs >= 0 ? '+' : '−'}${(Math.abs(clockOffsetMs) / 1000).toFixed(2)}s`
        : '—'
    );
  }

  /** Move the tracking reticle, or hide it when the station is behind Earth. */
  setReticle(visible, x, y) {
    const node = this.el.reticle;
    if (!node) return;
    if (!visible) {
      if (!node.hidden) node.hidden = true;
      return;
    }
    if (node.hidden) node.hidden = false;
    node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
}

export function showFatal(message) {
  const fatal = document.getElementById('fatal');
  const target = document.getElementById('fatal-message');
  document.getElementById('boot')?.setAttribute('hidden', '');
  if (target) target.textContent = message;
  fatal?.removeAttribute('hidden');
}
