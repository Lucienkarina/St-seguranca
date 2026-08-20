// ============================================================================
// CameraEye — QR Code (compartilhamento) e tokens de acesso
// ----------------------------------------------------------------------------
// A senha da câmera NUNCA entra no QR Code. O QR carrega só um token opaco
// assinado. Neste protótipo sem backend, a "assinatura" usa HMAC com uma
// chave local (Web Crypto) só para demonstrar o formato do token e o fluxo
// de validação/expiração/revogação end-to-end no mesmo aparelho.
//
// EM PRODUÇÃO: o token deve ser emitido e assinado pelo BACKEND (não pelo
// dispositivo do proprietário), guardando a chave de assinatura no servidor.
// Isso é o que torna a revogação (item 7/8 do briefing) realmente segura —
// sem backend, um dispositivo offline não consegue "avisar" outros
// dispositivos que um token foi revogado.
// ============================================================================

async function getSigningKey() {
  const existing = localStorage.getItem("cameraeye-sign-key");
  if (existing) {
    return crypto.subtle.importKey(
      "raw", Uint8Array.from(atob(existing), (c) => c.charCodeAt(0)),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
    );
  }
  const key = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" }, true, ["sign", "verify"]
  );
  const raw = await crypto.subtle.exportKey("raw", key);
  localStorage.setItem("cameraeye-sign-key", btoa(String.fromCharCode(...new Uint8Array(raw))));
  return key;
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createShareToken({ cameraId, cameraName, ownerName, permission, expiresAt }) {
  const payload = {
    v: 1,
    cid: cameraId,
    cname: cameraName,
    owner: ownerName,
    perm: permission, // 'view' | 'control'
    exp: expiresAt,   // ISO string ou null = permanente
    jti: crypto.randomUUID()
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await getSigningKey();
  const sig = await crypto.subtle.sign("HMAC", key, payloadBytes);
  const token = `${b64url(payloadBytes)}.${b64url(new Uint8Array(sig))}`;
  return { token, payload };
}

async function verifyShareToken(token) {
  try {
    const [p64, s64] = token.split(".");
    const payloadBytes = Uint8Array.from(atob(p64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const sigBytes = Uint8Array.from(atob(s64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const key = await getSigningKey();
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, payloadBytes);
    if (!valid) return { valid: false, reason: "assinatura_invalida" };
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (payload.exp && new Date(payload.exp) < new Date()) {
      return { valid: false, reason: "expirado", payload };
    }
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, reason: "token_malformado" };
  }
}

/** Renderiza um QR code num <canvas> usando a lib QRCode (CDN). URL carrega só o token. */
function renderQrToCanvas(canvas, token) {
  const url = `${location.origin}${location.pathname}?share=${encodeURIComponent(token)}`;
  // eslint-disable-next-line no-undef
  QRCode.toCanvas(canvas, url, { width: 240, margin: 1, color: { dark: "#0A0908", light: "#FFB000" } });
  return url;
}

/** Inicia a câmera do dispositivo e decodifica QR codes em tempo real com jsQR (CDN). */
function startQrScanner(videoEl, canvasEl, onDecoded) {
  let stream, raf, stopped = false;
  const ctx = canvasEl.getContext("2d");

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    videoEl.srcObject = stream;
    await videoEl.play();
    tick();
  }

  function tick() {
    if (stopped) return;
    if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      // eslint-disable-next-line no-undef
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        onDecoded(code.data);
        return; // para de escanear após primeira leitura
      }
    }
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    stopped = true;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
  }

  start().catch((err) => onDecoded(null, err));
  return { stop };
}

window.QrShare = { createShareToken, verifyShareToken, renderQrToCanvas, startQrScanner };
