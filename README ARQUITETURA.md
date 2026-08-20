# CameraEye — Leia antes de usar com câmeras reais

Este projeto é um **protótipo funcional da experiência completa do app**
(telas, fluxo, arquitetura de dados, criptografia local, tokens de
compartilhamento por QR Code) rodando 100% no navegador, sem backend.

Ele **não inventa** suporte a nenhum protocolo que uma câmera não ofereça.
Onde uma conexão de vídeo real depende de infraestrutura que este protótipo
não inclui, a interface diz isso explicitamente em vez de fingir que está
"ao vivo".

## O que já funciona de verdade, só com o navegador

- Cadastro de câmeras (nome, UID, usuário, senha, protocolos) salvo em
  IndexedDB no aparelho.
- Senha da câmera **criptografada com AES-GCM** (Web Crypto API) antes de
  salvar — nunca em texto puro.
- Fluxo completo de compartilhamento por QR Code: geração de token assinado
  (HMAC), leitura do QR pela câmera do celular (`getUserMedia` + jsQR),
  validação, expiração e **revogação** — tudo persistido localmente.
- PWA instalável (`manifest.json` + `sw.js`), tema escuro, mobile-first.
- `CameraAdapter` real com `RTCPeerConnection` — se você apontar
  `signalingUrl` para um servidor de sinalização WebRTC de verdade, o app
  negocia SDP/ICE e exibe o vídeo de verdade.

## O que exige infraestrutura real (e por quê)

| Necessidade | Por que o navegador sozinho não resolve |
|---|---|
| **Conectar em câmeras ICSee/XMEye (P2P proprietário)** | O protocolo é fechado, distribuído como SDK nativo (.so/.dll) do fabricante. Não há implementação em JavaScript que fale esse protocolo. Único caminho real: um serviço intermediário (rodando o SDK nativo do fabricante) que converte esse stream para WebRTC. |
| **RTSP → navegador** | Browsers não decodificam RTSP. É necessário um gateway RTSP→WebRTC (ex.: MediaMTX, go2rtc) — não um "PC ligado na casa do cliente", mas um serviço hospedado pelo integrador/plataforma, compartilhado entre clientes. |
| **Descoberta automática na rede local (ONVIF/mDNS/SSDP)** | JavaScript de navegador não tem acesso a broadcast/multicast UDP. Precisa de um app companion nativo ou um pequeno agente na rede do cliente. |
| **Revogação de acesso realmente segura entre dispositivos** | Sem backend, a "revogação" só é conhecida pelo aparelho que revogou. Um segundo dispositivo do mesmo convidado, offline no momento da revogação, não saberia. Um backend central com os tokens e sua validade é o que torna isso confiável. |
| **Multi-cliente real (item 11 do briefing)** | Isolamento de dados entre clientes exige autenticação de verdade (não um ID gerado localmente) e regras de acesso no servidor — o `localStorage`/IndexedDB de um navegador é por definição de um único dispositivo. |
| **TURN para atravessar NAT/CGNAT** | Muitas redes residenciais no Brasil usam CGNAT, o que impede P2P direto. Um servidor TURN (ex.: coturn) é necessário como retransmissor de mídia nesses casos. |

## Próximos passos recomendados

1. **Identifique o modelo real da câmera do cliente** (chip, app original,
   qualquer documentação do fabricante) antes de implementar o
   `ICSeeAdapter` de verdade — famílias diferentes de "câmeras ICSee" usam
   SDKs diferentes.
2. Se o objetivo é ter algo funcionando rápido com o menor backend possível,
   o caminho mais realista é: **um gateway central (RTSP/ONVIF/SDK nativo →
   WebRTC)** rodando na nuvem, que o PWA acessa via `signalingUrl`. Isso
   evita "servidor físico na casa do cliente" (exigência do briefing) porque
   o gateway é compartilhado/multi-tenant, não um Raspberry Pi por casa.
3. Mover a emissão/assinatura de tokens de compartilhamento e o cadastro de
   usuários para esse backend, para revogação e isolamento multi-cliente
   confiáveis.

## Como rodar localmente

Como o app usa Service Worker, ele precisa ser servido por HTTP(S), não
aberto como `file://`. Exemplo simples:

```bash
cd cameraeye
python3 -m http.server 8080
# depois abra http://localhost:8080 no celular (mesma rede) ou via túnel HTTPS
```

Para instalar como app (tela inicial), é necessário HTTPS em produção
(exceto `localhost` em testes).
