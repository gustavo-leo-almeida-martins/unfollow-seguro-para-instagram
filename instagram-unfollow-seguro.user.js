// ==UserScript==
// @name         Instagram - Deixar de seguir em massa (modo seguro)
// @namespace    local.safe.unfollow.ig
// @version      1.3
// @description  Deixa de seguir em massa com atrasos aleatórios longos, pausas entre lotes, limite diário e parada automática se o Instagram mostrar bloqueio.
// @match        https://www.instagram.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // =====================================================
  //  CONFIGURAÇÃO (o Instagram é bem mais rígido que o X)
  // =====================================================
  const CFG = {
    delayMin: 2000,                 // espera entre cada unfollow (ms)
    delayMax: 2000,
    batchSize: 49,                  // no máximo 49 unfollows por janela
    batchWindow: 10 * 60 * 1000,    // janela de 10 minutos: o próximo lote só começa depois dela
    dailyCap: 150,                  // máximo por dia (use 50-100 se a conta for nova)
    whitelist: [],                  // @s que nunca serão removidos. Ex: ['nasa', 'fulano']
    maxEmptyScrolls: 6,             // para se rolar N vezes e não achar mais ninguém
    maxConsecutiveFails: 3,         // para se falhar N vezes seguidas
    collectDelayMin: 500,           // espera entre rolagens enquanto aparecem seguidores novos (ms)
    collectDelayMax: 900,
    collectIdleMs: 20000,           // sem saber o total do perfil: fim da coleta após este tempo sem ninguém novo (ms)
    collectStallMs: 45000,          // sabendo o total: só desiste após este tempo sem ninguém novo (ms)
    minCompleteRatio: 0.97,         // só salva a lista se coletou pelo menos 97% do total do perfil
  };

  const FOLLOWING_TEXTS = ['following', 'seguindo'];
  const CONFIRM_TEXTS = ['unfollow', 'deixar de seguir'];
  const CANCEL_TEXTS = ['cancel', 'cancelar'];
  const CLICKABLE = 'button, div[role="button"]';

  // mensagens que o Instagram mostra quando limita/bloqueia a ação
  const ERR_RE = /try again later|tente novamente mais tarde|action blocked|ação bloqueada|a ação foi bloqueada|we limit how often|limitamos a frequência|restrict certain activity|restringimos determinadas|temporarily blocked|bloquead[ao] temporariamente|something went wrong|algo deu errado/i;

  // =====================================================
  //  UTILITÁRIOS
  // =====================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => Math.floor(a + Math.random() * (b - a));
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const hasText = (el, list) => list.includes(norm(el.textContent));
  const findButtons = (root, list) =>
    Array.from(root.querySelectorAll(CLICKABLE)).filter((el) => hasText(el, list));

  const todayKey = () => {
    const d = new Date();
    return `igunf_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  const getToday = () => Number(GM_getValue(todayKey(), 0)) || 0;
  const addToday = () => GM_setValue(todayKey(), getToday() + 1);

  let running = false;
  let sessionCount = 0;
  let skipped = 0;
  let listDialog = null;
  const done = new Set();

  // lista de seguidores salva (para pular quem te segue de volta)
  const FOLLOWERS_KEY = 'ig_followers_v1';
  const FOLLOWERS_TS_KEY = 'ig_followers_ts_v1';
  const loadFollowers = () => {
    try { return new Set(JSON.parse(GM_getValue(FOLLOWERS_KEY, '[]'))); } catch (e) { return new Set(); }
  };
  const saveFollowers = (set) => {
    GM_setValue(FOLLOWERS_KEY, JSON.stringify(Array.from(set)));
    GM_setValue(FOLLOWERS_TS_KEY, Date.now());
  };
  let followers = loadFollowers();
  let skipFollowBack = true;

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
      const s = Math.ceil((end - Date.now()) / 1000);
      setStatus(`${label}: retomando em ${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`);
      await sleep(500);
    }
  }

  // =====================================================
  //  PAINEL
  // =====================================================
  let elStatus, elCount, elBtn, elFollowers, elChk, elCollect, elImportBtn;

  function buildPanel() {
    if (document.getElementById('safe-unfollow-ig-panel')) return;
    const p = document.createElement('div');
    p.id = 'safe-unfollow-ig-panel';
    p.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:2147483647;width:270px;padding:12px;' +
      'background:#1a1a1a;color:#fff;border:1px solid #363636;border-radius:12px;' +
      'font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.6)';
    // evita que o clique no painel feche o modal do Instagram
    p.addEventListener('mousedown', (e) => e.stopPropagation());

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;margin-bottom:6px';
    title.textContent = 'Unfollow seguro (Instagram)';

    elStatus = document.createElement('div');
    elStatus.style.cssText = 'margin-bottom:6px;color:#a8a8a8';
    elStatus.textContent = 'Abra seu perfil, clique em "seguindo" e depois em Iniciar.';

    elCount = document.createElement('div');
    elCount.style.cssText = 'margin-bottom:4px';

    elFollowers = document.createElement('div');
    elFollowers.style.cssText = 'margin-bottom:8px;color:#a8a8a8;font-size:12px';

    const label = document.createElement('label');
    label.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:8px;cursor:pointer';
    elChk = document.createElement('input');
    elChk.type = 'checkbox';
    elChk.checked = skipFollowBack;
    elChk.addEventListener('change', () => { skipFollowBack = elChk.checked; });
    label.append(elChk, document.createTextNode(' Pular quem me segue de volta'));

    const mkBtn = (text, bg) => {
      const b = document.createElement('button');
      b.style.cssText =
        'width:100%;padding:8px;margin-bottom:6px;border:0;border-radius:8px;background:' + bg +
        ';color:#fff;font-weight:700;cursor:pointer';
      b.textContent = text;
      return b;
    };

    elCollect = mkBtn('1) Coletar meus seguidores', '#363636');
    elCollect.addEventListener('click', collectFollowers);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', importFiles);
    elImportBtn = mkBtn('ou importar followers_1.json', '#262626');
    elImportBtn.addEventListener('click', () => fileInput.click());

    elBtn = mkBtn('2) Iniciar', '#0095f6');
    elBtn.addEventListener('click', () => {
      if (running) {
        running = false;
        setStatus('Parado pelo usuário.');
      } else {
        run();
      }
    });

    p.append(title, elStatus, elCount, elFollowers, label, elCollect, elImportBtn, fileInput, elBtn);
    (document.body || document.documentElement).appendChild(p);
    render();
  }

  function setStatus(t) {
    if (elStatus) elStatus.textContent = t;
  }

  function render() {
    if (!elCount) return;
    elCount.textContent = `Sessão: ${sessionCount} | Hoje: ${getToday()}/${CFG.dailyCap} | Pulados: ${skipped}`;
    const ts = Number(GM_getValue(FOLLOWERS_TS_KEY, 0));
    elFollowers.textContent = followers.size
      ? `Seguidores salvos: ${followers.size} (${new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })})`
      : 'Seguidores salvos: nenhum';
    elCollect.disabled = running;
    elImportBtn.disabled = running;
    elCollect.style.opacity = running ? '.5' : '1';
    elImportBtn.style.opacity = running ? '.5' : '1';
    elBtn.textContent = running ? 'Parar' : '2) Iniciar';
    elBtn.style.background = running ? '#ed4956' : '#0095f6';
  }

  // =====================================================
  //  LÓGICA
  // =====================================================

  // acha a janela (modal) que contém a lista de "seguindo"
  function getListDialog() {
    let best = null;
    let bestN = 0;
    for (const d of document.querySelectorAll('[role="dialog"]')) {
      const n = findButtons(d, FOLLOWING_TEXTS).length;
      if (n > bestN) { best = d; bestN = n; }
    }
    return best;
  }

  // acha o elemento rolável dentro do modal
  // (escolhe a área rolável que tem mais perfis dentro, que é a lista de verdade)
  function findScroller(dialog) {
    let best = null;
    let bestN = -1;
    for (const d of dialog.querySelectorAll('div')) {
      const oy = getComputedStyle(d).overflowY;
      if ((oy !== 'auto' && oy !== 'scroll') || d.scrollHeight <= d.clientHeight + 20) continue;
      const n = d.querySelectorAll('a[href^="/"]').length;
      if (n >= bestN) { best = d; bestN = n; }
    }
    return best;
  }

  function getRow(btn) {
    let el = btn.parentElement;
    for (let i = 0; i < 8 && el; i++, el = el.parentElement) {
      if (el.querySelector('a[href^="/"]')) return el;
    }
    return null;
  }

  function getUser(row) {
    if (!row) return null;
    for (const a of row.querySelectorAll('a[href^="/"]')) {
      const seg = (a.getAttribute('href') || '').split('/')[1];
      if (seg && !['explore', 'reels', 'direct', 'p', 'stories'].includes(seg)) {
        return seg.toLowerCase();
      }
    }
    return null;
  }

  function findNext(dialog) {
    const wl = CFG.whitelist.map((s) => s.replace('@', '').toLowerCase());
    for (const btn of findButtons(dialog, FOLLOWING_TEXTS)) {
      const user = getUser(getRow(btn));
      if (!user || done.has(user)) continue;
      if (wl.includes(user)) { done.add(user); skipped++; continue; }
      if (skipFollowBack && followers.has(user)) { done.add(user); skipped++; continue; }
      return { btn, user };
    }
    return null;
  }

  function stillFollowing(dialog, user) {
    return findButtons(dialog, FOLLOWING_TEXTS).some((b) => getUser(getRow(b)) === user);
  }

  function hasBlockMessage() {
    for (const el of document.querySelectorAll('[role="dialog"], [role="alert"]')) {
      if (el === listDialog) continue;
      if (ERR_RE.test(el.textContent || '')) return true;
    }
    return false;
  }

  async function waitForConfirm(timeout) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const b = findButtons(document, CONFIRM_TEXTS)[0];
      if (b) return b;
      await sleep(150);
    }
    return null;
  }

  function dismissConfirm() {
    if (findButtons(document, CONFIRM_TEXTS)[0]) {
      const cancel = findButtons(document, CANCEL_TEXTS)[0];
      if (cancel) cancel.click();
    }
  }

  // ---------- seguidores: coletar pela tela ou importar do export oficial ----------
  const RESERVED = ['explore', 'reels', 'reel', 'direct', 'p', 'tv', 'stories', 'accounts', 'about', 'legal', 'web', 'challenge'];

  // diz se a lista aberta é "seguidores" ou "seguindo" (pela URL ou pelo título)
  function listKind(dialog) {
    const path = location.pathname;
    if (/\/followers\/?$/.test(path)) return 'followers';
    if (/\/following\/?$/.test(path)) return 'following';
    const h = dialog && dialog.querySelector('h1, h2, h3, [role="heading"]');
    const t = norm(h && h.textContent);
    if (t === 'followers' || t === 'seguidores') return 'followers';
    if (t === 'following' || t === 'seguindo') return 'following';
    return 'unknown';
  }

  function getCollectDialog() {
    let best = null;
    let bestN = 0;
    for (const d of document.querySelectorAll('[role="dialog"]')) {
      const n = d.querySelectorAll('a[href^="/"]').length;
      if (n > bestN) { best = d; bestN = n; }
    }
    return best;
  }

  // total de seguidores mostrado no perfil (para saber se a coleta pegou todo mundo)
  function getExpectedFollowers() {
    for (const a of document.querySelectorAll('a[href$="/followers/"]')) {
      const sp = a.querySelector('[title]');
      const title = sp ? sp.getAttribute('title') || '' : '';
      if (/^[\d.,\s]+$/.test(title)) {
        const n = parseInt(title.replace(/\D/g, ''), 10);
        if (n > 0) return n;
      }
      const m = norm(a.textContent).match(/^([\d.,]+)\s*(followers|seguidores)/);
      if (m) {
        const n = parseInt(m[1].replace(/\D/g, ''), 10);
        if (n > 0) return n;
      }
    }
    return null;
  }

  function collectUsernames(dialog, into) {
    for (const a of dialog.querySelectorAll('a[href^="/"]')) {
      const m = (a.getAttribute('href') || '').match(/^\/([A-Za-z0-9._]+)\/?$/);
      if (m && !RESERVED.includes(m[1].toLowerCase())) into.add(m[1].toLowerCase());
    }
  }

  async function collectFollowers() {
    if (running) return;
    const dialog = getCollectDialog();
    if (!dialog) {
      setStatus('Abra seu perfil e clique em "seguidores" primeiro.');
      return;
    }
    if (listKind(dialog) === 'following') {
      setStatus('Essa é a lista "seguindo". Abra a lista "seguidores".');
      return;
    }
    running = true;
    render();
    const found = new Set();
    const expected = getExpectedFollowers();
    let lastGrowth = Date.now();
    let completed = false;
    let scroller = findScroller(dialog);

    try {
      while (running) {
        if (!document.body.contains(dialog)) break;
        const before = found.size;
        collectUsernames(dialog, found);
        const grew = found.size > before;
        if (grew) lastGrowth = Date.now();
        setStatus(`Coletando seguidores... ${found.size}${expected ? ` de ~${expected}` : ''}`);

        // já pegou tudo o que o perfil diz ter
        if (expected && found.size >= expected) { completed = true; break; }

        // reaproveita a área rolável (procurar toda vez seria lento em listas grandes)
        if (!scroller || !dialog.contains(scroller)) scroller = findScroller(dialog);
        const atBottom = !scroller || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 10;
        const idle = Date.now() - lastGrowth;
        if (atBottom && idle >= (expected ? CFG.collectStallMs : CFG.collectIdleMs)) { completed = true; break; }

        if (scroller) {
          if (!grew && atBottom && idle > 4000) {
            // travou no fim da lista: "sacode" para forçar o Instagram a carregar mais
            scroller.scrollBy({ top: -scroller.clientHeight * 0.6, behavior: 'auto' });
            await wait(300);
            scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'auto' });
          } else {
            // rola menos de uma "página" por vez, sem animação, para não pular ninguém
            scroller.scrollBy({ top: Math.max(300, scroller.clientHeight * 0.8), behavior: 'auto' });
          }
        }
        // rápido enquanto vêm seguidores novos; mais calmo se o Instagram estiver demorando
        await wait(grew ? rand(CFG.collectDelayMin, CFG.collectDelayMax) : rand(1500, 2500));
      }

      const ratio = expected ? found.size / expected : 1;
      if (completed && ratio >= CFG.minCompleteRatio) {
        followers = found;
        saveFollowers(found);
        setStatus(`Pronto: ${found.size} seguidores salvos${expected ? ` (perfil: ${expected})` : ''}. Agora abra "seguindo" e clique em Iniciar.`);
      } else if (completed) {
        setStatus(`Coletou só ${found.size} de ~${expected} (${Math.round(ratio * 100)}%). Não salvei para não deixar de seguir quem te segue. Tente de novo ou importe o arquivo.`);
      } else {
        setStatus('Coleta interrompida. Nada foi salvo.');
      }
    } finally {
      running = false;
      render();
    }
  }

  function parseExport(text) {
    const data = JSON.parse(text);
    if (data && data.relationships_following) throw new Error('arquivo-seguindo');
    const arr = Array.isArray(data) ? data : (data.relationships_followers || []);
    const out = [];
    for (const item of arr) {
      if (item.title) out.push(String(item.title).toLowerCase());
      for (const s of item.string_list_data || []) {
        if (s.value) out.push(String(s.value).toLowerCase());
        else if (s.href) out.push(String(s.href).split('/').filter(Boolean).pop().toLowerCase());
      }
    }
    return out;
  }

  async function importFiles(ev) {
    const files = Array.from(ev.target.files || []);
    ev.target.value = '';
    if (!files.length) return;
    const found = new Set();
    try {
      for (const f of files) parseExport(await f.text()).forEach((n) => found.add(n));
    } catch (e) {
      setStatus(
        e.message === 'arquivo-seguindo'
          ? 'Esse é o arquivo de "seguindo". Use o followers_1.json.'
          : 'Arquivo inválido. Use o followers_1.json do export (formato JSON).'
      );
      return;
    }
    if (!found.size) { setStatus('Não achei nenhum usuário nesse arquivo.'); return; }
    followers = found;
    saveFollowers(found);
    setStatus(`Importados ${found.size} seguidores do arquivo.`);
    render();
  }

  // retorna: 'ok' | 'limit' | 'fail'
  async function doUnfollow(t) {
    t.btn.scrollIntoView({ block: 'center', behavior: 'auto' });
    await wait(rand(150, 350));
    if (!running) return 'fail';

    t.btn.click();
    const confirm = await waitForConfirm(3500);
    if (confirm) {
      await wait(rand(100, 250));
      confirm.click();
    }

    // confere o resultado assim que a tela atualizar (espera até 4 s)
    const end = Date.now() + 4000;
    while (Date.now() < end) {
      await wait(rand(200, 350));
      if (!running) return 'fail';
      if (hasBlockMessage()) return 'limit';
      if (!document.body.contains(listDialog)) return 'fail';
      if (!stillFollowing(listDialog, t.user)) return 'ok';
    }
    dismissConfirm();
    return 'fail';
  }

  async function run() {
    if (running) return;
    listDialog = getListDialog();
    if (!listDialog) {
      setStatus('Não achei a lista. Abra seu perfil, clique em "seguindo" e tente de novo.');
      return;
    }
    if (listKind(listDialog) === 'followers') {
      setStatus('Essa é a lista "seguidores". Abra a lista "seguindo" para deixar de seguir.');
      return;
    }
    if (skipFollowBack && followers.size === 0) {
      setStatus('Primeiro colete seus seguidores (ou importe o arquivo), ou desmarque "Pular quem me segue de volta".');
      return;
    }
    running = true;
    sessionCount = 0;
    let sinceBatch = 0, emptyScrolls = 0, fails = 0;
    let batchStart = Date.now();
    render();

    try {
      while (running) {
        if (!document.body.contains(listDialog)) {
          listDialog = getListDialog();
          if (!listDialog) { setStatus('A lista foi fechada. Parei.'); break; }
        }
        if (getToday() >= CFG.dailyCap) {
          setStatus(`Limite diário (${CFG.dailyCap}) atingido. Continue amanhã.`);
          break;
        }

        if (sinceBatch >= CFG.batchSize) {
          // lote cheio: espera a janela de 10 min (contada desde o 1º unfollow do lote)
          const remaining = batchStart + CFG.batchWindow - Date.now();
          await pause(Math.max(0, remaining) + rand(0, 15000), 'Próximo lote');
          sinceBatch = 0;
          if (!running) break;
        }

        const t = findNext(listDialog);
        if (!t) {
          setStatus('Carregando mais contas...');
          const scroller = findScroller(listDialog);
          if (scroller) {
            scroller.scrollBy({ top: Math.max(300, scroller.clientHeight * 0.9), behavior: 'smooth' });
          } else {
            const rows = findButtons(listDialog, FOLLOWING_TEXTS);
            const last = rows[rows.length - 1];
            if (last) last.scrollIntoView({ block: 'end' });
          }
          await wait(rand(2500, 4500));
          if (++emptyScrolls >= CFG.maxEmptyScrolls) {
            setStatus('Fim da lista (ou nada mais a processar).');
            break;
          }
          continue;
        }
        emptyScrolls = 0;

        if (sinceBatch === 0) batchStart = Date.now();
        setStatus(`Deixando de seguir @${t.user}...`);
        const res = await doUnfollow(t);

        if (res === 'ok') {
          done.add(t.user);
          fails = 0; sinceBatch++; sessionCount++;
          addToday();
        } else if (res === 'limit') {
          setStatus('O Instagram mostrou aviso de bloqueio/limite. Parei — espere pelo menos 24h.');
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

  // o Instagram é uma SPA: garante que o painel exista mesmo após navegação
  const safeBuild = () => {
    try { buildPanel(); } catch (e) { console.error('[Unfollow IG] erro ao montar painel:', e); }
  };
  console.log('[Unfollow IG] script carregado');
  safeBuild();
  setInterval(safeBuild, 2000);
})();
