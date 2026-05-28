// /api/read-palm.js
// Vercel serverless function — proxies to Anthropic API, keeps key server-side

export const config = {
  maxDuration: 60, // 60s timeout (Hobby plan limit)
  api: {
    bodyParser: {
      sizeLimit: '10mb', // palm photos can be large
    },
  },
};

// Simple in-memory rate limit (resets on cold start — fine for v1)
// For production: replace with Upstash Redis or Supabase counter
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5; // 5 readings per IP per hour for free tier

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function checkRateLimit(ip, isPro) {
  if (isPro) return { allowed: true };
  const now = Date.now();
  const record = rateLimits.get(ip) || { count: 0, windowStart: now };

  if (now - record.windowStart > RATE_LIMIT_WINDOW) {
    rateLimits.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return {
      allowed: false,
      retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - record.windowStart)) / 1000),
    };
  }

  record.count += 1;
  rateLimits.set(ip, record);
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count };
}

function buildPrompt({ name, gender, age, handsProvided }) {
  return `You are acting as a Master Palmist with deep expertise in both classical Indian palmistry (Samudrik Shastra / Hast Rekha) and Western palmistry traditions. Read the attached palm image(s) and produce a best-in-class, detailed report as the most capable palmist would deliver it.

SUBJECT DETAILS
Name: ${name}
Gender: ${gender}
Age: ${age}
Hand(s) provided: ${handsProvided}

GROUND RULES
1. Use ONLY what the palm images show. Do not invent details that aren't visible.
2. Open with a one-line caveat that palmistry is interpretive tradition, not science — then proceed confidently as a master palmist would.
3. If both hands are provided, contrast the left (inner self / inherited nature) with the right (active self / what they've built) and comment on divergence.
4. Be specific and grounded in what is actually visible. If a feature is unclear, say so rather than invent.
5. Do not predict literal date or manner of death. Speak of vitality, life force, and longevity within the tradition's symbolic frame.
6. Tone: warm, confident, observant — like a wise practitioner sitting across from the person.
7. Address the subject by name (${name}) periodically through the reading.

REPORT STRUCTURE — cover all of the following with depth:

# A Full Palmistry Reading — ${name}

## Part One: The Hand as a Whole
Hand shape and elemental type, finger length and tips, skin texture, thumb (set, angle, willpower vs logic phalanges), overall first impression of nature.

## Part Two: The Mounts
Read each: Jupiter, Saturn, Apollo/Sun, Mercury, Mars (Upper & Lower), Venus, Luna/Moon, Neptune, Rahu zone, Ketu zone — what each indicates about ${name}.

## Part Three: The Major Lines
Heart Line, Head Line, Life Line, Fate Line, Sun/Apollo Line, Mercury/Health Line, Marriage Line(s), Children Lines, Girdle of Venus, Bracelets/Rascettes, and any special markings (stars, crosses, triangles, squares, islands, grilles).

## Part Four: Each Aspect of Life
Education, Career, Finance and wealth pattern, Health (physical and mental), Family of origin, Spouse/marriage, Children, Friendships, Enemies and adversaries, Affairs/extramarital patterns past or future (be direct), Travel and foreign connections, Spirituality and inner life, Death indicators (symbolic only, never literal dates).

## Part Five: Future in Five-Year Spells
Starting from age ${age}, project forward in 5-year increments until the natural endpoint the hand suggests. For each spell describe: dominant theme, career/financial trajectory, relationship and family themes, health considerations, opportunities and challenges, what the phase is building toward.

## Part Six: Closing
The single most striking feature of the hand. What the left vs. right divergence reveals about agency. The honest "best part" of the reading. An invitation to ask about any zone in more depth.

STYLE
Flowing prose with clear section headers. Specific observations, not generic claims. Cover the good, the challenging, and the best honestly. Comprehensive length — full detailed report, not summary.

Begin the reading now.`;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Pro-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, gender, age, rightHand, leftHand, email } = req.body;

    // Validation
    if (!name?.trim() || !age) {
      return res.status(400).json({ error: 'Name and age are required.' });
    }
    if (!rightHand && !leftHand) {
      return res.status(400).json({ error: 'At least one palm image is required.' });
    }

    // Pro check — Pro tokens skip rate limiting
    const proToken = req.headers['x-pro-token'];
    const isPro = await verifyProToken(proToken, email);

    // Rate limit
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, isPro);
    if (!rl.allowed) {
      return res.status(429).json({
        error: 'Free readings exhausted. Upgrade to Pro for unlimited readings, or wait an hour.',
        retryAfter: rl.retryAfter,
        upgrade: true,
      });
    }

    // Build message
    const handsProvided =
      rightHand && leftHand ? 'Both right and left hands'
      : rightHand ? 'Right hand only'
      : 'Left hand only';

    const content = [
      { type: 'text', text: buildPrompt({ name, gender, age, handsProvided }) },
    ];

    if (rightHand) {
      const media_type = rightHand.match(/data:(.*?);/)?.[1] || 'image/jpeg';
      content.push({
        type: 'image',
        source: { type: 'base64', media_type, data: rightHand.split(',')[1] },
      });
      content.push({ type: 'text', text: '↑ RIGHT hand.' });
    }
    if (leftHand) {
      const media_type = leftHand.match(/data:(.*?);/)?.[1] || 'image/jpeg';
      content.push({
        type: 'image',
        source: { type: 'base64', media_type, data: leftHand.split(',')[1] },
      });
      content.push({ type: 'text', text: '↑ LEFT hand.' });
    }

    // Call Anthropic
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Anthropic API error:', anthropicRes.status, errText);
      return res.status(502).json({ error: 'The reading could not be completed. Please try again.' });
    }

    const data = await anthropicRes.json();
    const reading = data.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || '';

    if (!reading) {
      return res.status(502).json({ error: 'The reading came back empty. Please try again.' });
    }

    // Log to Supabase (fire-and-forget — don't block response)
    logReading({ name, gender, age, email, ip, isPro, length: reading.length }).catch(err =>
      console.error('Logging failed:', err)
    );

    return res.status(200).json({
      reading,
      remaining: rl.remaining,
      isPro,
    });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
  }
}

// === Supabase logging (optional — runs only if env vars set) ===
async function logReading({ name, gender, age, email, ip, isPro, length }) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return;

  await fetch(`${process.env.SUPABASE_URL}/rest/v1/palm_readings`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      subject_name: name,
      subject_gender: gender,
      subject_age: parseInt(age),
      requester_email: email || null,
      requester_ip: ip,
      is_pro: isPro,
      reading_length: length,
      created_at: new Date().toISOString(),
    }),
  });
}

// === Pro token verification (stub — wire to your auth system) ===
async function verifyProToken(token, email) {
  if (!token || !email) return false;
  // For v1: simple shared admin token via env var
  if (token === process.env.ADMIN_PRO_TOKEN) return true;
  // For v2: check Supabase pro_users table
  if (!process.env.SUPABASE_URL) return false;
  try {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/pro_users?email=eq.${encodeURIComponent(email)}&token=eq.${encodeURIComponent(token)}&select=id`,
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}
