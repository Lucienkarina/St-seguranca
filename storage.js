// ============================================================================
// CameraEye — Camada de armazenamento seguro
// ----------------------------------------------------------------------------
// IMPORTANTE (leia antes de usar em produção):
// Este módulo roda 100% no dispositivo (IndexedDB + WebCrypto) para que o
// protótipo funcione sem backend. Ele resolve "não guardar senha em texto
// puro" localmente, mas NÃO resolve multi-usuário real, revogação
// instantânea entre dispositivos, nem assinatura de tokens à prova de
// adulteração — isso exige um backend (ver README_ARQUITETURA.md, seção
// "O que precisa de servidor e por quê"). Trate as classes abaixo como a
// interface que o backend real deve implementar.
// ============================================================================

const DB_NAME = "cameraeye-db";
const DB_VERSION = 1;
const STORES = ["cameras", "shares", "session", "keys"];

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  });
}

// ---- Criptografia local (AES-GCM) -----------------------------------------
// A chave fica só na memória/IndexedDB do próprio aparelho, nunca é enviada
// a lugar nenhum. Isso protege contra "abrir o storage do navegador e ler a
// senha da câmera direto", mas não substitui um cofre de segredos em backend
// para o cenário multi-cliente do item 11 do briefing.

async function getOrCreateDeviceKey() {
  const existing = await tx("keys", "readonly", (s) => {
    return new Promise((res) => {
      const r = s.get("device-key");
      r.onsuccess = () => res(r.result);
    });
  });
  if (existing) {
    return crypto.subtle.importKey(
      "jwk", existing.jwk, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]
    );
  }
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", key);
  await tx("keys", "readwrite", (s) => s.put({ id: "device-key", jwk }));
  return key;
}

async function encryptSecret(plainText) {
  const key = await getOrCreateDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plainText);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc);
  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(cipher))
  };
}

async function decryptSecret(payload) {
  if (!payload) return "";
  const key = await getOrCreateDeviceKey();
  const iv = new Uint8Array(payload.iv);
  const data = new Uint8Array(payload.data);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plain);
}

// ---- API pública ------------------------------------------------------------

const Storage = {
  async listCameras() {
    return tx("cameras", "readonly", (s) => {
      return new Promise((res) => {
        const r = s.getAll();
        r.onsuccess = () => res(r.result || []);
      });
    });
  },

  async saveCamera(camera) {
    // Senha nunca é guardada em texto puro — sempre passa pelo AES-GCM local.
    const toSave = { ...camera };
    if (toSave.password) {
      toSave.passwordEnc = await encryptSecret(toSave.password);
      delete toSave.password;
    }
    if (!toSave.id) toSave.id = "cam_" + crypto.randomUUID();
    await tx("cameras", "readwrite", (s) => s.put(toSave));
    return toSave;
  },

  async getCameraWithSecret(id) {
    const cam = await tx("cameras", "readonly", (s) => {
      return new Promise((res) => {
        const r = s.get(id);
        r.onsuccess = () => res(r.result);
      });
    });
    if (!cam) return null;
    const password = cam.passwordEnc ? await decryptSecret(cam.passwordEnc) : "";
    return { ...cam, password };
  },

  async deleteCamera(id) {
    await tx("cameras", "readwrite", (s) => s.delete(id));
    await tx("shares", "readwrite", (s) => {
      return new Promise((res) => {
        const r = s.getAll();
        r.onsuccess = () => {
          r.result.filter((sh) => sh.cameraId === id).forEach((sh) => s.delete(sh.id));
          res();
        };
      });
    });
  },

  async listShares(cameraId) {
    const all = await tx("shares", "readonly", (s) => {
      return new Promise((res) => {
        const r = s.getAll();
        r.onsuccess = () => res(r.result || []);
      });
    });
    return cameraId ? all.filter((s) => s.cameraId === cameraId) : all;
  },

  async saveShare(share) {
    if (!share.id) share.id = "share_" + crypto.randomUUID();
    await tx("shares", "readwrite", (s) => s.put(share));
    return share;
  },

  async revokeShare(id) {
    await tx("shares", "readwrite", (s) => {
      return new Promise((res) => {
        const r = s.get(id);
        r.onsuccess = () => {
          const share = r.result;
          if (share) {
            share.revoked = true;
            share.revokedAt = new Date().toISOString();
            s.put(share);
          }
          res();
        };
      });
    });
  },

  async getShareByToken(token) {
    const all = await tx("shares", "readonly", (s) => {
      return new Promise((res) => {
        const r = s.getAll();
        r.onsuccess = () => res(r.result || []);
      });
    });
    return all.find((s) => s.token === token) || null;
  }
};

window.Storage = Storage;
