/* Aesthetic Men · agenda de reservas
   Con API_URL vacío funciona en modo demostración (agenda simulada en el navegador).
   Con la URL del Apps Script (backend/Code.gs) lee y escribe en el Google Calendar de la barbería. */
const AM = (() => {
  const CONFIG = {
    API_URL: '',            // pegar aquí la URL /exec del Apps Script desplegado
    STEP: 15,               // cada cuántos minutos empieza un hueco
    LEAD_MIN: 60,           // antelación mínima para reservar
    DAYS: 14,               // días que se pueden reservar
    // 0 = domingo … 6 = sábado. Horario de verano publicado en Instagram.
    HOURS: {
      1: [['10:00', '18:00']],
      2: [['10:00', '18:00']],
      3: [['10:00', '18:00']],
      4: [['10:00', '18:00']],
      5: [['10:00', '14:00'], ['16:00', '23:00']],
    },
    ADDRESS: 'Calle Ríos, 29, 21610 San Juan del Puerto, Huelva',
  };

  const SERVICES = [
    { id: 'corte', name: 'Corte', desc: 'Degradado, clásico o a tijera. Lavado y peinado incluidos.', min: 30, price: 12 },
    { id: 'corte-barba', name: 'Corte + barba', desc: 'El corte completo y la barba perfilada a navaja.', min: 45, price: 17 },
    { id: 'barba', name: 'Arreglo de barba', desc: 'Perfilado, rebajado y toalla caliente.', min: 20, price: 8 },
    { id: 'nino', name: 'Corte niño', desc: 'Hasta 12 años.', min: 30, price: 10 },
    { id: 'cejas', name: 'Diseño de cejas', desc: 'Limpieza y forma con cera o pinza.', min: 15, price: 5 },
    { id: 'mechas', name: 'Mechas o platino', desc: 'Decoloración, matiz y corte. Depende del largo.', min: 120, price: 45, from: true },
    { id: 'color', name: 'Color fantasía', desc: 'Rosa, cobre, gris… con corte incluido.', min: 120, price: 40, from: true },
    { id: 'rizos', name: 'Permanente', desc: 'Rizo definido y corte. Incluye producto para casa.', min: 90, price: 35, from: true },
  ];
  const svc = id => SERVICES.find(s => s.id === id);

  /* ---------- fechas ---------- */
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const hm = min => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  const at = (date, time) => new Date(`${date}T${time}:00`);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  function freeSlots(date, minutes, events, now = new Date()) {
    const ranges = CONFIG.HOURS[at(date, '12:00').getDay()] || [];
    const limit = now.getTime() + CONFIG.LEAD_MIN * 60000;
    const busy = events.map(e => [new Date(e.start).getTime(), new Date(e.end).getTime()]);
    const out = [];
    for (const [a, b] of ranges) {
      for (let t = toMin(a); t + minutes <= toMin(b); t += CONFIG.STEP) {
        const s = at(date, hm(t)).getTime(), e = s + minutes * 60000;
        if (s < limit) continue;
        if (busy.some(([bs, be]) => s < be && e > bs)) continue;
        out.push(hm(t));
      }
    }
    return out;
  }

  /* ---------- modo demostración: agenda simulada ---------- */
  const KEY = 'am-demo-agenda-v2';
  const NAMES = ['Álvaro', 'Rubén', 'Manu', 'Iván', 'Dani', 'Sergio', 'Pablo', 'Jesús', 'Adrián', 'Hugo', 'Marcos', 'Nico', 'Raúl', 'Javi', 'Óscar', 'Kike'];
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function seed() {
    const monday = addDays(new Date(), -((new Date().getDay() + 6) % 7));
    const r = rng(Number(ymd(monday).replace(/-/g, '')));
    const events = [];
    const weights = ['corte', 'corte', 'corte', 'corte-barba', 'corte-barba', 'barba', 'nino', 'cejas', 'mechas', 'color'];
    for (let i = 0; i < 7 + CONFIG.DAYS; i++) {
      const day = addDays(monday, i), date = ymd(day);
      const ranges = CONFIG.HOURS[day.getDay()];
      if (!ranges) continue;
      if (day.getDay() === 2 && i < 7) events.push({ id: 'b' + i, kind: 'block', title: 'Bloqueado · proveedor', start: `${date}T12:00`, end: `${date}T13:00` });
      const fill = i < 9 ? .62 : .32;               // más lleno cuanto más cerca
      for (const [a, b] of ranges) {
        let t = toMin(a);
        while (t < toMin(b)) {
          const s = svc(weights[Math.floor(r() * weights.length)]);
          if (t + s.min > toMin(b)) break;
          if (r() < fill) {
            const start = `${date}T${hm(t)}`;
            if (!events.some(e => e.start <= start && e.end > start))
              events.push({ id: 'd' + i + t, kind: 'cita', service: s.id, title: s.name, name: NAMES[Math.floor(r() * NAMES.length)] + ' ' + 'ABCDEGHLMNPRSTV'[Math.floor(r() * 15)] + '.', start, end: `${date}T${hm(t + s.min)}` });
            t += s.min;
          } else t += CONFIG.STEP * (r() < .5 ? 2 : 3);
        }
      }
    }
    return { week: ymd(monday), events };
  }

  function store() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    const monday = ymd(addDays(new Date(), -((new Date().getDay() + 6) % 7)));
    if (!s || s.week !== monday) { s = seed(); save(s); }
    return s;
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('am-agenda') : null;
  const listeners = [];
  function emit(msg) { listeners.forEach(f => f(msg)); channel && channel.postMessage(msg); }
  channel && channel.addEventListener('message', e => listeners.forEach(f => f(e.data)));
  window.addEventListener('storage', e => { if (e.key === KEY) listeners.forEach(f => f({ type: 'sync' })); });

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const demo = !CONFIG.API_URL;

  async function get(params) {
    const r = await fetch(CONFIG.API_URL + '?' + new URLSearchParams(params));
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'error');
    return j;
  }

  /* ---------- API pública ---------- */
  return {
    CONFIG, SERVICES, svc, ymd, addDays, demo,
    onChange(f) { listeners.push(f); },

    // Huecos libres por día para los próximos CONFIG.DAYS días: { 'YYYY-MM-DD': n }
    async days(serviceId) {
      if (!demo) return (await get({ action: 'days', service: serviceId })).days;
      await wait(250);
      const s = svc(serviceId), ev = store().events, out = {};
      for (let i = 0; i < CONFIG.DAYS; i++) {
        const d = ymd(addDays(new Date(), i));
        out[d] = CONFIG.HOURS[at(d, '12:00').getDay()] ? freeSlots(d, s.min, ev.filter(e => e.start.startsWith(d))).length : -1;
      }
      return out;
    },

    async slots(serviceId, date) {
      if (!demo) return (await get({ action: 'slots', service: serviceId, date })).slots;
      await wait(300);
      return freeSlots(date, svc(serviceId).min, store().events.filter(e => e.start.startsWith(date)));
    },

    async book(b) {
      if (!demo) {
        const r = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'book', ...b }) });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || 'error');
        return j;
      }
      await wait(900);
      const s = store(), sv = svc(b.service);
      const free = freeSlots(b.date, sv.min, s.events.filter(e => e.start.startsWith(b.date)));
      if (!free.includes(b.time)) throw new Error('taken');
      const ev = { id: 'n' + Date.now(), kind: 'cita', fresh: true, service: sv.id, title: sv.name, name: b.name, phone: b.phone, note: b.note || '', start: `${b.date}T${b.time}`, end: `${b.date}T${hm(toMin(b.time) + sv.min)}` };
      s.events.push(ev); save(s);
      emit({ type: 'new', ev });
      return { ok: true, id: ev.id };
    },

    // Solo demostración: lo que vería el barbero en su calendario
    events() { return store().events; },
    reset() { try { localStorage.removeItem(KEY); } catch (e) {} emit({ type: 'sync' }); },

    calendarLinks(b) {
      const sv = svc(b.service), s = at(b.date, b.time), e = new Date(s.getTime() + sv.min * 60000);
      const f = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
      const title = `${sv.name} · Aesthetic Men`;
      const google = 'https://calendar.google.com/calendar/render?' + new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${f(s)}/${f(e)}`, ctz: 'Europe/Madrid', location: CONFIG.ADDRESS });
      const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aesthetic Men//Reservas//ES', 'BEGIN:VEVENT', `UID:${Date.now()}@aestheticmen`, `DTSTART;TZID=Europe/Madrid:${f(s)}`, `DTEND;TZID=Europe/Madrid:${f(e)}`, `SUMMARY:${title}`, `LOCATION:${CONFIG.ADDRESS.replace(/,/g, '\\,')}`, 'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Cita en Aesthetic Men', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      return { google, ics: 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics) };
    },
  };
})();
