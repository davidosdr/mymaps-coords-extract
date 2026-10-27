// ==UserScript==
// @name         My Maps: extraer coords FAST v6
// @version      6.0
// @match        https://www.google.com/maps/d/*
// @match        https://mymaps.google.com/*
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(async () => {
  'use strict';
  const PAGE_WIN = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const log = (...a) => console.log('[MM6]', ...a);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Polling adaptativo: devuelve en cuanto se cumple la condición
  const waitFor = async (cond, timeout = 1200, interval = 20) => {
    const t0 = performance.now();
    while (performance.now() - t0 < timeout) {
      if (cond()) return performance.now() - t0;
      await sleep(interval);
    }
    return -1;
  };

  const SEL = {
    ITEM:  '[fl_id]',
    NAME:  '[class*="r4nke"]',
    POPUP: '.gm-style-iw',
    CLOSE: '.gm-ui-hover-effect, [aria-label*="Cerrar"], [aria-label*="Close"]',
  };

  const getPopup = () => document.querySelector(SEL.POPUP);
  const closePopup = () => document.querySelector(SEL.CLOSE)?.click();

  // Dispara la secuencia completa de eventos, sin `view` (compatible Firefox)
  const fireClick = (el) => {
    const r = el.getBoundingClientRect();
    const base = { bubbles: true, cancelable: true,
                   clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    const mk = (name, type, extra) => {
      try { return new window[name](type, { ...base, ...extra }); }
      catch (e) { return new (PAGE_WIN[name] || window[name])(type, { ...base, ...extra }); }
    };
    const down = { buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    const up   = { buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(mk('PointerEvent', 'pointerdown', down));
    el.dispatchEvent(mk('MouseEvent',   'mousedown',   down));
    el.dispatchEvent(mk('PointerEvent', 'pointerup',   up));
    el.dispatchEvent(mk('MouseEvent',   'mouseup',     up));
    el.dispatchEvent(mk('MouseEvent',   'click',       up));
  };

  const extractCoords = (text) => {
    const reDec = /(-?\d{1,3}[.,]\d{4,})[^\d-]{1,8}(-?\d{1,3}[.,]\d{4,})/g;
    let m;
    while ((m = reDec.exec(text)) !== null) {
      const a = parseFloat(m[1].replace(',', '.'));
      const b = parseFloat(m[2].replace(',', '.'));
      if (Math.abs(a) > 35 && Math.abs(a) < 45 && Math.abs(b) < 15) return { lat: a, lng: b };
      if (Math.abs(b) > 35 && Math.abs(b) < 45 && Math.abs(a) < 15) return { lat: b, lng: a };
    }
    const reDMS = /(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:[.,]\d+)?)["″]?\s*([NS])[^\d]{0,10}(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:[.,]\d+)?)["″]?\s*([EW])/;
    const dm = text.match(reDMS);
    if (dm) {
      const lat = (parseInt(dm[1]) + parseInt(dm[2]) / 60 + parseFloat(dm[3].replace(',', '.')) / 3600) * (dm[4] === 'S' ? -1 : 1);
      const lng = (parseInt(dm[5]) + parseInt(dm[6]) / 60 + parseFloat(dm[7].replace(',', '.')) / 3600) * (dm[8] === 'W' ? -1 : 1);
      return { lat, lng };
    }
    return null;
  };

  const extractAddress = (text) => {
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    return lines.find(l => /(?:^|\s)(?:Calle|Avenida|Paseo|Plaza|C\/|Camino|Ronda|Glorieta|Travesía|Pasaje)\s/i.test(l)) || '';
  };

  const processItem = async (el, container, fallbackName) => {
    const t0 = performance.now();

    // Solo hace scrollIntoView si el item no está ya dentro de la vista del contenedor
    const r = el.getBoundingClientRect();
    const cR = container.getBoundingClientRect();
    if (r.top < cR.top || r.bottom > cR.bottom) {
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      await sleep(30);
    }

    // Cierra cualquier popup previo y espera lo justo a que desaparezca
    closePopup();
    await waitFor(() => !getPopup(), 400, 15);

    // Clic y espera adaptativa al popup con coords
    fireClick(el);
    let coords = null;
    let popupText = '';
    await waitFor(() => {
      const iw = getPopup();
      if (!iw) return false;
      popupText = iw.innerText || '';
      if (!popupText.trim()) return false;
      coords = extractCoords(popupText);
      return coords !== null;
    }, 1500, 20);

    // Fallback: .click() nativo si el popup no apareció
    if (!coords) {
      el.click();
      await waitFor(() => {
        const iw = getPopup();
        if (!iw) return false;
        popupText = iw.innerText || '';
        coords = extractCoords(popupText);
        return coords !== null;
      }, 800, 20);
    }

    return {
      name: fallbackName,
      address: extractAddress(popupText),
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      ms: Math.round(performance.now() - t0),
    };
  };

  let stopFlag = false;

  async function run() {
    stopFlag = false;
    closePopup();
    await sleep(200);

    const items0 = [...document.querySelectorAll(SEL.ITEM)].filter(e => e.getAttribute('fl_id') !== '0');
    if (!items0.length) { alert('Sin items. Abre el panel lateral.'); return; }
    log(`Items en DOM: ${items0.length}`);

    const container = (() => {
      let el = items0[0].parentElement;
      while (el && el.scrollHeight <= el.clientHeight + 10) el = el.parentElement;
      return el;
    })();
    if (!container) { alert('No encuentro contenedor de scroll.'); return; }

    container.scrollTop = 0;
    await sleep(400);

    const results = [];
    const seen = new Set();
    let stagnant = 0, lastCount = 0;
    const START = performance.now();

    while (!stopFlag && stagnant < 3) {
      const items = [...document.querySelectorAll(SEL.ITEM)]
        .filter(e => e.offsetParent !== null && e.getAttribute('fl_id') !== '0');
      const fresh = items.filter(e => !seen.has(e.getAttribute('fl_id')));

      if (fresh.length === 0) {
        const before = container.scrollTop;
        container.scrollTop = Math.min(container.scrollTop + container.clientHeight * 0.85, container.scrollHeight);
        await sleep(500);
        const now = document.querySelectorAll(SEL.ITEM).length;
        if (now === lastCount && container.scrollTop === before) stagnant++;
        else { lastCount = now; stagnant = 0; }
        continue;
      }

      for (const el of fresh) {
        if (stopFlag) break;
        const id = el.getAttribute('fl_id');
        if (!id || seen.has(id)) continue;
        seen.add(id);

        const fallbackName = (el.querySelector(SEL.NAME)?.innerText || el.innerText || '').trim().split('\n')[0];

        let r;
        try {
          r = await processItem(el, container, fallbackName);
        } catch (e) {
          log('Error:', e.message);
          r = { name: fallbackName, address: '', lat: null, lng: null, ms: 0 };
        }
        results.push(r);

        if (results.length % 10 === 0) {
          const sec = (performance.now() - START) / 1000;
          const rate = results.length / sec;
          const missing = results.filter(x => x.lat === null).length;
          log(`[${results.length}] ${rate.toFixed(2)}/s | missing=${missing} | ${r.lat ?? '?'},${r.lng ?? '?'} (${r.ms}ms)`);
        }
      }

      container.scrollTop = Math.min(container.scrollTop + container.clientHeight * 0.85, container.scrollHeight);
      await sleep(400);
      const now = document.querySelectorAll(SEL.ITEM).length;
      if (now === lastCount) stagnant++; else { lastCount = now; stagnant = 0; }
    }

    const totalSec = ((performance.now() - START) / 1000).toFixed(1);
    const missing = results.filter(r => r.lat === null).length;
    log(`FIN: ${results.length} items en ${totalSec}s | ${missing} sin coords`);

    const esc = s => `"${String(s || '').replace(/"/g, '""')}"`;
    const csv = 'nombre,lat,lng,direccion\n' + results.map(r =>
      [esc(r.name), r.lat ?? '', r.lng ?? '', esc(r.address)].join(',')
    ).join('\n');

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `bares_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    try { GM_setClipboard(csv); } catch (e) {}

    alert(`Hecho en ${totalSec}s: ${results.length} procesados, ${missing} sin coords.`);
  }

  function addButton() {
    if (document.getElementById('mm6-btn')) return;
    const b = document.createElement('button');
    b.id = 'mm6-btn';
    b.textContent = '▶ Extraer v6';
    b.style.cssText = 'position:fixed;top:80px;right:20px;z-index:2147483647;padding:10px 14px;background:#1a73e8;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3);';

    let running = false;
    b.onclick = async () => {
      if (running) { stopFlag = true; b.textContent = 'Parando…'; return; }
      running = true;
      b.textContent = 'STOP';
      b.style.background = '#d93025';
      try { await run(); }
      finally {
        running = false;
        b.textContent = '▶ Extraer v6';
        b.style.background = '#1a73e8';
      }
    };
    document.body.appendChild(b);
  }

  setTimeout(addButton, 2000);
  setTimeout(addButton, 6000);
})();
