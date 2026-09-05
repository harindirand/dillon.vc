// Bright-star catalogue (subset of the Yale BSC): right ascension in hours,
// declination in degrees (J2000), visual magnitude.
type Star = { ra: number; dec: number; mag: number };

const BRIGHT: Star[] = [
  { ra: 6.752, dec: -16.716, mag: -1.46 }, // Sirius
  { ra: 6.399, dec: -52.696, mag: -0.72 }, // Canopus
  { ra: 14.661, dec: -60.834, mag: -0.27 }, // Rigil Kentaurus
  { ra: 14.261, dec: 19.182, mag: -0.05 }, // Arcturus
  { ra: 18.616, dec: 38.784, mag: 0.03 }, // Vega
  { ra: 5.278, dec: 45.998, mag: 0.08 }, // Capella
  { ra: 5.242, dec: -8.202, mag: 0.13 }, // Rigel
  { ra: 7.655, dec: 5.225, mag: 0.34 }, // Procyon
  { ra: 5.92, dec: 7.407, mag: 0.5 }, // Betelgeuse
  { ra: 1.628, dec: -57.237, mag: 0.46 }, // Achernar
  { ra: 14.064, dec: -60.373, mag: 0.61 }, // Hadar
  { ra: 19.847, dec: 8.868, mag: 0.77 }, // Altair
  { ra: 4.599, dec: 16.509, mag: 0.85 }, // Aldebaran
  { ra: 16.49, dec: -26.432, mag: 0.96 }, // Antares
  { ra: 13.42, dec: -11.161, mag: 0.98 }, // Spica
  { ra: 12.443, dec: -63.099, mag: 1.25 }, // Acrux
  { ra: 22.961, dec: -29.622, mag: 1.16 }, // Fomalhaut
  { ra: 20.691, dec: 45.28, mag: 1.25 }, // Deneb
  { ra: 10.139, dec: 11.967, mag: 1.35 }, // Regulus
  { ra: 7.755, dec: 28.026, mag: 1.14 }, // Pollux
  { ra: 12.795, dec: -59.689, mag: 1.3 }, // Mimosa
  { ra: 7.577, dec: 31.888, mag: 1.58 }, // Castor
  { ra: 12.9, dec: 55.96, mag: 1.76 }, // Alioth
  { ra: 13.792, dec: 49.313, mag: 1.85 }, // Mizar
  { ra: 11.062, dec: 61.751, mag: 1.79 }, // Dubhe
  { ra: 2.53, dec: 89.264, mag: 1.97 }, // Polaris
  { ra: 5.679, dec: -1.943, mag: 1.64 }, // Alnitak
  { ra: 5.604, dec: -1.202, mag: 1.69 }, // Alnilam
  { ra: 5.533, dec: -0.299, mag: 2.25 }, // Mintaka
  { ra: 5.418, dec: 6.35, mag: 1.64 }, // Bellatrix
  { ra: 5.795, dec: -9.67, mag: 2.06 }, // Saiph
  { ra: 3.405, dec: 49.861, mag: 1.79 }, // Mirfak
  { ra: 0.139, dec: 29.09, mag: 2.07 }, // Alpheratz
  { ra: 1.163, dec: 35.62, mag: 2.06 }, // Mirach
  { ra: 2.065, dec: 42.33, mag: 2.1 }, // Almach
  { ra: 3.136, dec: 40.956, mag: 2.12 }, // Algol
  { ra: 9.46, dec: -8.659, mag: 2.0 }, // Alphard
  { ra: 11.817, dec: 14.572, mag: 2.14 }, // Denebola
  { ra: 15.735, dec: 26.715, mag: 2.22 }, // Alphecca
  { ra: 17.582, dec: 12.56, mag: 2.08 }, // Rasalhague
  { ra: 16.005, dec: -22.622, mag: 2.56 }, // Dschubba
  { ra: 17.56, dec: -37.104, mag: 1.86 }, // Shaula
  { ra: 17.708, dec: -39.03, mag: 2.39 }, // Lesath
  { ra: 18.403, dec: -34.384, mag: 1.79 }, // Kaus Australis
  { ra: 19.163, dec: -21.024, mag: 2.6 }, // Nunki
  { ra: 8.159, dec: -47.337, mag: 1.5 }, // Avior
  { ra: 9.22, dec: -69.717, mag: 1.68 }, // Miaplacidus
  { ra: 9.285, dec: -59.275, mag: 2.21 }, // Aspidiske
  { ra: 10.716, dec: -64.394, mag: 2.21 }, // Suhail
  { ra: 8.375, dec: -59.51, mag: 1.86 }, // Delta Velorum
  { ra: 8.745, dec: -54.709, mag: 1.75 }, // Regor
  { ra: 6.378, dec: -17.956, mag: 1.98 }, // Mirzam
  { ra: 7.14, dec: -26.393, mag: 1.83 }, // Wezen
  { ra: 7.402, dec: -29.303, mag: 2.45 }, // Aludra
  { ra: 6.977, dec: -28.972, mag: 1.5 }, // Adhara
  { ra: 12.573, dec: -57.113, mag: 1.63 }, // Gacrux
  { ra: 12.519, dec: -68.108, mag: 2.79 }, // Acrux B region
  { ra: 21.309, dec: 62.585, mag: 2.45 }, // Alderamin
  { ra: 22.137, dec: -46.961, mag: 1.74 }, // Alnair
  { ra: 23.063, dec: 28.083, mag: 2.83 }, // Scheat
  { ra: 23.079, dec: 15.205, mag: 2.49 }, // Markab
  { ra: 0.726, dec: -17.987, mag: 2.04 }, // Diphda
  { ra: 2.119, dec: 23.462, mag: 2.0 }, // Hamal
  { ra: 3.792, dec: 24.105, mag: 2.87 }, // Alcyone
  { ra: 4.949, dec: 33.166, mag: 2.69 }, // Elnath
  { ra: 5.992, dec: 44.947, mag: 2.62 }, // Menkalinan
  { ra: 6.247, dec: 22.507, mag: 2.88 }, // Tejat
  { ra: 8.925, dec: 5.946, mag: 3.11 },
  { ra: 10.333, dec: 19.842, mag: 3.44 },
  { ra: 11.235, dec: 20.524, mag: 3.45 },
  { ra: 13.399, dec: 54.925, mag: 2.27 }, // Alkaid
  { ra: 14.845, dec: 74.156, mag: 2.08 }, // Kochab
  { ra: 15.578, dec: -60.375, mag: 2.3 },
  { ra: 16.09, dec: -19.805, mag: 2.29 }, // Acrab
  { ra: 17.505, dec: -43.239, mag: 2.29 },
  { ra: 18.11, dec: -50.091, mag: 1.92 }, // Peacock-ish
  { ra: 20.427, dec: -56.735, mag: 1.94 }, // Peacock
  { ra: 21.744, dec: -16.127, mag: 2.87 },
  { ra: 22.711, dec: -46.885, mag: 2.11 },
  { ra: 1.43, dec: 60.235, mag: 2.15 }, // Schedar
  { ra: 0.675, dec: 56.537, mag: 2.28 }, // Caph
  { ra: 0.945, dec: 60.717, mag: 2.15 }, // Gamma Cas
  { ra: 1.906, dec: 63.67, mag: 2.68 }, // Ruchbah
  { ra: 3.902, dec: 31.884, mag: 3.53 },
  { ra: 4.476, dec: 15.628, mag: 3.53 },
  { ra: 7.301, dec: 16.54, mag: 3.57 },
  { ra: 9.765, dec: 23.774, mag: 3.52 },
  { ra: 12.257, dec: -17.542, mag: 3.0 },
  { ra: 14.975, dec: 27.074, mag: 3.68 },
  { ra: 16.836, dec: -34.293, mag: 2.82 },
  { ra: 18.921, dec: -26.297, mag: 2.05 }, // Kaus-ish
  { ra: 19.077, dec: 13.863, mag: 3.36 },
  { ra: 20.37, dec: 40.257, mag: 2.87 }, // Sadr
  { ra: 21.216, dec: 30.226, mag: 3.21 },
  { ra: 22.096, dec: 6.198, mag: 2.95 }, // Sadalsuud
  { ra: 22.877, dec: -15.821, mag: 2.9 }, // Skat-ish
  { ra: 3.037, dec: 4.09, mag: 3.47 },
  { ra: 6.629, dec: -43.196, mag: 3.24 },
  { ra: 10.279, dec: -61.332, mag: 2.68 },
];

// Deterministic faint filler so the sky has depth without shipping 9,000 rows.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FILLER: Star[] = (() => {
  const rnd = mulberry32(20260813);
  const out: Star[] = [];
  for (let i = 0; i < 1400; i++) {
    const ra = rnd() * 24;
    const dec = (Math.acos(2 * rnd() - 1) * 180) / Math.PI - 90;
    out.push({ ra, dec, mag: 3.8 + rnd() * 2.6 });
  }
  return out;
})();

export const stars: Star[] = [...BRIGHT, ...FILLER];

/** Greenwich mean sidereal time in degrees for a given instant. */
export function gmstDeg(date: Date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;
  let g =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * t * t -
    (t * t * t) / 38710000;
  g %= 360;
  return g < 0 ? g + 360 : g;
}

/**
 * Star positions as geographic coordinates for the given instant: a star at
 * [lon, lat] is directly overhead that point on Earth, so the same rotation
 * that orients the globe orients the real sky behind it.
 */
export function skyPoints(date: Date) {
  const g = gmstDeg(date);
  return stars.map((s) => {
    let lon = s.ra * 15 - g;
    lon = ((((lon + 180) % 360) + 360) % 360) - 180;
    return { lon, lat: s.dec, mag: s.mag };
  });
}
