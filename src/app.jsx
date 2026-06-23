import { renderReport } from './lib/markdown.js';

const { useState, useEffect, useRef } = React;

/* ----------------------------- tiny API client ----------------------------- */
const API = '/api';
const LS = { session: 'palmly_session', identity: 'palmly_identity', reading: 'palmly_reading' };
function getSession(){ try { return localStorage.getItem(LS.session) || ''; } catch { return ''; } }
function getIdentity(){ try { return JSON.parse(localStorage.getItem(LS.identity) || 'null'); } catch { return null; } }
function getStoredReading(){ try { return JSON.parse(localStorage.getItem(LS.reading) || 'null'); } catch { return null; } }

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) { const t = getSession(); if (t) headers['Authorization'] = 'Bearer ' + t; }
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : {};
  if (!res.ok) { const e = new Error(data.error || ('Request failed (' + res.status + ')')); e.status = res.status; e.data = data; throw e; }
  return data;
}


/* --------------------------- structured PDF export --------------------------- */
function downloadPdf(reportText, fileTitle, subtitle) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 54;
  const maxW = pageW - margin * 2;
  let y = margin;
  const ensure = (h) => { if (y + h > pageH - margin) { doc.addPage(); y = margin; } };

  // Cover header band
  doc.setFillColor(27, 17, 69); doc.rect(0, 0, pageW, 96, 'F');
  doc.setTextColor(255, 178, 62); doc.setFont('helvetica', 'bold'); doc.setFontSize(26);
  doc.text('Palmly', margin, 56);
  doc.setTextColor(255, 246, 238); doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text(subtitle || 'Your personal reading', margin, 76);
  y = 130;

  const lines = reportText.split('\n');
  for (let raw of lines) {
    let line = raw.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
    if (line.trim() === '---') { ensure(20); doc.setDrawColor(255,93,115); doc.line(margin, y, pageW - margin, y); y += 18; continue; }
    if (line.startsWith('# ')) { ensure(34); doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.setTextColor(108,59,244);
      const w = doc.splitTextToSize(line.slice(2), maxW); doc.text(w, margin, y); y += w.length*24 + 6; continue; }
    if (line.startsWith('## ')) { ensure(28); doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.setTextColor(196,120,20);
      const w = doc.splitTextToSize(line.slice(3), maxW); doc.text(w, margin, y); y += w.length*19 + 4; continue; }
    if (line.startsWith('### ')) { ensure(24); doc.setFont('helvetica','bold'); doc.setFontSize(12.5); doc.setTextColor(20,140,120);
      const w = doc.splitTextToSize(line.slice(4), maxW); doc.text(w, margin, y); y += w.length*17 + 3; continue; }
    if (line.trim().startsWith('- ')) { doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor(40,30,60);
      const w = doc.splitTextToSize('•  ' + line.trim().slice(2), maxW - 14);
      w.forEach((t,i)=>{ ensure(16); doc.text(t, margin + (i===0?6:18), y); y += 15; }); y += 2; continue; }
    if (line.trim() === '') { y += 8; continue; }
    doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor(40,30,60);
    const w = doc.splitTextToSize(line, maxW);
    w.forEach(t => { ensure(16); doc.text(t, margin, y); y += 15; });
    y += 4;
  }

  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(8.5); doc.setTextColor(150,150,160); doc.setFont('helvetica','normal');
    doc.text('Palmly reads for fun, not fortune  ·  palmist.getbriefed.to', margin, pageH - 24);
    doc.text(p + ' / ' + pages, pageW - margin, pageH - 24, { align: 'right' });
  }
  doc.save((fileTitle || 'palmly-reading') + '.pdf');
}

/* ============================= AUTH MODAL ============================= */
function AuthModal({ onClose, onAuthed }) {
  const [channel, setChannel] = useState('email');
  const [identifier, setIdentifier] = useState('');
  const [phase, setPhase] = useState('enter');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const valid = channel === 'email'
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim())
    : /^\+?[1-9]\d{7,14}$/.test(identifier.replace(/[\s()-]/g, ''));

  const sendCode = async () => {
    if (!valid) { setErr(channel === 'email' ? 'Enter a valid email address.' : 'Enter a valid phone with country code, e.g. +14155551234.'); return; }
    setErr(''); setBusy(true);
    try {
      await api('/send-otp', { method: 'POST', auth: false, body: { identifier: identifier.trim(), channel } });
      setPhase('otp'); setInfo('We sent a 6-digit code to your ' + (channel === 'email' ? 'email' : 'phone') + '.');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const verify = async () => {
    if (!/^\d{6}$/.test(code)) { setErr('Enter the 6-digit code.'); return; }
    setErr(''); setBusy(true);
    try {
      const d = await api('/verify-otp', { method: 'POST', auth: false, body: { identifier: identifier.trim(), channel, code } });
      try { localStorage.setItem(LS.session, d.token); localStorage.setItem(LS.identity, JSON.stringify({ identifier: d.identifier, channel })); } catch {}
      onAuthed({ identifier: d.identifier, channel });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-1">
          <h3 className="display grad-text" style={{ fontSize: '1.5rem', fontWeight: 800 }}>Unlock your reading</h3>
          <button className="x-btn" onClick={onClose}>×</button>
        </div>
        <p style={{ color: 'var(--cream-dim)', fontSize: '.9rem', marginBottom: '1.1rem' }}>
          Sign up free to reveal your palm reading. We verify you with a quick one-time code.
        </p>

        {phase === 'enter' && (
          <div className="space-y-4">
            <div className="seg">
              <button className={channel === 'email' ? 'active' : ''} onClick={() => { setChannel('email'); setIdentifier(''); setErr(''); }}>✉️ Email</button>
              <button className={channel === 'phone' ? 'active' : ''} onClick={() => { setChannel('phone'); setIdentifier(''); setErr(''); }}>📱 Phone</button>
            </div>
            <div>
              <label>{channel === 'email' ? 'Email address' : 'Phone number'}</label>
              <input type={channel === 'email' ? 'email' : 'tel'} value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder={channel === 'email' ? 'you@example.com' : '+14155551234'}
                onKeyDown={e => e.key === 'Enter' && sendCode()} />
            </div>
            {err && <div style={{ color: 'var(--coral)', fontWeight: 600, fontSize: '.9rem' }}>{err}</div>}
            <button className="btn" onClick={sendCode} disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
            <p style={{ color: 'var(--cream-dim)', fontSize: '.75rem', textAlign: 'center' }}>
              By continuing you agree to receive a verification code. SMS rates may apply.
            </p>
          </div>
        )}

        {phase === 'otp' && (
          <div className="space-y-4">
            {info && <div style={{ color: 'var(--mint)', fontSize: '.9rem' }}>{info}</div>}
            <div>
              <label>6-digit code</label>
              <input className="otp-input" inputMode="numeric" maxLength={6} value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="––––––" onKeyDown={e => e.key === 'Enter' && verify()} />
            </div>
            {err && <div style={{ color: 'var(--coral)', fontWeight: 600, fontSize: '.9rem' }}>{err}</div>}
            <button className="btn" onClick={verify} disabled={busy}>{busy ? 'Verifying…' : 'Verify & continue'}</button>
            <button className="btn-ghost" onClick={() => { setPhase('enter'); setCode(''); setErr(''); }}>← Use a different {channel}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ====================== DAILY HOROSCOPE SUBSCRIBE MODAL ====================== */
function HoroscopeModal({ onClose, identity, palms, onSubscribed }) {
  const [form, setForm] = useState({
    fullName: '', email: (identity && identity.channel === 'email') ? identity.identifier : '',
    dob: '', birthTime: '', birthplace: '', relationship: 'Single', focus: 'Overall',
  });
  const [plan, setPlan] = useState('yearly');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  const subscribe = async () => {
    if (!form.fullName.trim() || !form.dob || !form.birthplace.trim()) { setErr('Please fill name, date of birth and birthplace.'); return; }
    if (!emailOk) { setErr('A valid email is required — your daily horoscope is delivered by email.'); return; }
    if (!getSession()) { setErr('Please sign up first (close this and tap Reveal My Reading).'); return; }
    setErr(''); setBusy(true);
    try {
      const r = await api('/horoscope-signup', { method: 'POST', body: {
        ...form, timezone: tz,
        rightHand: (palms && palms.rightHand) || null,
        leftHand: (palms && palms.leftHand) || null,
      }});
      if (r.active) { onSubscribed && onSubscribed(); return; } // admin/testing: already active, skip payment
      const d = await api('/create-checkout', { method: 'POST', body: { kind: 'subscription', plan } });
      window.location.href = d.url;
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-1">
          <h3 className="display grad-text-2" style={{ fontSize: '1.5rem', fontWeight: 800 }}>Daily Horoscope ✨</h3>
          <button className="x-btn" onClick={onClose}>×</button>
        </div>
        <p style={{ color: 'var(--cream-dim)', fontSize: '.9rem', marginBottom: '1rem' }}>
          A thorough daily forecast blending your <strong style={{color:'var(--marigold)'}}>palm lines</strong>, <strong style={{color:'var(--marigold)'}}>zodiac</strong> and today's transits — emailed every morning at <strong style={{color:'var(--marigold)'}}>6 AM your time</strong>, downloadable as PDF.
        </p>

        <div className="space-y-3">
          <div><label>Full name</label><input value={form.fullName} onChange={e=>set('fullName', e.target.value)} placeholder="Your full name" /></div>
          <div><label>Delivery email</label><input type="email" value={form.email} onChange={e=>set('email', e.target.value)} placeholder="you@example.com" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label>Date of birth</label><input type="date" value={form.dob} onChange={e=>set('dob', e.target.value)} /></div>
            <div><label>Time of birth</label><input type="time" value={form.birthTime} onChange={e=>set('birthTime', e.target.value)} /></div>
          </div>
          <div><label>Birthplace (city, country)</label><input value={form.birthplace} onChange={e=>set('birthplace', e.target.value)} placeholder="e.g. Kolkata, India" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label>Relationship</label>
              <select value={form.relationship} onChange={e=>set('relationship', e.target.value)}>
                <option>Single</option><option>Dating</option><option>Married</option><option>It's complicated</option>
              </select>
            </div>
            <div><label>Daily focus</label>
              <select value={form.focus} onChange={e=>set('focus', e.target.value)}>
                <option>Overall</option><option>Love</option><option>Career</option><option>Money</option><option>Health</option>
              </select>
            </div>
          </div>
          <p style={{ color: 'var(--cream-dim)', fontSize: '.78rem' }}>Detected timezone: <strong style={{color:'var(--mint)'}}>{tz}</strong> — used for 6 AM local delivery.</p>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className={'plan-card ' + (plan==='monthly'?'sel':'')} onClick={()=>setPlan('monthly')}>
              <div style={{fontWeight:800, fontSize:'1.2rem'}}>$3.99<span style={{fontSize:'.8rem', color:'var(--cream-dim)'}}>/mo</span></div>
              <div style={{color:'var(--cream-dim)', fontSize:'.8rem'}}>Monthly</div>
            </div>
            <div className={'plan-card ' + (plan==='yearly'?'sel':'')} onClick={()=>setPlan('yearly')}>
              <div style={{fontWeight:800, fontSize:'1.2rem'}}>$29.99<span style={{fontSize:'.8rem', color:'var(--cream-dim)'}}>/yr</span></div>
              <div style={{color:'var(--mint)', fontSize:'.8rem', fontWeight:700}}>Save 37%</div>
            </div>
          </div>

          {err && <div style={{ color: 'var(--coral)', fontWeight: 600, fontSize: '.9rem' }}>{err}</div>}
          <button className="btn" onClick={subscribe} disabled={busy}>{busy ? 'Opening checkout…' : 'Subscribe & start tomorrow ➜'}</button>
          <p style={{ color: 'var(--cream-dim)', fontSize: '.72rem', textAlign:'center' }}>Cancel anytime. Secure payment by Stripe.</p>
        </div>
      </div>
    </div>
  );
}

/* ===================== DAILY HOROSCOPE PANEL (subscribers) ===================== */
function HoroscopePanel({ horo, busy, onView, onEmail }) {
  return (
    <div className="card p-6 mt-5" style={{ borderColor: 'rgba(78,230,196,0.4)' }}>
      <div className="text-center">
        <span className="chip">🌅 Your Daily Horoscope</span>
        <p style={{ color: 'var(--cream-dim)', fontSize: '.9rem', margin: '.6rem 0 1rem' }}>
          You're subscribed — read today's anytime (it also arrives by email at 6 AM your time).
        </p>
      </div>
      {horo && (
        <div className="report" style={{ marginBottom: '1rem' }} dangerouslySetInnerHTML={renderReport(horo.content)} />
      )}
      <div className="space-y-3">
        <button className="btn" onClick={onView} disabled={!!busy}>
          {busy === 'view' ? 'Reading the stars…' : (horo ? "Refresh today's horoscope" : "View today's horoscope ✨")}
        </button>
        {horo && (
          <button className="btn-ghost" onClick={() => downloadPdf(horo.content, 'palmly-horoscope-' + horo.date, 'Daily Horoscope · ' + horo.date)}>⬇ Download PDF</button>
        )}
        <button className="btn-ghost" onClick={onEmail} disabled={!!busy}>{busy === 'email' ? 'Sending…' : '📧 Email it to me'}</button>
      </div>
    </div>
  );
}

/* ================================== APP ================================== */
function App() {
  const [step, setStep] = useState('intake');
  const [name, setName] = useState('');
  const [gender, setGender] = useState('Female');
  const [age, setAge] = useState('');
  const [rightHand, setRightHand] = useState(null);
  const [leftHand, setLeftHand] = useState(null);
  const [rightPreview, setRightPreview] = useState(null);
  const [leftPreview, setLeftPreview] = useState(null);

  const [readingId, setReadingId] = useState(null);
  const [teaser, setTeaser] = useState('');
  const [fullReport, setFullReport] = useState('');
  const [entitled, setEntitled] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [uploading, setUploading] = useState(null);
  const [busyPay, setBusyPay] = useState(false);
  // Background full-report generation (Phase 2). Kept in refs so it survives re-renders.
  const fullStarted = useRef(false);
  const fullPromise = useRef(null);

  const [identity, setIdentity] = useState(getIdentity());
  const [showAuth, setShowAuth] = useState(false);
  const [authIntent, setAuthIntent] = useState('reveal'); // 'reveal' | 'signin'
  const [showHoroscope, setShowHoroscope] = useState(false);
  const [horo, setHoro] = useState(null);       // { date, content }
  const [horoBusy, setHoroBusy] = useState('');  // '', 'view', 'email'
  const [banner, setBanner] = useState('');

  // Restore prior reading + handle Stripe redirect on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paid = params.get('paid');
    const sessionId = params.get('session_id');
    const horoscopeDate = params.get('horoscope');
    const stored = getStoredReading();
    if (stored) { setReadingId(stored.readingId); setTeaser(stored.teaser || ''); if (stored.name) setName(stored.name); if (stored.teaser) setStep('report'); }

    // Daily-horoscope PDF download link (from the email): fetch + render to PDF.
    if (horoscopeDate && getSession()) {
      (async () => {
        try {
          const d = await api('/get-horoscope?date=' + encodeURIComponent(horoscopeDate));
          downloadPdf(d.content, 'palmly-horoscope-' + d.date, 'Daily Horoscope · ' + d.date);
          setBanner('⬇ Your daily horoscope for ' + d.date + ' has been downloaded as a PDF.');
        } catch (e) { setBanner('Could not load that horoscope: ' + e.message); }
        finally { window.history.replaceState({}, '', window.location.pathname); }
      })();
      return;
    }

    if (paid === '1' && sessionId) {
      (async () => {
        try {
          const d = await api('/verify-checkout?session_id=' + encodeURIComponent(sessionId));
          if (d.kind === 'subscription') {
            setSubscribed(true);
            setBanner("🎉 You're subscribed! Your first daily horoscope arrives tomorrow at 6 AM your time.");
          } else if (d.kind === 'unlock') {
            setSubscribed(!!d.subscribed);
            const rid = d.readingId || (stored && stored.readingId);
            if (rid) await loadFullReport(rid);
            setBanner('✨ Unlocked! Here is your full reading — download it as a PDF below.');
          }
        } catch (e) { setBanner('We could not confirm your payment automatically: ' + e.message); }
        finally { window.history.replaceState({}, '', window.location.pathname); }
      })();
    } else if (stored && stored.readingId && getSession()) {
      // Returning user (or already-unlocked): refresh entitlement so the full report
      // shows automatically if they've paid. A 402 simply keeps the paywall.
      loadFullReport(stored.readingId);
    } else if (getSession()) {
      // Signed in but nothing stored locally (e.g. new device) — pull their account.
      refreshAccount();
    }
  }, []); // eslint-disable-line

  const persistReading = (rid, tsr) => { try { localStorage.setItem(LS.reading, JSON.stringify({ readingId: rid, teaser: tsr, name })); } catch {} };

  const processImage = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1100; let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height*maxDim/width); width = maxDim; }
          else { width = Math.round(width*maxDim/height); height = maxDim; }
        }
        const c = document.createElement('canvas'); c.width = width; c.height = height;
        c.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => reject(new Error('Could not read this image. Try a JPEG or PNG.'));
      img.src = ev.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });

  const handleUpload = async (e, hand) => {
    const file = e.target.files[0]; if (!file) return;
    setError(''); setUploading(hand);
    try {
      const jpeg = await processImage(file);
      if (hand === 'right') { setRightHand(jpeg); setRightPreview(jpeg); } else { setLeftHand(jpeg); setLeftPreview(jpeg); }
    } catch (err) { setError(err.message || 'That image could not be processed.'); }
    finally { setUploading(null); }
  };
  const clearImage = (hand) => {
    if (hand === 'right') { setRightHand(null); setRightPreview(null); } else { setLeftHand(null); setLeftPreview(null); }
  };

  const onReveal = () => {
    if (!name.trim() || !age.trim()) { setError('Please enter your name and age.'); return; }
    if (!rightHand && !leftHand) { setError('Please add at least one palm photo.'); return; }
    setError('');
    if (!getSession()) { setAuthIntent('reveal'); setShowAuth(true); return; } // must sign up first
    generateReading();
  };

  // Kick off (once) the background generation of the full report. Uses the palm
  // images still in memory; resolves when the full text is saved server-side.
  const ensureFull = (rid) => {
    if (!rid) return Promise.resolve();
    if (!fullStarted.current) {
      fullStarted.current = true;
      fullPromise.current = api('/generate-full', { method: 'POST', body: {
        readingId: rid, rightHand: rightHand || null, leftHand: leftHand || null,
      }}).catch((e) => { fullStarted.current = false; throw e; });
    }
    return fullPromise.current;
  };

  const generateReading = async () => {
    setError(''); setStep('reading'); setProgress('Reading the lines of your palm…');
    const msgs = ['Reading the lines of your palm…','Studying your mounts…','Shaping your preview…'];
    let i = 0; const timer = setInterval(() => { setProgress(msgs[i % msgs.length]); i++; }, 3000);
    try {
      // PHASE 1: fast teaser.
      const d = await api('/read-palm', { method: 'POST', body: {
        name: String(name), gender: String(gender), age: String(age),
        rightHand: rightHand || null, leftHand: leftHand || null,
      }});
      clearInterval(timer);
      setReadingId(d.readingId); setTeaser(d.teaser || ''); persistReading(d.readingId, d.teaser || '');
      setEntitled(!!d.entitled); setSubscribed(!!d.subscribed);
      setStep('report'); // show the teaser immediately

      // PHASE 2: build the full report in the background while they read.
      ensureFull(d.readingId)
        .then(() => { if (d.entitled) loadFullReport(d.readingId); }) // admins see it fill in
        .catch(() => {});
    } catch (err) {
      clearInterval(timer);
      if (err.status === 401) { setStep('intake'); setShowAuth(true); return; }
      setError(err.message || 'The stars are clouded. Please try again.'); setStep('intake');
    }
  };

  // Fetch the full report; if it's still generating, poll briefly until ready.
  const loadFullReport = async (rid, tries = 0) => {
    try {
      const d = await api('/get-report?readingId=' + encodeURIComponent(rid));
      if (d.generating) {
        if (tries < 20) { setTimeout(() => loadFullReport(rid, tries + 1), 2000); }
        setEntitled(true); setReadingId(rid); setStep('report');
        return;
      }
      setFullReport(d.full || ''); setEntitled(true); setReadingId(rid); setStep('report');
      if (d.teaser && !teaser) setTeaser(d.teaser);
    } catch (e) {
      if (e.status === 402) setEntitled(false); else setBanner(e.message);
    }
  };

  const unlock = async () => {
    if (!getSession()) { setShowAuth(true); return; }
    setBusyPay(true);
    try {
      // Make sure the full report is saved before we leave the page for Stripe
      // (after the redirect the images are gone, so it must already be in the DB).
      await ensureFull(readingId).catch(() => {});
      const d = await api('/create-checkout', { method: 'POST', body: { kind: 'unlock', readingId } });
      window.location.href = d.url;
    } catch (e) { setError(e.message); setBusyPay(false); }
  };

  const reset = () => {
    setStep('intake'); setName(''); setAge(''); setGender('Female');
    setRightHand(null); setLeftHand(null); setRightPreview(null); setLeftPreview(null);
    setReadingId(null); setTeaser(''); setFullReport(''); setEntitled(false); setError('');
    fullStarted.current = false; fullPromise.current = null;
    try { localStorage.removeItem(LS.reading); } catch {}
  };

  const onAuthed = (id) => {
    setIdentity(id); setShowAuth(false);
    if (authIntent === 'reveal' && step === 'intake' && (rightHand || leftHand)) { generateReading(); return; }
    // Returning sign-in: load whatever they already have.
    refreshAccount();
  };

  // Pull the signed-in user's existing reading + subscription (no photo needed).
  const refreshAccount = async () => {
    try {
      const a = await api('/my-account');
      setSubscribed(!!a.subscribed);
      if (a.reading) {
        setReadingId(a.reading.readingId); setTeaser(a.reading.teaser || ''); if (a.reading.name) setName(a.reading.name);
        persistReading(a.reading.readingId, a.reading.teaser || '');
        if (a.reading.unlocked) { fullStarted.current = true; await loadFullReport(a.reading.readingId); }
        else { setEntitled(false); setStep('report'); }
      } else if (a.subscribed) {
        setBanner('Welcome back! Open your Daily Horoscope below.'); setStep('intake');
      } else {
        setBanner("You're signed in. Upload a palm to get your reading."); setStep('intake');
      }
    } catch (e) { setBanner(e.message); }
  };

  const openSignIn = () => { setAuthIntent('signin'); setShowAuth(true); };

  // On-demand daily horoscope (active subscribers / admin).
  const viewHoroscope = async (sendEmail) => {
    setHoroBusy(sendEmail ? 'email' : 'view');
    try {
      const d = await api('/horoscope-now', { method: 'POST', body: { sendEmail: !!sendEmail } });
      setHoro({ date: d.date, content: d.content });
      if (sendEmail) setBanner('📧 Sent today\'s horoscope to your email.');
    } catch (e) {
      if (e.status === 402) { setBanner('Subscribe to unlock your daily horoscope.'); setShowHoroscope(true); }
      else setBanner(e.message);
    } finally { setHoroBusy(''); }
  };

  const Logo = () => (
    <div className="flex items-center justify-center gap-2 mb-3">
      <span style={{fontSize:'2rem'}}>✋</span>
      <span className="display grad-text" style={{fontSize:'2.6rem', fontWeight:900, letterSpacing:'-0.02em'}}>Palmly</span>
      <span style={{fontSize:'1.4rem'}}>✨</span>
    </div>
  );

  return (
    <div className="min-h-screen relative" style={{zIndex:1}}>
      <header className="relative pt-12 pb-6 px-4 text-center reveal-up" style={{zIndex:2}}>
        <Logo />
        <p className="font-bold tracking-wide" style={{color:'var(--cream-dim)', fontSize:'1rem'}}>Ancient palmistry, read by AI ✨</p>
        {identity && <p style={{color:'var(--mint)', fontSize:'.78rem', marginTop:'.4rem'}}>Signed in as {identity.identifier}</p>}
      </header>

      {banner && (
        <div className="relative px-4 max-w-xl mx-auto mb-4" style={{zIndex:3}}>
          <div className="card" style={{padding:'.9rem 1.1rem', borderColor:'rgba(78,230,196,0.5)'}}>
            <div className="flex justify-between items-start gap-3">
              <p style={{fontSize:'.92rem'}}>{banner}</p>
              <button className="x-btn" style={{fontSize:'1.2rem'}} onClick={()=>setBanner('')}>×</button>
            </div>
          </div>
        </div>
      )}

      {step === 'intake' && (
        <main className="relative px-4 pb-16 max-w-xl mx-auto reveal-up" style={{zIndex:2}}>
          <div className="card p-6 sm:p-8">
            <div className="text-center mb-6"><span className="chip">🔮 Free reading</span></div>
            <div className="space-y-5">
              <div><label>Your name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="What should we call you?" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label>Gender</label>
                  <select value={gender} onChange={e=>setGender(e.target.value)}><option>Female</option><option>Male</option><option>Other</option></select>
                </div>
                <div><label>Age</label><input type="number" value={age} onChange={e=>setAge(e.target.value)} placeholder="Age" min="1" max="120" /></div>
              </div>

              <div className="text-center pt-1">
                <span className="font-bold" style={{color:'var(--marigold)', fontSize:'.8rem', letterSpacing:'.1em', textTransform:'uppercase'}}>📸 Add your palm</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[['right','Right hand','✋'],['left','Left hand','🤚']].map(([hand,labelText,emoji]) => {
                  const preview = hand==='right'?rightPreview:leftPreview;
                  return (
                    <div key={hand}>
                      <label>{labelText}</label>
                      <label className={`upload block ${preview?'filled':''}`}>
                        {preview ? (
                          <div>
                            <img src={preview} alt={labelText} />
                            <button type="button" onClick={(e)=>{e.preventDefault();clearImage(hand);}} className="font-bold mt-2 underline" style={{color:'var(--coral)', fontSize:'.8rem'}}>Remove</button>
                          </div>
                        ) : uploading===hand ? (
                          <div style={{padding:'1rem 0'}}><div className="orb" style={{width:40,height:40}}></div></div>
                        ) : (
                          <div><div style={{fontSize:'1.8rem'}}>{emoji}</div><p className="font-bold mt-1" style={{fontSize:'.85rem'}}>Tap to add</p></div>
                        )}
                        <input type="file" accept="image/*,.heic,.heif" className="hidden" onChange={e=>handleUpload(e,hand)} />
                      </label>
                    </div>
                  );
                })}
              </div>
              <p className="text-center" style={{color:'var(--cream-dim)', fontSize:'.85rem'}}>One hand works. Both reveal more. 🌟</p>

              {error && <div className="text-center font-semibold" style={{color:'var(--coral)'}}>{error}</div>}
              <button onClick={onReveal} className="btn" disabled={uploading}>Reveal My Reading ✨</button>
              <p className="text-center" style={{color:'var(--cream-dim)', fontSize:'.78rem'}}>Free sign-up required · full reading + PDF for $2</p>
              {!identity && (
                <p className="text-center" style={{fontSize:'.85rem'}}>
                  Already have an account?{' '}
                  <button onClick={openSignIn} className="font-bold underline" style={{color:'var(--mint)', background:'none', border:'none', cursor:'pointer', fontSize:'.85rem'}}>Sign in</button>
                </p>
              )}
            </div>
          </div>

          {subscribed && <HoroscopePanel horo={horo} busy={horoBusy} onView={()=>viewHoroscope(false)} onEmail={()=>viewHoroscope(true)} />}

          {/* Daily horoscope promo */}
          <div className="card p-6 mt-5" style={{borderColor:'rgba(78,230,196,0.35)'}}>
            <div className="text-center">
              <span className="chip">🌅 New · Daily Horoscope</span>
              <h3 className="display grad-text-2 mt-3" style={{fontSize:'1.5rem', fontWeight:800}}>Wake up to your day, decoded</h3>
              <p style={{color:'var(--cream-dim)', fontSize:'.92rem', margin:'.6rem 0 1rem'}}>
                A thorough daily forecast from your palm lines, zodiac &amp; today's transits — emailed at 6 AM your time, downloadable as PDF.
              </p>
              <button className="btn-ghost" onClick={()=>setShowHoroscope(true)}>See plans — from $3.99/mo ➜</button>
            </div>
          </div>

          <details className="mt-5 card p-4">
            <summary className="flex items-center gap-2 font-bold" style={{color:'var(--marigold)', fontSize:'.85rem'}}>
              <span className="arrow">▸</span> Is this for real?
            </summary>
            <p style={{color:'var(--cream-dim)', fontSize:'.92rem', marginTop:'.6rem', lineHeight:1.6}}>
              Palmistry is a fun, ancient tradition — not science! Palmly blends classic Indian and Western palm-reading wisdom into a playful reading just for you. Take what sparks joy, leave the rest. 💛
            </p>
          </details>
        </main>
      )}

      {step === 'reading' && (
        <main className="relative px-4 py-20 max-w-md mx-auto text-center reveal-up" style={{zIndex:2}}>
          <div className="orb mb-8"></div>
          <p className="display grad-text-2" style={{fontSize:'1.6rem', fontWeight:700, marginBottom:'.5rem'}}>Reading your palm</p>
          <p className="font-medium" style={{color:'var(--cream-dim)', fontSize:'1.05rem'}}>{progress}</p>
        </main>
      )}

      {step === 'report' && (
        <main className="relative px-4 pb-16 max-w-2xl mx-auto reveal-up" style={{zIndex:2}}>
          <div className="card p-6 sm:p-9">
            <div className="text-center mb-2"><span className="chip">✨ {name || 'Your'} reading</span></div>

            {entitled ? (
              <>
                <div className="report" dangerouslySetInnerHTML={renderReport(fullReport || teaser)} />
                <div className="mt-10 space-y-3">
                  <button className="btn" onClick={()=>downloadPdf(fullReport || teaser, ('palmly-' + (name||'reading')).toLowerCase().replace(/\s+/g,'-'), (name ? name + "'s palm reading" : 'Your palm reading'))}>⬇ Download PDF</button>
                  <button onClick={reset} className="btn-ghost">Read Another Palm ✋</button>
                  {!subscribed && <button onClick={()=>setShowHoroscope(true)} className="btn-ghost">Get a Daily Horoscope 🌅</button>}
                </div>
              </>
            ) : (
              <>
                <div className="lock-wrap">
                  <div className="report" dangerouslySetInnerHTML={renderReport(teaser)} />
                  <div className="report blur-teaser" aria-hidden="true" dangerouslySetInnerHTML={renderReport('## Your Heart Line\nLove runs deep, and there is far more your lines reveal about who you connect with and why…\n\n## Career & Destiny\nThe fate line points toward a turning point — the full reading lays out the timing and what to watch for.\n\n## The Next 5 Years\nYear by year, your palm hints at change, momentum and the moments that matter most…')} />
                  <div className="lock-fade"></div>
                </div>

                <div className="card mt-2 p-5 text-center" style={{borderColor:'rgba(255,178,62,0.5)'}}>
                  <div style={{fontSize:'1.6rem'}}>🔒</div>
                  <h3 className="display" style={{fontSize:'1.3rem', fontWeight:800, color:'var(--marigold)', margin:'.4rem 0'}}>Unlock your full reading</h3>
                  <p style={{color:'var(--cream-dim)', fontSize:'.92rem', marginBottom:'1rem'}}>
                    See every line — heart, head, life, fate — plus your 5-year forecast, and download it all as a beautiful PDF.
                  </p>
                  {error && <div className="font-semibold mb-2" style={{color:'var(--coral)'}}>{error}</div>}
                  <button className="btn" onClick={unlock} disabled={busyPay}>{busyPay ? 'Opening checkout…' : 'Unlock full reading + PDF — $2'}</button>
                  <p style={{color:'var(--cream-dim)', fontSize:'.72rem', marginTop:'.6rem'}}>One-time payment · secure checkout by Stripe</p>
                  <button onClick={()=>readingId && loadFullReport(readingId)} className="font-bold underline mt-3" style={{color:'var(--mint)', background:'none', border:'none', cursor:'pointer', fontSize:'.8rem'}}>Already paid? Refresh</button>
                </div>

                <button onClick={reset} className="btn-ghost mt-4">Read Another Palm ✋</button>
              </>
            )}
          </div>

          {subscribed && <HoroscopePanel horo={horo} busy={horoBusy} onView={()=>viewHoroscope(false)} onEmail={()=>viewHoroscope(true)} />}
        </main>
      )}

      <footer className="relative text-center py-8 px-4" style={{zIndex:2}}>
        <p style={{color:'var(--cream-dim)', fontSize:'.8rem'}}>Made with ✨ · Palmly reads for fun, not fortune</p>
      </footer>

      {showAuth && <AuthModal onClose={()=>setShowAuth(false)} onAuthed={onAuthed} />}
      {showHoroscope && <HoroscopeModal onClose={()=>setShowHoroscope(false)} identity={identity} palms={{ rightHand, leftHand }}
        onSubscribed={()=>{ setSubscribed(true); setShowHoroscope(false); setBanner("🎉 You're all set — your daily horoscope will arrive at 6 AM your local time."); }} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<App />);
