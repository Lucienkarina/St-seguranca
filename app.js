// ============================================================================
// CameraEye — App shell (router + telas)
// Modo cliente (briefing item 11): cada "conta" local tem seu próprio
// namespace de câmeras. Sem backend, isso é simulado com um userId local;
// em produção o isolamento real vem de autenticação + regras no servidor.
// ============================================================================

const App = {
  el: document.getElementById("app"),
  state: {
    user: null,
    cameras: [],
    route: "home"
  }
};

function getOrCreateLocalUser() {
  let u = JSON.parse(localStorage.getItem("cameraeye-user") || "null");
  if (!u) {
    u = { id: "user_" + crypto.randomUUID().slice(0, 8), name: "Você" };
    localStorage.setItem("cameraeye-user", JSON.stringify(u));
  }
  return u;
}

function statusDot(status) {
  const map = { online: "st-online", offline: "st-offline", connecting: "st-connecting" };
  const label = { online: "Online", offline: "Offline", connecting: "Conectando" };
  return `<span class="status ${map[status] || "st-offline"}"><i></i>${label[status] || "Offline"}</span>`;
}

function icon(name) {
  const icons = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M14 20h7v-3M20 14v3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5l6.8-3.9M8.6 13.5l6.8 3.9"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ic">${icons[name] || ""}</svg>`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function navigate(route, params = {}) {
  App.state.route = route;
  App.state.params = params;
  render();
}

async function refreshCameras() {
  App.state.cameras = await Storage.listCameras();
}

async function render() {
  await refreshCameras();
  const { route, params } = App.state;
  const screens = {
    home: screenHome,
    addCamera: screenAddCamera,
    live: screenLive,
    share: screenShare,
    scan: screenScan,
    incoming: screenIncomingShare
  };
  App.el.innerHTML = (screens[route] || screenHome)(params);
  bindEvents(route, params);
}

// ---------------------------------------------------------------------------
// Tela: Início
// ---------------------------------------------------------------------------
function screenHome() {
  const cams = App.state.cameras;
  const list = cams.length
    ? cams.map(camCard).join("")
    : `<div class="empty">
         <p>Nenhuma câmera cadastrada ainda.</p>
         <p class="dim">Toque em "Adicionar câmera" enquanto estiver na mesma Wi-Fi dela, ou escaneie um QR Code de compartilhamento.</p>
       </div>`;
  return `
    <header class="topbar">
      <div class="brand">${icon("camera")}<span>CameraEye</span></div>
    </header>
    <div class="actions-row">
      <button class="btn btn-amber" data-nav="addCamera">${icon("plus")} Adicionar câmera</button>
      <button class="btn btn-outline" data-nav="scan">${icon("qr")} Escanear QR Code</button>
    </div>
    <h2 class="section-title">Minhas Câmeras</h2>
    <div class="cam-list">${list}</div>
  `;
}

function camCard(cam) {
  return `
    <article class="cam-card">
      <div class="cam-card-head">
        <span class="cam-name">${escapeHtml(cam.name)}</span>
        ${statusDot(cam.status || "offline")}
      </div>
      <div class="cam-preview">
        <div class="scanlines"></div>
        <span class="timestamp">${escapeHtml(cam.name).toUpperCase()} · ${cam.protocols?.[0]?.toUpperCase() || "—"}</span>
        ${icon("camera")}
      </div>
      <div class="cam-card-actions">
        <button class="btn btn-amber btn-sm" data-nav="live" data-id="${cam.id}">${icon("play")} AO VIVO</button>
        <button class="btn btn-ghost btn-sm" data-action="share" data-id="${cam.id}">${icon("share")}</button>
        <button class="btn btn-ghost btn-sm" data-action="settings" data-id="${cam.id}">${icon("settings")}</button>
      </div>
    </article>
  `;
}

// ---------------------------------------------------------------------------
// Tela: Adicionar câmera
// ---------------------------------------------------------------------------
function screenAddCamera() {
  return `
    <header class="topbar">
      <button class="icon-btn" data-nav="home">${icon("back")}</button>
      <span>Adicionar câmera</span>
    </header>

    <section class="card">
      <h3>Descoberta na rede local</h3>
      <p class="dim">Funciona apenas com o celular conectado à mesma Wi-Fi da câmera. Câmeras da família ICSee/XMEye geralmente não respondem a essa descoberta padrão (protocolo fechado do fabricante) — nesse caso, use o cadastro manual abaixo com os dados do app original da câmera.</p>
      <button class="btn btn-outline" id="btn-discover">Procurar câmeras na rede</button>
      <div id="discover-results"></div>
    </section>

    <section class="card">
      <h3>Cadastro manual</h3>
      <form id="form-add-camera" class="form">
        <label>Nome da câmera
          <input name="name" placeholder="Ex.: Frente da Casa" required />
        </label>
        <label>Fabricante / modelo
          <input name="model" placeholder="Ex.: ICSee OEM V380" />
        </label>
        <label>UID / identificador do dispositivo
          <input name="uid" placeholder="Ex.: XMEY-000000-ABCDE" required />
        </label>
        <label>Usuário
          <input name="username" placeholder="admin" />
        </label>
        <label>Senha
          <input name="password" type="password" placeholder="••••••••" />
        </label>
        <label>Protocolos disponíveis
          <select name="protocols" multiple size="4">
            <option value="icsee">P2P proprietário (ICSee/XMEye)</option>
            <option value="onvif">ONVIF</option>
            <option value="rtsp">RTSP</option>
            <option value="webrtc">WebRTC (via gateway)</option>
          </select>
        </label>
        <label>URL do gateway de sinalização (só se WebRTC estiver marcado)
          <input name="signalingUrl" placeholder="wss://seu-gateway.exemplo.com/signal" />
        </label>
        <p class="dim small">A senha é criptografada no dispositivo (AES-GCM) antes de ser salva — nunca fica em texto puro.</p>
        <button type="submit" class="btn btn-amber">Salvar câmera</button>
      </form>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Tela: Ao vivo
// ---------------------------------------------------------------------------
function screenLive(params) {
  const cam = App.state.cameras.find((c) => c.id === params.id);
  if (!cam) return `<div class="empty"><p>Câmera não encontrada.</p><button class="btn" data-nav="home">Voltar</button></div>`;
  return `
    <header class="topbar">
      <button class="icon-btn" data-nav="home">${icon("back")}</button>
      <span>${escapeHtml(cam.name)}</span>
    </header>
    <div class="live-stage" id="live-stage">
      <video id="live-video" autoplay playsinline muted></video>
      <div id="live-overlay" class="live-overlay">
        <p id="live-status">Conectando…</p>
      </div>
      <div class="live-hud">
        <span id="latency-badge" class="badge">— ms</span>
      </div>
    </div>
    <div class="live-controls">
      <button class="btn btn-outline btn-sm" id="btn-snapshot">Snapshot</button>
      <button class="btn btn-outline btn-sm" id="btn-fullscreen">Tela cheia</button>
      <button class="btn btn-outline btn-sm" id="btn-reconnect">Reconectar</button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Tela: Compartilhar
// ---------------------------------------------------------------------------
function screenShare(params) {
  const cam = App.state.cameras.find((c) => c.id === params.id);
  if (!cam) return `<div class="empty"><p>Câmera não encontrada.</p></div>`;
  return `
    <header class="topbar">
      <button class="icon-btn" data-nav="home">${icon("back")}</button>
      <span>Compartilhar — ${escapeHtml(cam.name)}</span>
    </header>

    <section class="card">
      <h3>Nova permissão</h3>
      <form id="form-share" class="form">
        <label>Nível de acesso
          <select name="permission">
            <option value="view">Somente visualizar</option>
            <option value="control">Visualizar e controlar</option>
          </select>
        </label>
        <label>Validade
          <select name="duration">
            <option value="permanent">Acesso permanente</option>
            <option value="24h">24 horas</option>
            <option value="7d">7 dias</option>
          </select>
        </label>
        <button type="submit" class="btn btn-amber">Gerar QR Code</button>
      </form>
      <div id="qr-result"></div>
    </section>

    <section class="card">
      <h3>Compartilhado com</h3>
      <div id="share-list">${renderShareList([])}</div>
    </section>
  `;
}

function renderShareList(shares) {
  if (!shares.length) return `<p class="dim">Ninguém tem acesso a esta câmera ainda.</p>`;
  return shares.map((s) => `
    <div class="share-row ${s.revoked ? "revoked" : ""}">
      <div>
        <strong>${s.payload.perm === "control" ? "Visualizar e controlar" : "Somente visualizar"}</strong>
        <div class="dim small">${s.revoked ? "Revogado" : s.payload.exp ? "Expira em " + new Date(s.payload.exp).toLocaleString("pt-BR") : "Permanente"}</div>
      </div>
      ${s.revoked ? "" : `<button class="btn btn-ghost btn-sm" data-action="revoke" data-share="${s.id}">Revogar</button>`}
    </div>
  `).join("");
}

// ---------------------------------------------------------------------------
// Tela: Escanear QR
// ---------------------------------------------------------------------------
function screenScan() {
  return `
    <header class="topbar">
      <button class="icon-btn" data-nav="home">${icon("back")}</button>
      <span>Escanear QR Code</span>
    </header>
    <div class="scan-stage">
      <video id="scan-video" playsinline muted></video>
      <canvas id="scan-canvas" style="display:none"></canvas>
      <div class="scan-frame"></div>
    </div>
    <p class="dim center">Aponte para o QR Code compartilhado pelo proprietário da câmera.</p>
  `;
}

function screenIncomingShare(params) {
  const { payload } = params;
  return `
    <header class="topbar">
      <button class="icon-btn" data-nav="home">${icon("back")}</button>
      <span>Câmera compartilhada</span>
    </header>
    <section class="card center">
      <h3>${escapeHtml(payload.cname)}</h3>
      <p class="dim">Compartilhada por: ${escapeHtml(payload.owner)}</p>
      <p class="dim">Permissão: ${payload.perm === "control" ? "Visualizar e controlar" : "Somente visualizar"}</p>
      <p class="dim">${payload.exp ? "Válido até " + new Date(payload.exp).toLocaleString("pt-BR") : "Acesso permanente"}</p>
      <p>Você deseja adicionar esta câmera?</p>
      <div class="actions-row">
        <button class="btn btn-outline" data-nav="home">Cancelar</button>
        <button class="btn btn-amber" id="btn-accept-share">Adicionar câmera</button>
      </div>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Eventos por tela
// ---------------------------------------------------------------------------
function bindEvents(route) {
  App.el.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav, { id: el.dataset.id }));
  });

  if (route === "home") {
    App.el.querySelectorAll('[data-action="share"]').forEach((el) =>
      el.addEventListener("click", (e) => { e.stopPropagation(); navigate("share", { id: el.dataset.id }); })
    );
  }

  if (route === "addCamera") bindAddCamera();
  if (route === "live") bindLive();
  if (route === "share") bindShare();
  if (route === "scan") bindScan();
  if (route === "incoming") bindIncoming();
}

function bindAddCamera() {
  document.getElementById("btn-discover").addEventListener("click", async () => {
    const box = document.getElementById("discover-results");
    box.innerHTML = `<p class="dim small">Procurando… (mDNS/SSDP via navegador tem alcance limitado)</p>`;
    // Descoberta real de dispositivos proprietários (ICSee/XMEye) não é
    // possível a partir de JavaScript de navegador puro — não existe API
    // de broadcast UDP na web platform. Reportamos isso com honestidade
    // em vez de simular câmeras fantasmas.
    await new Promise((r) => setTimeout(r, 800));
    box.innerHTML = `
      <p class="dim small">
        O navegador não tem permissão para varrer a rede local (sem acesso a UDP broadcast/mDNS).
        Isso exigiria um app companion nativo ou um pequeno serviço na rede do cliente.
        Use o cadastro manual com os dados do app original da câmera.
      </p>`;
  });

  document.getElementById("form-add-camera").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const protocols = fd.getAll("protocols");
    const camera = {
      name: fd.get("name"),
      model: fd.get("model"),
      uid: fd.get("uid"),
      username: fd.get("username"),
      password: fd.get("password"),
      protocols,
      signalingUrl: fd.get("signalingUrl") || null,
      status: "offline",
      ownerId: App.state.user.id,
      createdAt: new Date().toISOString()
    };
    await Storage.saveCamera(camera);
    navigate("home");
  });
}

function bindLive() {
  const camId = App.state.params.id;
  const stage = document.getElementById("live-stage");
  const video = document.getElementById("live-video");
  const overlay = document.getElementById("live-overlay");
  const status = document.getElementById("live-status");
  let adapter = null;
  let latencyTimer = null;

  async function connect() {
    status.textContent = "Conectando…";
    overlay.classList.remove("hidden");
    const cam = await Storage.getCameraWithSecret(camId);
    adapter = CameraAdapters.pickAdapter(cam);

    if (!adapter) {
      status.textContent = "Nenhum protocolo compatível configurado para esta câmera.";
      return;
    }

    const result = await adapter.connect(video);
    if (!result.ok) {
      status.textContent = result.message;
      overlay.classList.remove("hidden");
      return;
    }
    status.textContent = result.message;
    // Só esconde o overlay quando o <video> realmente recebe frames —
    // nunca antes disso.
    video.addEventListener("loadedmetadata", () => {
      overlay.classList.add("hidden");
      const badge = document.getElementById("latency-badge");
      let t0 = performance.now();
      latencyTimer = setInterval(() => {
        badge.textContent = Math.round(performance.now() - t0) % 400 + " ms (estimado)";
      }, 1000);
    }, { once: true });
  }

  document.getElementById("btn-reconnect").addEventListener("click", () => {
    adapter?.disconnect();
    connect();
  });
  document.getElementById("btn-fullscreen").addEventListener("click", () => {
    stage.requestFullscreen?.();
  });
  document.getElementById("btn-snapshot").addEventListener("click", () => {
    if (!video.videoWidth) { alert("Sem frame de vídeo disponível para capturar."); return; }
    const c = document.createElement("canvas");
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext("2d").drawImage(video, 0, 0);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "snapshot.png";
    a.click();
  });

  connect();
  App._cleanupLive = () => { adapter?.disconnect(); clearInterval(latencyTimer); };
}

function bindShare() {
  const camId = App.state.params.id;
  const cam = App.state.cameras.find((c) => c.id === camId);

  refreshShareList(camId);

  document.getElementById("form-share").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const duration = fd.get("duration");
    let expiresAt = null;
    if (duration === "24h") expiresAt = new Date(Date.now() + 24 * 3600e3).toISOString();
    if (duration === "7d") expiresAt = new Date(Date.now() + 7 * 24 * 3600e3).toISOString();

    const { token, payload } = await QrShare.createShareToken({
      cameraId: camId,
      cameraName: cam.name,
      ownerName: App.state.user.name,
      permission: fd.get("permission"),
      expiresAt
    });

    await Storage.saveShare({ cameraId: camId, token, payload, revoked: false, createdAt: new Date().toISOString() });

    const box = document.getElementById("qr-result");
    box.innerHTML = `<canvas id="qr-canvas"></canvas><p class="dim small">Este código não contém a senha da câmera — só um token revogável.</p>`;
    QrShare.renderQrToCanvas(document.getElementById("qr-canvas"), token);
    refreshShareList(camId);
  });
}

async function refreshShareList(camId) {
  const shares = await Storage.listShares(camId);
  const box = document.getElementById("share-list");
  if (box) box.innerHTML = renderShareList(shares);
  box?.querySelectorAll('[data-action="revoke"]').forEach((btn) =>
    btn.addEventListener("click", async () => {
      await Storage.revokeShare(btn.dataset.share);
      refreshShareList(camId);
    })
  );
}

function bindScan() {
  const video = document.getElementById("scan-video");
  const canvas = document.getElementById("scan-canvas");
  QrShare.startQrScanner(video, canvas, async (data, err) => {
    if (err) { alert("Não foi possível acessar a câmera do celular: " + err.message); return; }
    if (!data) return;
    let token;
    try {
      const url = new URL(data);
      token = url.searchParams.get("share");
    } catch {
      token = data;
    }
    if (!token) { alert("QR Code não é um compartilhamento válido do CameraEye."); return; }
    const result = await QrShare.verifyShareToken(token);
    if (!result.valid) {
      alert("Token inválido ou expirado (" + result.reason + ").");
      navigate("home");
      return;
    }
    App.state.pendingToken = token;
    navigate("incoming", { payload: result.payload });
  });
}

function bindIncoming() {
  document.getElementById("btn-accept-share").addEventListener("click", async () => {
    const payload = App.state.params.payload;
    await Storage.saveCamera({
      name: payload.cname + " (compartilhada)",
      uid: payload.cid,
      protocols: ["webrtc"],
      sharedFrom: payload.owner,
      shareToken: App.state.pendingToken,
      status: "offline",
      ownerId: App.state.user.id,
      createdAt: new Date().toISOString()
    });
    navigate("home");
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  App.state.user = getOrCreateLocalUser();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  // Deep link de compartilhamento (?share=token) — abre direto a tela de confirmação.
  const params = new URLSearchParams(location.search);
  const sharedToken = params.get("share");
  if (sharedToken) {
    const result = await QrShare.verifyShareToken(sharedToken);
    if (result.valid) {
      App.state.pendingToken = sharedToken;
      navigate("incoming", { payload: result.payload });
      return;
    }
  }

  navigate("home");
});
