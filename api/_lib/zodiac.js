// api/_lib/zodiac.js
// Deterministic astrology helpers derived purely from the date of birth (and,
// where given, time/place). The zodiac sign is NEVER taken as user input — it is
// computed here so it is always correct and consistent for the individual.

const SIGNS = [
  { name: 'Capricorn',  emoji: '♑', element: 'Earth', from: [12, 22], to: [1, 19] },
  { name: 'Aquarius',   emoji: '♒', element: 'Air',   from: [1, 20],  to: [2, 18] },
  { name: 'Pisces',     emoji: '♓', element: 'Water', from: [2, 19],  to: [3, 20] },
  { name: 'Aries',      emoji: '♈', element: 'Fire',  from: [3, 21],  to: [4, 19] },
  { name: 'Taurus',     emoji: '♉', element: 'Earth', from: [4, 20],  to: [5, 20] },
  { name: 'Gemini',     emoji: '♊', element: 'Air',   from: [5, 21],  to: [6, 20] },
  { name: 'Cancer',     emoji: '♋', element: 'Water', from: [6, 21],  to: [7, 22] },
  { name: 'Leo',        emoji: '♌', element: 'Fire',  from: [7, 23],  to: [8, 22] },
  { name: 'Virgo',      emoji: '♍', element: 'Earth', from: [8, 23],  to: [9, 22] },
  { name: 'Libra',      emoji: '♎', element: 'Air',   from: [9, 23],  to: [10, 22] },
  { name: 'Scorpio',    emoji: '♏', element: 'Water', from: [10, 23], to: [11, 21] },
  { name: 'Sagittarius',emoji: '♐', element: 'Fire',  from: [11, 22], to: [12, 21] },
];

// dob: 'YYYY-MM-DD'
export function sunSign(dob) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || ''));
  if (!m) return null;
  const month = +m[2], day = +m[3];
  for (const s of SIGNS) {
    const [fm, fd] = s.from, [tm, td] = s.to;
    if (fm === 12) { // Capricorn wraps the year boundary
      if ((month === 12 && day >= fd) || (month === 1 && day <= td)) return s;
    } else if ((month === fm && day >= fd) || (month === tm && day <= td)) {
      return s;
    }
  }
  return null;
}

// Numerology life-path number (1–9, plus master numbers 11/22/33) — a small,
// deterministic personalization signal unique to the exact birth date.
export function lifePathNumber(dob) {
  const digits = String(dob || '').replace(/\D/g, '');
  if (!digits) return null;
  const reduce = (n) => {
    while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
      n = String(n).split('').reduce((a, d) => a + +d, 0);
    }
    return n;
  };
  return reduce(digits.split('').reduce((a, d) => a + +d, 0));
}

export function chineseZodiac(dob) {
  const animals = ['Rat','Ox','Tiger','Rabbit','Dragon','Snake','Horse','Goat','Monkey','Rooster','Dog','Pig'];
  const y = +String(dob || '').slice(0, 4);
  if (!y) return null;
  return animals[(y - 4) % 12];
}

// A compact, individual astrological signature for prompts and storage.
export function astroProfile({ dob, birthTime, birthplace }) {
  const sun = sunSign(dob);
  return {
    sun: sun ? sun.name : null,
    sunEmoji: sun ? sun.emoji : null,
    element: sun ? sun.element : null,
    lifePath: lifePathNumber(dob),
    chinese: chineseZodiac(dob),
    birthTime: birthTime || null,
    birthplace: birthplace || null,
  };
}
