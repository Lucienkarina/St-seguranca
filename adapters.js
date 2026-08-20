// ============================================================================
// CameraEye — Camada de adaptadores de câmera (CameraAdapter)
// ----------------------------------------------------------------------------
// Esta é a camada de abstração pedida no briefing (item 13):
//
//   CameraAdapter
//    ├── ICSeeAdapter
//    ├── ONVIFAdapter
//    ├── RTSPAdapter
//    └── WebRTCAdapter
//
// LEIA ISTO PRIMEIRO — por que os adapters abaixo não "simplesmente
// funcionam" com uma câmera real:
//
// 1) ICSeeAdapter: "ICSee" é o app genérico usado por uma família enorme de
//    câmeras OEM chinesas (XM/Hi3518, XMEye, CamHi, V380 e dezenas de outras
//    marcas de caixa). Elas NÃO compartilham uma API pública documentada —
//    cada fabricante varia o protocolo P2P (geralmente baseado em UDP hole
//    punching contra servidores do fabricante na China) e o SDK é fechado
//    (bibliotecas .so/.dll distribuídas só para Android/iOS/Windows).
//    Não existe implementação de referência que um navegador possa chamar
//    diretamente. Por isso o ICSeeAdapter aqui expõe a INTERFACE correta,
//    mas o método connect() retorna status "unsupported_in_browser" com uma
//    explicação — em vez de inventar um endpoint ou fingir que conectou.
//    Para suportar de verdade, o caminho realista é: (a) o fabricante
//    específico da câmera do cliente publicar docs/SDK, ou (b) rodar o SDK
//    nativo fechado num serviço intermediário que converte para WebRTC
//    (ver README_ARQUITETURA.md).
//
// 2) ONVIFAdapter: ONVIF é um padrão real e documentado (SOAP/XML sobre
//    HTTP), mas navegadores não podem fazer essas chamadas para um IP da
//    LAN por causa de CORS/mixed-content, e a maioria das câmeras ONVIF só
//    expõe RTSP para o vídeo em si (não WebRTC). Então ONVIF aqui serve para
//    DESCOBERTA/CONFIGURAÇÃO (via um gateway local ou app companion), não
//    para tocar vídeo direto no navegador.
//
// 3) RTSPAdapter: navegadores NÃO reproduzem RTSP nativamente (briefing item
//    14). Este adapter nunca tenta abrir um <video> com uma URL rtsp://.
//    Ele reporta claramente que precisa de um gateway RTSP→WebRTC (ex.:
//    MediaMTX/go2rtc rodando como serviço, não como "PC ligado em casa" do
//    cliente final — normalmente hospedado pelo integrador).
//
// 4) WebRTCAdapter: é o único caminho que realmente funciona ponta-a-ponta
//    no navegador. Só funciona se a câmera (ou um gateway) fala WebRTC (ex.:
//    ofertas SDP via um servidor de sinalização + STUN/TURN). Este adapter
//    implementa o fluxo de conexão real com RTCPeerConnection; a única parte
//    que depende de infraestrutura externa é o servidor de sinalização
//    (signalingUrl), que este protótipo NÃO inclui (precisa ser apontado
//    para o serviço do integrador).
//
// Em todos os casos: nenhum adapter finge receber vídeo. Se a conexão não
// for possível, o adapter retorna um status explícito e a UI mostra isso ao
// usuário (nunca uma tela "ao vivo" falsa).
// ============================================================================

class CameraAdapter {
  constructor(camera) {
    this.camera = camera;
  }

  /** @returns {Promise<{ok: boolean, status: string, message: string}>} */
  async connect(_videoEl) {
    throw new Error("connect() não implementado");
  }

  disconnect() {}

  /** Estima suporte a recursos sem se conectar de fato. */
  static probeCapabilities(_camera) {
    return { ptz: false, snapshot: false, twoWayAudio: false };
  }
}

class ICSeeAdapter extends CameraAdapter {
  async connect() {
    return {
      ok: false,
      status: "unsupported_in_browser",
      message:
        "Este modelo usa um SDK P2P fechado do fabricante (família ICSee/XMEye). " +
        "Não é possível abrir isso diretamente do navegador sem um gateway do " +
        "fabricante ou um serviço intermediário licenciado. Veja " +
        "README_ARQUITETURA.md."
    };
  }
}

class ONVIFAdapter extends CameraAdapter {
  async connect() {
    return {
      ok: false,
      status: "needs_gateway",
      message:
        "ONVIF fornece descoberta/configuração, mas o vídeo em si normalmente " +
        "vem por RTSP, que o navegador não reproduz. Use este adapter para " +
        "configurar a câmera e o RTSPAdapter/WebRTCAdapter para o vídeo."
    };
  }

  /** Chamadas ONVIF reais exigem um gateway (não CORS-safe direto do navegador). */
  static async discoverOnLan() {
    return {
      supported: false,
      reason:
        "Descoberta WS-Discovery (multicast) não é acessível a partir de " +
        "JavaScript de navegador. Requer um serviço local (companion app) " +
        "ou backend na mesma rede."
    };
  }
}

class RTSPAdapter extends CameraAdapter {
  async connect() {
    return {
      ok: false,
      status: "needs_transcoding_gateway",
      message:
        "Esta câmera só oferece RTSP. Navegadores não tocam RTSP diretamente " +
        "(briefing item 14). É necessário um gateway RTSP→WebRTC (ex.: " +
        "MediaMTX/go2rtc) hospedado pelo integrador."
    };
  }
}

class WebRTCAdapter extends CameraAdapter {
  constructor(camera, { signalingUrl } = {}) {
    super(camera);
    this.signalingUrl = signalingUrl;
    this.pc = null;
    this.ws = null;
  }

  async connect(videoEl) {
    if (!this.signalingUrl) {
      return {
        ok: false,
        status: "no_signaling_server",
        message:
          "WebRTC exige um servidor de sinalização (troca de SDP/ICE) e, " +
          "normalmente, TURN para atravessar NAT. Configure " +
          "camera.signalingUrl apontando para esse serviço."
      };
    }

    try {
      this.pc = new RTCPeerConnection({
        iceServers: this.camera.iceServers || [{ urls: "stun:stun.l.google.com:19302" }]
      });

      this.pc.ontrack = (event) => {
        if (videoEl) videoEl.srcObject = event.streams[0];
      };

      this.ws = new WebSocket(this.signalingUrl);
      const opened = await new Promise((resolve) => {
        this.ws.onopen = () => resolve(true);
        this.ws.onerror = () => resolve(false);
        setTimeout(() => resolve(false), 4000);
      });

      if (!opened) {
        return {
          ok: false,
          status: "signaling_unreachable",
          message: "Não foi possível conectar ao servidor de sinalização informado."
        };
      }

      this.ws.onmessage = async (msg) => {
        const data = JSON.parse(msg.data);
        if (data.type === "answer") {
          await this.pc.setRemoteDescription(data.sdp);
        } else if (data.type === "ice") {
          await this.pc.addIceCandidate(data.candidate).catch(() => {});
        }
      };

      this.pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.ws.send(JSON.stringify({ type: "ice", candidate: e.candidate }));
        }
      };

      const offer = await this.pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
      await this.pc.setLocalDescription(offer);
      this.ws.send(JSON.stringify({ type: "offer", sdp: offer, cameraId: this.camera.uid }));

      return { ok: true, status: "connecting", message: "Oferta enviada, aguardando resposta do gateway." };
    } catch (err) {
      return { ok: false, status: "error", message: err.message };
    }
  }

  disconnect() {
    this.pc?.close();
    this.ws?.close();
  }
}

/** Escolhe o melhor adapter disponível para uma câmera, na ordem de preferência do briefing. */
function pickAdapter(camera) {
  if (camera.protocols?.includes("webrtc") && camera.signalingUrl) {
    return new WebRTCAdapter(camera, { signalingUrl: camera.signalingUrl });
  }
  if (camera.protocols?.includes("icsee")) return new ICSeeAdapter(camera);
  if (camera.protocols?.includes("rtsp")) return new RTSPAdapter(camera);
  if (camera.protocols?.includes("onvif")) return new ONVIFAdapter(camera);
  return null;
}

window.CameraAdapters = { CameraAdapter, ICSeeAdapter, ONVIFAdapter, RTSPAdapter, WebRTCAdapter, pickAdapter };
