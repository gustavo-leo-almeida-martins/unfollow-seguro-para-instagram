// ==UserScript==
// @name         X/Twitter - Deixar de seguir em massa (modo seguro)
// @namespace    local.safe.unfollow
// @version      1.2
// @description  Deixa de seguir em massa com atrasos aleatórios, pausas entre lotes, limite diário e parada automática se o X mostrar erro/limite.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // =====================================================
  //  CONFIGURAÇÃO (valores conservadores de propósito)
  // =====================================================
  const CFG = {
    delayMin: 4000,                 // atraso mínimo entre cada unfollow (ms)
    delayMax: 9000,                 // atraso máximo entre cada unfollow (ms)
    batchSize: 25,                  // quantos unfollows antes de uma pausa longa
    batchPauseMin: 55 * 1000,       // pausa longa mínima (ms) ~1 minuto
    batchPauseMax: 65 * 1000,       // pausa longa máxima (ms) ~1 minuto
    dailyCap: 250,                  // máximo de unfollows por dia (contado entre sessões)
    skipFollowBack: true,           // não deixar de seguir quem te segue de volta
    whitelist: [],                  // @s que nunca serão removidos. Ex: ['nasa', 'fulano']
    maxEmptyScrolls: 6,             // para se rolar N vezes e não achar mais ninguém
    maxConsecutiveFails: 3,         // para se falhar N vezes seguidas
  };

  const SEL = {
    cell: '[data-testid="UserCell"]',
    unfollowBtn: '[data-testid$="-unfollow"]',
    confirm: '[data-testid="confirmationSheetConfirm"]',
    followsYou: '[data-testid="userFollowIndicator"]',
    toast: '[data-testid="toast"], [role="alert"]',
  };

  const ERR_RE = /limit|limite|try again|tente novamente|something went wrong|algo deu errado|temporar|locked|bloquead|suspens/i;

  // =====================================================
  //  UTILITÁRIOS
  // =====================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => Math.floor(a + Math.random() * (b - a));
  const isFollowingPage = () => /^\/[^/]+\/following\/?$/.test(location.pathname);

  const todayKey = () => {
    const d = new Date();
    return `unf_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  const getToday = () => Number(GM_getValue(todayKey(), 0)) || 0;
  const addToday = () => GM_setValue(todayKey(), getToday() + 1);

  let running = false;
  let sessionCount = 0;
  let skipped = 0;
  const done = new Set();
  const opts = { skipFollowBack: CFG.skipFollowBack };

  // espera que pode ser interrompida pelo botão "Parar"
  async function wait(ms) {
    const end = Date.now() + ms;
    while (running && Date.now() < end) {
      await sleep(Math.min(300, Math.max(0, end - Date.now())));
    }
  }

  async function pause(ms, label) {
    const end = Date.now() + ms;
    while (running && Date.now() < end) {
      setStatus(`${label}: retomando em ${Math.ceil((end - Date.now()) / 1000)}s`);
      await sleep(500);
    }
  }

  async function waitFor(selector, timeout = 4000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(150);
    }
    return null;
  }

  // =====================================================
  //  PAINEL
  // =====================================================
  let elStatus, elCount, elBtn, elChk;

  function buildPanel() {
    if (document.getElementById('safe-unfollow-panel')) return;
    const p = document.createElement('div');
    p.id = 'safe-unfollow-panel';
    p.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:999999;width:260px;padding:12px;' +
      'background:#15202b;color:#fff;border:1px solid #38444d;border-radius:12px;' +
      'font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.5)';
    // montado com createElement (sem innerHTML) para funcionar mesmo com Trusted Types/CSP
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;margin-bottom:6px';
    title.textContent = 'Unfollow seguro';

    elStatus = document.createElement('div');
    elStatus.style.cssText = 'margin-bottom:6px;color:#9fb3c8';
    elStatus.textContent = 'Pronto.';

    elCount = document.createElement('div');
    elCount.style.cssText = 'margin-bottom:8px';

    const label = document.createElement('label');
    label.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:8px;cursor:pointer';
    elChk = document.createElement('input');
    elChk.type = 'checkbox';
    label.appendChild(elChk);
    label.appendChild(document.createTextNode(' Pular quem me segue de volta'));

    elBtn = document.createElement('button');
    elBtn.style.cssText =
      'width:100%;padding:8px;border:0;border-radius:999px;background:#1d9bf0;' +
      'color:#fff;font-weight:700;cursor:pointer';
    elBtn.textContent = 'Iniciar';

    p.append(title, elStatus, elCount, label, elBtn);
    (document.body || document.documentElement).appendChild(p);
    elChk.checked = opts.skipFollowBack;
    elChk.addEventListener('change', () => (opts.skipFollowBack = elChk.checked));
    elBtn.addEventListener('click', () => {
      if (running) {
        running = false;
        setStatus('Parado pelo usuário.');
      } else {
        run();
      }
    });
    render();
  }

  function setStatus(t) {
    if (elStatus) elStatus.textContent = t;
  }

  function render() {
    if (!elCount) return;
    elCount.textContent = `Sessão: ${sessionCount} | Hoje: ${getToday()}/${CFG.dailyCap} | Pulados: ${skipped}`;
    elBtn.textContent = running ? 'Parar' : 'Iniciar';
    elBtn.style.background = running ? '#f4212e' : '#1d9bf0';
  }

  // =====================================================
  //  LÓGICA
  // =====================================================
  function getUser(cell) {
    const a = cell.querySelector('a[role="link"][href^="/"]');
    if (!a) return null;
    return (a.getAttribute('href').split('/')[1] || '').toLowerCase() || null;
  }

  function findNext() {
    const wl = CFG.whitelist.map((s) => s.replace('@', '').toLowerCase());
    for (const cell of document.querySelectorAll(SEL.cell)) {
      const user = getUser(cell);
      if (!user || done.has(user)) continue;
      const btn = cell.querySelector(SEL.unfollowBtn);
      if (!btn) { done.add(user); continue; }
      if (wl.includes(user)) { done.add(user); skipped++; continue; }
      if (opts.skipFollowBack && cell.querySelector(SEL.followsYou)) {
        done.add(user); skipped++; continue;
      }
      return { cell, btn, user };
    }
    return null;
  }

  // retorna: 'ok' | 'limit' | 'fail'
  async function doUnfollow(t) {
    t.btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await wait(rand(600, 1400));
    if (!running) return 'fail';

    t.btn.click();
    const confirm = await waitFor(SEL.confirm, 4000);
    if (!confirm) return 'fail';

    await wait(rand(400, 900));
    confirm.click();
    await wait(rand(1200, 2000));

    for (const el of document.querySelectorAll(SEL.toast)) {
      if (ERR_RE.test(el.textContent || '')) return 'limit';
    }

    const stillFollowing =
      document.body.contains(t.btn) &&
      (t.btn.getAttribute('data-testid') || '').endsWith('-unfollow');
    return stillFollowing ? 'fail' : 'ok';
  }

  async function run() {
    if (running) return;
    if (!isFollowingPage()) {
      setStatus('Abra x.com/SEU_USUARIO/following e clique em Iniciar.');
      return;
    }
    running = true;
    sessionCount = 0;
    let sinceBatch = 0, emptyScrolls = 0, fails = 0;
    render();

    try {
      while (running) {
        if (!isFollowingPage()) { setStatus('Você saiu da página "Seguindo". Parei.'); break; }
        if (getToday() >= CFG.dailyCap) {
          setStatus(`Limite diário (${CFG.dailyCap}) atingido. Continue amanhã.`);
          break;
        }

        if (sinceBatch >= CFG.batchSize) {
          await pause(rand(CFG.batchPauseMin, CFG.batchPauseMax), 'Pausa entre lotes');
          sinceBatch = 0;
          if (!running) break;
        }

        const t = findNext();
        if (!t) {
          setStatus('Carregando mais contas...');
          const cells = document.querySelectorAll(SEL.cell);
          const last = cells[cells.length - 1];
          if (last) last.scrollIntoView({ block: 'end' });
          else window.scrollBy(0, window.innerHeight);
          await wait(rand(1800, 3200));
          if (++emptyScrolls >= CFG.maxEmptyScrolls) {
            setStatus('Fim da lista (ou nada mais a processar).');
            break;
          }
          continue;
        }
        emptyScrolls = 0;

        setStatus(`Deixando de seguir @${t.user}...`);
        const res = await doUnfollow(t);

        if (res === 'ok') {
          done.add(t.user);
          fails = 0; sinceBatch++; sessionCount++;
          addToday();
        } else if (res === 'limit') {
          setStatus('O X mostrou um aviso de limite/erro. Parei por segurança — espere algumas horas.');
          break;
        } else {
          done.add(t.user);
          if (++fails >= CFG.maxConsecutiveFails) {
            setStatus('Várias falhas seguidas. Parei por segurança.');
            break;
          }
        }

        render();
        await wait(rand(CFG.delayMin, CFG.delayMax));
      }
    } finally {
      running = false;
      render();
    }
  }

  // o X é uma SPA: garante que o painel exista mesmo após navegação
  const safeBuild = () => {
    try { buildPanel(); } catch (e) { console.error('[Unfollow seguro] erro ao montar painel:', e); }
  };
  console.log('[Unfollow seguro] script carregado');
  safeBuild();
  setInterval(safeBuild, 2000);
})();
