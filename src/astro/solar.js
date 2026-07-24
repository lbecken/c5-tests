/**
 * Real-time solar ephemeris.
 *
 * Implements the low-precision solar position algorithm from the Astronomical
 * Almanac (as published by NOAA GML), which is good to roughly +/-0.01 deg in
 * declination for dates within a few centuries of J2000 -- far tighter than the
 * ~0.03 deg subtended by a single pixel of a 4K equirectangular Earth map.
 *
 * The output we actually care about is the sub-solar point: the latitude and
 * longitude on Earth where the Sun is exactly at the zenith. Placing the scene's
 * key light along that direction is what makes the day/night terminator land on
 * the correct real-world meridian for the user's current UTC time.
 */

const DEG = Math.PI / 180;

const norm360 = (d) => ((d % 360) + 360) % 360;
const wrap180 = (d) => norm360(d + 180) - 180;

/** Julian Day number for a JS Date (which is always an absolute UTC instant). */
export function julianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Julian centuries since the J2000.0 epoch. */
export function julianCentury(date) {
  return (julianDay(date) - 2451545.0) / 36525;
}

/**
 * Apparent geocentric solar position.
 *
 * @returns {{declination: number, rightAscension: number, eqTime: number,
 *            distanceAu: number, apparentLongitude: number, obliquity: number}}
 *          Angles in degrees, eqTime in minutes, distance in AU.
 */
export function solarPosition(date) {
  const T = julianCentury(date);

  // Geometric mean longitude and mean anomaly of the Sun.
  const L0 = norm360(280.46646 + T * (36000.76983 + T * 0.0003032));
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const Mr = M * DEG;

  // Eccentricity of Earth's orbit.
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

  // Equation of the centre.
  const C =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mr) * 0.000289;

  const trueLong = L0 + C;
  const trueAnom = M + C;

  // Sun-Earth distance in astronomical units.
  const distanceAu =
    (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(trueAnom * DEG));

  // Nutation/aberration correction -> apparent longitude.
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG);

  // Mean obliquity of the ecliptic, corrected to true obliquity.
  const seconds = 21.448 - T * (46.815 + T * (0.00059 - T * 0.001813));
  const eps0 = 23 + (26 + seconds / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * DEG);

  const epsR = eps * DEG;
  const lambdaR = lambda * DEG;

  const declination = Math.asin(Math.sin(epsR) * Math.sin(lambdaR)) / DEG;
  const rightAscension = norm360(
    Math.atan2(Math.cos(epsR) * Math.sin(lambdaR), Math.cos(lambdaR)) / DEG
  );

  // Equation of time (apparent solar time minus mean solar time), in minutes.
  const y = Math.tan(epsR / 2) ** 2;
  const L0r = L0 * DEG;
  const eqTime =
    (4 *
      (y * Math.sin(2 * L0r) -
        2 * e * Math.sin(Mr) +
        4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
        0.5 * y * y * Math.sin(4 * L0r) -
        1.25 * e * e * Math.sin(2 * Mr))) /
    DEG;

  return {
    declination,
    rightAscension,
    eqTime,
    distanceAu,
    apparentLongitude: lambda,
    obliquity: eps,
  };
}

/**
 * Sub-solar point for an instant.
 *
 * Latitude is simply the solar declination. Longitude follows from the fact
 * that local apparent solar time is noon at the sub-solar meridian:
 *
 *   LAT = UTC + eqTime + longitude/15 = 12h  =>  lon = 15 * (12 - UTC - eqTime)
 */
export function subsolarPoint(date) {
  const { declination, eqTime, distanceAu, rightAscension } = solarPosition(date);

  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3600000;

  return {
    lat: declination,
    lon: wrap180(15 * (12 - utcHours - eqTime / 60)),
    declination,
    rightAscension,
    eqTime,
    distanceAu,
  };
}

/**
 * Solar elevation angle above the horizon at a point on the ground, in degrees.
 * Negative values mean the Sun is below the horizon (civil twilight runs to -6).
 */
export function solarElevation(latDeg, lonDeg, subsolar) {
  const lat = latDeg * DEG;
  const sLat = subsolar.lat * DEG;
  const dLon = (lonDeg - subsolar.lon) * DEG;
  const cosZenith =
    Math.sin(lat) * Math.sin(sLat) + Math.cos(lat) * Math.cos(sLat) * Math.cos(dLon);
  return Math.asin(Math.max(-1, Math.min(1, cosZenith))) / DEG;
}
