import express from "express";
import { WebSocketServer } from "ws";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const OpusScript = require("opusscript");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const XIAOZHI_TOKEN =
    process.env.XIAOZHI_TOKEN || "xiaozhi-render-test-token";

const WEBSOCKET_URL =
    "wss://xiaozhi-gemini-server.onrender.com/xiaozhi/v1/";

const CHAT_MODEL = "gemini-3.5-flash-lite";
const TTS_MODEL = "gemini-3.8-flash-lite-tts";
const SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 960; // 60 ms

// Mantém o VAD ajustado anteriormente.
const VOICE_THRESHOLD = 2500;
const SILENCE_FRAMES_TO_END = 15;
const VOICE_FRAMES_TO_START = 4;

const delay = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

/* =========================================================
   ROTAS HTTP
========================================================= */

app.get("/", (req, res) => {
    res.send("Xiaozhi Gemini Server funcionando!");
});

app.get("/xiaozhi/ota/", (req, res) => {
    res.json({
        message: "Xiaozhi OTA funcionando!",
        websocket: { url: WEBSOCKET_URL }
    });
});

app.post("/xiaozhi/ota/", (req, res) => {
    const deviceVersion =
        req.body?.application?.version || "0.0.0";

    res.json({
        server_time: {
            timestamp: Date.now(),
            timezone_offset: -180
        },
        firmware: {
            version: deviceVersion,
            url: ""
        },
        websocket: {
            url: WEBSOCKET_URL,
            token: XIAOZHI_TOKEN
        }
    });
});

/* =========================================================
   CHAT HTTP — MANTIDO PARA TESTES
========================================================= */

async function callGeminiText(text) {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": process.env.GEMINI_API_KEY
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text }]
                }],
                systemInstruction: {
                    parts: [{
                        text:
                            "Você é o Xiaozhi, um pequeno robô inteligente, divertido e amigável. Responda em português do Brasil de forma natural, simpática e curta."
                    }]
                },
                generationConfig: {
                    temperature: 0.7
                }
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            `Gemini texto HTTP ${response.status}: ${JSON.stringify(data)}`
        );
    }

    const reply = data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!reply) {
        throw new Error("Gemini não retornou texto.");
    }

    return reply;
}

app.post("/chat", async (req, res) => {
    try {
        if (!req.body?.message) {
            return res.status(400).json({
                error: "Mensagem não informada"
            });
        }

        const response = await callGeminiText(req.body.message);
        res.json({ response });
    } catch (error) {
        console.error("Erro /chat:", error.message);
        res.status(500).json({ error: error.message });
    }
});

/* =========================================================
   PCM PARA WAV — USADO PELO STT
========================================================= */

function pcmToWav(pcmBuffers) {
    const pcm = Buffer.concat(pcmBuffers);
    const channels = 1;
    const bitsPerSample = 16;
    const byteRate = SAMPLE_RATE * channels * bitsPerSample / 8;
    const blockAlign = channels * bitsPerSample / 8;
    const wav = Buffer.alloc(44 + pcm.length);

    wav.write("RIFF", 0);
    wav.writeUInt32LE(36 + pcm.length, 4);
    wav.write("WAVE", 8);
    wav.write("fmt ", 12);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(channels, 22);
    wav.writeUInt32LE(SAMPLE_RATE, 24);
    wav.writeUInt32LE(byteRate, 28);
    wav.writeUInt16LE(blockAlign, 32);
    wav.writeUInt16LE(bitsPerSample, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(pcm.length, 40);
    pcm.copy(wav, 44);

    return wav;
}

/* =========================================================
   STT — TRANSCRIÇÃO
========================================================= */

async function transcribeAudio(pcmBuffers) {
    if (!pcmBuffers?.length) return null;

    const wav = pcmToWav(pcmBuffers);

    console.log(
        `📝 STT: enviando WAV de ${wav.length} bytes`
    );

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": process.env.GEMINI_API_KEY
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            inlineData: {
                                mimeType: "audio/wav",
                                data: wav.toString("base64")
                            }
                        },
                        {
                            text:
                                "Transcreva exatamente o que foi falado neste áudio em português do Brasil. Retorne somente a transcrição, sem explicações e sem responder à pergunta."
                        }
                    ]
                }],
                generationConfig: { temperature: 0 }
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            `STT HTTP ${response.status}: ${JSON.stringify(data)}`
        );
    }

    const text = data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!text) {
        console.log("⚠️ STT não retornou texto.");
        return null;
    }

    console.log("📝 STT:", text);
    return text;
}

/* =========================================================
   TTS — GEMINI INTERACTIONS API
========================================================= */

async function generateTTS(text) {
    console.log(`🔊 TTS: gerando voz com ${TTS_MODEL}`);

    const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": process.env.GEMINI_API_KEY
            },
            body: JSON.stringify({
                model: TTS_MODEL,
                input: [{
                    type: "user_input",
                    content: [{
                        type: "text",
                        text,
                        annotations: [{
                            type: "speech_metadata",
                            style:
                                "Fale em português brasileiro com ritmo natural e ágil, como em uma conversa cotidiana. Pronuncie as palavras claramente, sem prolongar vogais e sem pausas desnecessárias. Voz alegre, amigável e expressiva."
                        }]
                    }]
                }],
                response_format: {
                    type: "audio",
                    mime_type: "audio/l16",
                    sample_rate: SAMPLE_RATE
                },
                generation_config: {
                    speech_config: [
                        { voice: "Kore" }
                    ]
                }
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            `TTS HTTP ${response.status}: ${JSON.stringify(data)}`
        );
    }

    // A resposta REST guarda o áudio em steps[].content[].
    const audioContent = (data.steps || [])
        .filter(step => step.type === "model_output")
        .flatMap(step => step.content || [])
        .find(content => content.type === "audio");

    if (!audioContent?.data) {
        throw new Error(
            `TTS não retornou áudio: ${JSON.stringify(data)}`
        );
    }

    const pcm = Buffer.from(audioContent.data, "base64");

    if (pcm.length < 2) {
        throw new Error("O TTS retornou áudio vazio.");
    }
    console.log("TTS bytes:", pcm.length);
    console.log("TTS duração a 16 kHz:", (pcm.length / 2 / 16000).toFixed(2), "s");
    console.log("TTS duração a 24 kHz:", (pcm.length / 2 / 24000).toFixed(2), "s");
    console.log(
        `🔊 TTS pronto: ${pcm.length} bytes, ` +
        `${(pcm.length / 2 / SAMPLE_RATE).toFixed(2)} s`
    );

    return pcm;
}

/* =========================================================
   ENVIAR PCM CODIFICADO EM OPUS AO ESP32
========================================================= */

async function sendTTS(ws, sessionId, pcm) {
    if (ws.readyState !== 1 || !pcm?.length) return;

    // PCM L16: cada amostra tem 2 bytes.
    // O último frame é completado com silêncio, se necessário.
    const frameBytes = FRAME_SAMPLES * 2;
    const encoder = new OpusScript(
        SAMPLE_RATE,
        1,
        OpusScript.Application.AUDIO
    );

    let frameCounter = 0;

    try {
        ws.send(JSON.stringify({
            session_id: sessionId,
            type: "tts",
            state: "start"
        }));

        // Texto para a tela, quando o firmware suportar o evento.
        ws.send(JSON.stringify({
            session_id: sessionId,
            type: "tts",
            state: "sentence_start",
            text: ""
        }));

        for (let offset = 0; offset < pcm.length; offset += frameBytes) {
            if (ws.readyState !== 1) break;

            const chunk = pcm.subarray(
                offset,
                Math.min(offset + frameBytes, pcm.length)
            );

            let frame = chunk;

            if (chunk.length < frameBytes) {
                frame = Buffer.alloc(frameBytes);
                chunk.copy(frame);
            }

            const opusFrame = encoder.encode(
                frame,
                FRAME_SAMPLES
            );

            // A saída precisa ser binária, não texto.
            ws.send(opusFrame, { binary: true });
            frameCounter++;

            // Ritmo em tempo real: 60 ms por frame.
            await delay(60);
        }

        if (ws.readyState === 1) {
            ws.send(JSON.stringify({
                session_id: sessionId,
                type: "tts",
                state: "stop"
            }));
        }

        console.log(`🔊 TTS enviado: ${frameCounter} frames Opus`);

    } finally {
        try {
            encoder.delete();
        } catch {}
    }
}

/* =========================================================
   SERVIDOR WEBSOCKET
========================================================= */

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
    const authorization = req.headers.authorization || "";

    if (authorization !== `Bearer ${XIAOZHI_TOKEN}`) {
        console.log("❌ WebSocket: token inválido.");
        ws.close(1008, "Unauthorized");
        return;
    }

    const sessionId = randomUUID();
    const decoder = new OpusScript(
        SAMPLE_RATE,
        1,
        OpusScript.Application.AUDIO
    );

    console.log("✅ WebSocket conectado:", sessionId);

    let audioFrameCounter = 0;
    let voiceFrameCounter = 0;
    let silenceFrameCounter = 0;
    let speechDetected = false;
    let speechBuffer = [];
    let speechBytes = 0;
    let processingSpeech = false;
    let isSpeaking = false;
    let closed = false;

    function startSpeech() {
        if (speechDetected || processingSpeech || isSpeaking) return;

        speechDetected = true;
        silenceFrameCounter = 0;
        speechBuffer = [];
        speechBytes = 0;

        console.log("🎤 VOZ DETECTADA");
    }

    async function finishSpeech() {
        if (!speechDetected) return;

        speechDetected = false;

        const audioToTranscribe = [...speechBuffer];
        const bytes = speechBytes;

        speechBuffer = [];
        speechBytes = 0;
        silenceFrameCounter = 0;
        voiceFrameCounter = 0;

        console.log(
            `🔇 FIM DA FALA: ${bytes} bytes, ` +
            `${(bytes / 2 / SAMPLE_RATE).toFixed(2)} s`
        );

        if (processingSpeech || isSpeaking || closed) {
            console.log("⚠️ Outra resposta já está em andamento.");
            return;
        }

        processingSpeech = true;

        try {
            // 1. Transcrição
            const text = await transcribeAudio(audioToTranscribe);
            if (!text || closed) return;

            if (ws.readyState === 1) {
                ws.send(JSON.stringify({
                    session_id: sessionId,
                    type: "stt",
                    text
                }));
            }

            // 2. Resposta textual
            console.log("🧠 Consultando Gemini...");
            const reply = await callGeminiText(text);
            if (!reply || closed) return;

            console.log("🧠 GEMINI:", reply);

            // 3. Gerar áudio
            const pcm = await generateTTS(reply);
            if (!pcm || closed) return;

            // 4. Enviar áudio ao dispositivo
            isSpeaking = true;
            try {
                await sendTTS(ws, sessionId, pcm);
            } finally {
                isSpeaking = false;
            }

        } catch (error) {
            console.error("❌ Erro no ciclo de conversa:", error.message);
        } finally {
            processingSpeech = false;
        }
    }

    ws.on("message", async (data, isBinary) => {
        if (closed) return;

        if (isBinary) {
            // Não interpretar áudio de retorno como fala do usuário.
            if (isSpeaking || processingSpeech) return;

            audioFrameCounter++;

            try {
                const pcm = decoder.decode(data);
                if (!pcm.length) return;

                let sumSquares = 0;
                let peak = 0;
                const samples = Math.floor(pcm.length / 2);

                for (let i = 0; i + 1 < pcm.length; i += 2) {
                    const sample = pcm.readInt16LE(i);
                    const absolute = Math.abs(sample);
                    if (absolute > peak) peak = absolute;
                    sumSquares += sample * sample;
                }

                const rms = samples
                    ? Math.sqrt(sumSquares / samples)
                    : 0;

                if (rms >= VOICE_THRESHOLD) {
                    voiceFrameCounter++;
                    silenceFrameCounter = 0;

                    if (
                        !speechDetected &&
                        voiceFrameCounter >= VOICE_FRAMES_TO_START
                    ) {
                        startSpeech();
                    }
                } else {
                    voiceFrameCounter = 0;

                    if (speechDetected) {
                        silenceFrameCounter++;
                    }
                }

                if (speechDetected) {
                    speechBuffer.push(pcm);
                    speechBytes += pcm.length;
                }

                if (
                    speechDetected &&
                    silenceFrameCounter >= SILENCE_FRAMES_TO_END
                ) {
                    await finishSpeech();
                }

                if (audioFrameCounter % 10 === 0) {
                    console.log(
                        `ÁUDIO | frame: ${audioFrameCounter}` +
                        ` | RMS: ${rms.toFixed(0)}` +
                        ` | pico: ${peak}` +
                        ` | estado: ${speechDetected ? "FALANDO" : "silêncio"}`
                    );
                }
            } catch (error) {
                console.error("Erro ao decodificar Opus:", error.message);
            }

            return;
        }

        try {
            const message = JSON.parse(data.toString());

            console.log("JSON recebido:", JSON.stringify(message));

            if (message.type === "hello") {
                ws.send(JSON.stringify({
                    type: "hello",
                    transport: "websocket",
                    session_id: sessionId,
                    audio_params: {
                        format: "opus",
                        sample_rate: SAMPLE_RATE,
                        channels: 1,
                        frame_duration: 60
                    }
                }));

                console.log("🤝 Hello enviado.");
                return;
            }

            if (message.type === "listen") {
                console.log(
                    "Listen:",
                    message.state,
                    message.mode || ""
                );
                return;
            }

            if (message.type === "abort") {
                console.log("Abort recebido:", message.reason || "");

                // Não tentar continuar uma resposta interrompida.
                if (isSpeaking && ws.readyState === 1) {
                    ws.send(JSON.stringify({
                        session_id: sessionId,
                        type: "tts",
                        state: "stop"
                    }));
                }
                return;
            }

            if (message.type === "mcp") {
                console.log("MCP recebido.");
            }

        } catch (error) {
            console.error("Erro ao processar JSON:", error.message);
        }
    });

    ws.on("close", () => {
        closed = true;
        console.log("Cliente desconectado:", sessionId);

        try {
            decoder.delete();
        } catch {}
    });

    ws.on("error", error => {
        console.error("Erro WebSocket:", error.message);
    });
});

/* =========================================================
   INICIAR
========================================================= */

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log("HTTP: OK");
    console.log("WebSocket: OK");
    console.log("OTA: OK");
    console.log("STT:", CHAT_MODEL);
    console.log("Gemini:", CHAT_MODEL);
    console.log("TTS:", TTS_MODEL);
});

