import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
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

/* =========================================================
   CONFIGURAÇÃO DO VAD
========================================================= */

const VOICE_THRESHOLD = 2500;

const SILENCE_FRAMES_TO_END = 15;

const VOICE_FRAMES_TO_START = 4;


/* =========================================================
   ROOT
========================================================= */

app.get("/", (req, res) => {

    res.send(
        "Xiaozhi Gemini Server funcionando!"
    );

});

/* =========================================================
   TESTE TEMPORÁRIO DO GEMINI TTS
========================================================= */

app.get("/teste-tts", async (req, res) => {
    // Protege a rota para evitar chamadas indevidas à API.
    if (req.query.token !== XIAOZHI_TOKEN) {
        return res.status(401).json({
            ok: false,
            erro: "Token inválido."
        });
    }

    try {
        console.log("🔊 Iniciando teste Gemini TTS...");

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/interactions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": process.env.GEMINI_API_KEY
                },
                body: JSON.stringify({
                    model: "gemini-3.8-flash-lite-tts",
                    input: [{
                        type: "user_input",
                        content: [{
                            type: "text",
                            text: "Olá! Eu sou o Xiaozhi. É muito bom falar com você.",
                            annotations: [{
                                type: "speech_metadata",
                                style: "friendly, cheerful, natural Brazilian Portuguese"
                            }]
                        }]
                    }],
                    response_format: {
                        type: "audio",
                        mime_type: "audio/l16",
                        sample_rate: 16000
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
            console.error("Erro Gemini TTS:", JSON.stringify(data));

            return res.status(response.status).json({
                ok: false,
                etapa: "Gemini TTS",
                erro: data
            });
        }

        const audioContent = (data.steps || [])
            .filter(step => step.type === "model_output")
            .flatMap(step => step.content || [])
            .find(content => content.type === "audio");

        if (!audioContent?.data) {
            console.error("Resposta sem áudio:", JSON.stringify(data));

            return res.status(502).json({
                ok: false,
                erro: "A API respondeu, mas não retornou áudio."
            });
        }

        const pcm = Buffer.from(audioContent.data, "base64");

        const resultado = {
            ok: true,
            modelo: "gemini-3.8-flash-lite-tts",
            formato: "PCM 16-bit mono",
            frequencia: 16000,
            tamanho_bytes: pcm.length,
            duracao_segundos: Number(
                (pcm.length / 2 / 16000).toFixed(2)
            ),
            mensagem: "TTS gerou áudio com sucesso!"
        };

        console.log("✅ TTS funcionando:", JSON.stringify(resultado));

        return res.json(resultado);

    } catch (error) {
        console.error("Erro no teste TTS:", error);

        return res.status(500).json({
            ok: false,
            erro: error.message
        });
    }
});

/* =========================================================
   CHAT HTTP
========================================================= */

app.post("/chat", async (req, res) => {

    try {

        const message =
            req.body.message;

        if (!message) {

            return res.status(400).json({

                error:
                    "Mensagem não informada"

            });

        }


        const response =
            await fetch(

                "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",

                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "x-goog-api-key":
                            process.env.GEMINI_API_KEY

                    },

                    body:
                        JSON.stringify({

                            contents: [

                                {

                                    parts: [

                                        {

                                            text:
                                                message

                                        }

                                    ]

                                }

                            ],

                            systemInstruction: {

                                parts: [

                                    {

                                        text:
                                            "Você é o Xiaozhi, um pequeno robô inteligente, divertido e amigável. Responda em português do Brasil de forma natural e curta."

                                    }

                                ]

                            }

                        })

                }

            );


        const data =
            await response.json();


        if (!response.ok) {

            console.error(

                "Erro Gemini:",

                JSON.stringify(data)

            );

            return res.status(
                response.status
            ).json(data);

        }


        const text =
            data.candidates?.[0]?.content?.parts?.[0]?.text ||
            "Não consegui gerar uma resposta.";


        res.json({

            response:
                text

        });


    } catch (error) {

        console.error(

            "Erro no servidor:",

            error

        );

        res.status(500).json({

            error:
                error.message

        });

    }

});


/* =========================================================
   CONVERTER PCM PARA WAV
========================================================= */

function pcmToWav(
    pcmBuffers
) {

    const pcm =
        Buffer.concat(
            pcmBuffers
        );


    const sampleRate =
        16000;

    const channels =
        1;

    const bitsPerSample =
        16;


    const byteRate =
        sampleRate *
        channels *
        bitsPerSample /
        8;


    const blockAlign =
        channels *
        bitsPerSample /
        8;


    const wav =
        Buffer.alloc(
            44 + pcm.length
        );


    /* RIFF */

    wav.write(
        "RIFF",
        0
    );

    wav.writeUInt32LE(
        36 + pcm.length,
        4
    );

    wav.write(
        "WAVE",
        8
    );


    /* fmt */

    wav.write(
        "fmt ",
        12
    );

    wav.writeUInt32LE(
        16,
        16
    );

    wav.writeUInt16LE(
        1,
        20
    );

    wav.writeUInt16LE(
        channels,
        22
    );

    wav.writeUInt32LE(
        sampleRate,
        24
    );

    wav.writeUInt32LE(
        byteRate,
        28
    );

    wav.writeUInt16LE(
        blockAlign,
        32
    );

    wav.writeUInt16LE(
        bitsPerSample,
        34
    );


    /* data */

    wav.write(
        "data",
        36
    );

    wav.writeUInt32LE(
        pcm.length,
        40
    );


    pcm.copy(
        wav,
        44
    );


    return wav;

}


/* =========================================================
   STT
========================================================= */

async function transcribeAudio(
    pcmBuffers
) {

    try {

        if (
            !pcmBuffers ||
            pcmBuffers.length === 0
        ) {

            console.log(
                "STT: nenhum áudio para transcrever."
            );

            return null;

        }


        const wav =
            pcmToWav(
                pcmBuffers
            );


        console.log("");

        console.log(
            "================================="
        );

        console.log(
            "📝 ENVIANDO ÁUDIO PARA STT"
        );

        console.log(
            "WAV:",
            wav.length,
            "bytes"
        );

        console.log(
            "================================="
        );


        const audioBase64 =
            wav.toString(
                "base64"
            );


        const response =
            await fetch(

                "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",

                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "x-goog-api-key":
                            process.env.GEMINI_API_KEY

                    },

                    body:
                        JSON.stringify({

                            contents: [

                                {

                                    parts: [

                                        {

                                            inlineData: {

                                                mimeType:
                                                    "audio/wav",

                                                data:
                                                    audioBase64

                                            }

                                        },

                                        {

                                            text:
                                                "Transcreva exatamente o que foi falado neste áudio. O áudio está em português do Brasil. Retorne somente a transcrição, sem explicações, sem comentários e sem responder à pergunta."

                                        }

                                    ]

                                }

                            ],

                            generationConfig: {

                                temperature:
                                    0

                            }

                        })

                }

            );


        const data =
            await response.json();


        if (!response.ok) {

            console.error(

                "❌ Erro no STT:",

                JSON.stringify(data)

            );

            return null;

        }


        const text =
            data.candidates?.[0]?.content?.parts
                ?.map(
                    part =>
                        part.text || ""
                )
                .join("")
                .trim();


        if (!text) {

            console.log(
                "⚠️ STT não retornou texto."
            );

            console.log(
                "Resposta:",
                JSON.stringify(data)
            );

            return null;

        }


        console.log("");

        console.log(
            "================================="
        );

        console.log(
            "📝 STT RESULTADO:"
        );

        console.log(
            text
        );

        console.log(
            "================================="
        );

        console.log("");


        return text;


    } catch (error) {

        console.error(

            "❌ Erro ao executar STT:",

            error

        );

        return null;

    }

}


/* =========================================================
   GEMINI
========================================================= */

async function askGemini(
    text
) {

    try {

        console.log("");

        console.log(
            "================================="
        );

        console.log(
            "🧠 ENVIANDO TEXTO PARA GEMINI"
        );

        console.log(
            "Texto:",
            text
        );

        console.log(
            "================================="
        );


        const response =
            await fetch(

                "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",

                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "x-goog-api-key":
                            process.env.GEMINI_API_KEY

                    },

                    body:
                        JSON.stringify({

                            contents: [

                                {

                                    parts: [

                                        {

                                            text:
                                                text

                                        }

                                    ]

                                }

                            ],

                            systemInstruction: {

                                parts: [

                                    {

                                        text:
                                            "Você é o Xiaozhi, um pequeno robô inteligente, divertido e amigável. Responda em português do Brasil de forma natural, simpática e curta. Não faça respostas excessivamente longas."

                                    }

                                ]

                            },

                            generationConfig: {

                                temperature:
                                    0.7

                            }

                        })

                }

            );


        const data =
            await response.json();


        if (!response.ok) {

            console.error("");

            console.error(
                "❌ ERRO GEMINI:"
            );

            console.error(
                JSON.stringify(data)
            );

            return null;

        }


        const reply =
            data.candidates?.[0]?.content?.parts
                ?.map(
                    part =>
                        part.text || ""
                )
                .join("")
                .trim();


        if (!reply) {

            console.log(
                "⚠️ Gemini não retornou resposta."
            );

            console.log(
                "Resposta:",
                JSON.stringify(data)
            );

            return null;

        }


        console.log("");

        console.log(
            "================================="
        );

        console.log(
            "🧠 GEMINI RESPONDEU:"
        );

        console.log(
            reply
        );

        console.log(
            "================================="
        );

        console.log("");


        return reply;


    } catch (error) {

        console.error("");

        console.error(
            "❌ ERRO AO CHAMAR GEMINI:"
        );

        console.error(
            error
        );

        return null;

    }

}


/* =========================================================
   OTA GET
========================================================= */

app.get(
    "/xiaozhi/ota/",
    (req, res) => {

        res.json({

            message:
                "Xiaozhi OTA funcionando!",

            websocket: {

                url:
                    WEBSOCKET_URL

            }

        });

    }
);


/* =========================================================
   OTA POST
========================================================= */

app.post(
    "/xiaozhi/ota/",
    (req, res) => {

        console.log(
            "================================="
        );

        console.log(
            "OTA REQUEST RECEBIDO"
        );

        console.log(
            "Device-ID:",
            req.headers["device-id"]
        );

        console.log(
            "Client-ID:",
            req.headers["client-id"]
        );

        console.log(
            "User-Agent:",
            req.headers["user-agent"]
        );

        console.log(
            "================================="
        );


        const deviceVersion =
            req.body?.application?.version ||
            "0.0.0";


        res.json({

            server_time: {

                timestamp:
                    Date.now(),

                timezone_offset:
                    -180

            },

            firmware: {

                version:
                    deviceVersion,

                url:
                    ""

            },

            websocket: {

                url:
                    WEBSOCKET_URL,

                token:
                    XIAOZHI_TOKEN

            }

        });

    }
);


/* =========================================================
   HTTP SERVER
========================================================= */

const server =
    http.createServer(
        app
    );


/* =========================================================
   WEBSOCKET SERVER
========================================================= */

const wss =
    new WebSocketServer({
        server
    });


wss.on(
    "connection",
    (ws, req) => {

        const clientIp =
            req.socket.remoteAddress;

        const requestUrl =
            req.url || "/";


        console.log(
            "================================="
        );

        console.log(
            "NOVO CLIENTE WEBSOCKET"
        );

        console.log(
            "URL:",
            requestUrl
        );

        console.log(
            "IP:",
            clientIp
        );

        console.log(
            "Device-ID:",
            req.headers["device-id"]
        );

        console.log(
            "Client-ID:",
            req.headers["client-id"]
        );

        console.log(
            "Protocol-Version:",
            req.headers["protocol-version"]
        );

        console.log(
            "Authorization:",

            req.headers["authorization"]
                ? "recebido"
                : "ausente"

        );

        console.log(
            "================================="
        );


        /* =================================================
           AUTENTICAÇÃO
        ================================================= */

        const authorization =
            req.headers["authorization"] ||
            "";

        const expected =
            `Bearer ${XIAOZHI_TOKEN}`;


        if (
            authorization !==
            expected
        ) {

            console.log(
                "Token inválido."
            );

            ws.close(
                1008,
                "Unauthorized"
            );

            return;

        }


        console.log(
            "Token válido!"
        );


        const sessionId =
            randomUUID();


        console.log(
            "Session:",
            sessionId
        );


        /* =================================================
           DECODIFICADOR OPUS
        ================================================= */

        const opusDecoder =
            new OpusScript(

                16000,

                1,

                OpusScript.Application.AUDIO

            );


        console.log(
            "Decodificador Opus criado."
        );


        /* =================================================
           VARIÁVEIS VAD
        ================================================= */

        let audioFrameCounter =
            0;

        let voiceFrameCounter =
            0;

        let silenceFrameCounter =
            0;

        let speechDetected =
            false;

        let speechBuffer =
            [];

        let speechBytes =
            0;

        let processingSpeech =
            false;


        /* =================================================
           INÍCIO DA FALA
        ================================================= */

        function startSpeech() {

            if (
                speechDetected
            ) {

                return;

            }


            speechDetected =
                true;


            silenceFrameCounter =
                0;


            speechBuffer =
                [];


            speechBytes =
                0;


            console.log("");

            console.log(
                "================================="
            );

            console.log(
                "🎤 VOZ DETECTADA"
            );

            console.log(
                "================================="
            );

        }


        /* =================================================
           FIM DA FALA
        ================================================= */

        async function finishSpeech() {

            if (
                !speechDetected
            ) {

                return;

            }


            speechDetected =
                false;


            console.log("");

            console.log(
                "================================="
            );

            console.log(
                "🔇 FIM DA FALA"
            );

            console.log(
                "Frames de áudio:",
                speechBuffer.length
            );

            console.log(
                "PCM acumulado:",
                speechBytes,
                "bytes"
            );

            console.log(

                "Duração aproximada:",

                (

                    speechBuffer.length *
                    60 /
                    1000

                ).toFixed(2),

                "segundos"

            );

            console.log(
                "================================="
            );


            const audioToTranscribe =
                [
                    ...speechBuffer
                ];


            speechBuffer =
                [];


            speechBytes =
                0;


            silenceFrameCounter =
                0;


            voiceFrameCounter =
                0;


            if (
                processingSpeech
            ) {

                console.log(
                    "STT/Gemini anterior ainda está processando."
                );

                return;

            }


            processingSpeech =
                true;


            try {

                /* =========================================
                   STT
                ========================================= */

                const text =
                    await transcribeAudio(
                        audioToTranscribe
                    );


                /* =========================================
                   GEMINI
                ========================================= */

                if (
                    text
                ) {

                    await askGemini(
                        text
                    );

                }


            } finally {

                processingSpeech =
                    false;

            }

        }


        /* =================================================
           MENSAGENS WEBSOCKET
        ================================================= */

        ws.on(
            "message",
            async (
                data,
                isBinary
            ) => {


                /* =========================================
                   ÁUDIO OPUS
                ========================================= */

                if (
                    isBinary
                ) {

                    audioFrameCounter++;


                    try {

                        const pcm =
                            opusDecoder.decode(
                                data
                            );


                        let sumSquares =
                            0;

                        let peak =
                            0;


                        const samples =
                            pcm.length / 2;


                        for (
                            let i = 0;
                            i < pcm.length;
                            i += 2
                        ) {

                            const sample =
                                pcm.readInt16LE(
                                    i
                                );


                            const absolute =
                                Math.abs(
                                    sample
                                );


                            if (
                                absolute >
                                peak
                            ) {

                                peak =
                                    absolute;

                            }


                            sumSquares +=
                                sample *
                                sample;

                        }


                        const rms =
                            Math.sqrt(

                                sumSquares /
                                samples

                            );


                        /* =================================
                           DETECÇÃO DE VOZ
                        ================================= */

                        if (
                            rms >=
                            VOICE_THRESHOLD
                        ) {

                            voiceFrameCounter++;

                            silenceFrameCounter =
                                0;


                            if (

                                !speechDetected &&

                                voiceFrameCounter >=
                                VOICE_FRAMES_TO_START

                            ) {

                                startSpeech();

                            }


                        } else {

                            voiceFrameCounter =
                                0;


                            if (
                                speechDetected
                            ) {

                                silenceFrameCounter++;

                            }

                        }


                        /* =================================
                           ACUMULAR ÁUDIO
                        ================================= */

                        if (
                            speechDetected
                        ) {

                            speechBuffer.push(
                                pcm
                            );

                            speechBytes +=
                                pcm.length;

                        }


                        /* =================================
                           DETECTAR FIM DA FALA
                        ================================= */

                        if (

                            speechDetected &&

                            silenceFrameCounter >=
                            SILENCE_FRAMES_TO_END

                        ) {

                            await finishSpeech();

                        }


                        /* =================================
                           LOG
                        ================================= */

                        if (

                            audioFrameCounter %
                            10 ===
                            0

                        ) {

                            console.log(

                                "ÁUDIO | frame:",
                                audioFrameCounter,

                                "| RMS:",
                                rms.toFixed(0),

                                "| Pico:",
                                peak,

                                "| estado:",

                                speechDetected
                                    ? "FALANDO"
                                    : "silêncio"

                            );

                        }


                    } catch (error) {

                        console.error(

                            "Erro ao processar áudio:",

                            error.message

                        );

                    }


                    return;

                }


                /* =========================================
                   JSON
                ========================================= */

                try {

                    const message =
                        JSON.parse(
                            data.toString()
                        );


                    console.log(

                        "JSON recebido:",

                        JSON.stringify(
                            message
                        )

                    );


                    /* =====================================
                       HELLO
                    ===================================== */

                    if (
                        message.type ===
                        "hello"
                    ) {

                        console.log(
                            "Hello recebido do Xiaozhi"
                        );


                        ws.send(

                            JSON.stringify({

                                type:
                                    "hello",

                                transport:
                                    "websocket",

                                session_id:
                                    sessionId,

                                audio_params: {

                                    format:
                                        "opus",

                                    sample_rate:
                                        16000,

                                    channels:
                                        1,

                                    frame_duration:
                                        60

                                }

                            })

                        );


                        console.log(
                            "Hello enviado."
                        );


                        return;

                    }


                    /* =====================================
                       LISTEN
                    ===================================== */

                    if (
                        message.type ===
                        "listen"
                    ) {

                        console.log(

                            "Listen:",

                            message.state,

                            message.mode ||
                                ""

                        );


                        return;

                    }


                    /* =====================================
                       ABORT
                    ===================================== */

                    if (
                        message.type ===
                        "abort"
                    ) {

                        console.log(

                            "Abort:",

                            message.reason ||
                                ""

                        );


                        return;

                    }


                    /* =====================================
                       MCP
                    ===================================== */

                    if (
                        message.type ===
                        "mcp"
                    ) {

                        console.log(
                            "MCP recebido."
                        );


                        return;

                    }


                } catch (error) {

                    console.error(

                        "Erro ao processar JSON:",

                        error

                    );

                }

            }
        );


        /* =================================================
           CLIENTE DESCONECTADO
        ================================================= */

        ws.on(
            "close",
            () => {

                console.log(

                    "Cliente desconectado:",

                    sessionId

                );


                try {

                    opusDecoder.delete();

                } catch (error) {

                    console.error(

                        "Erro ao liberar decoder:",

                        error.message

                    );

                }

            }
        );


        /* =================================================
           ERRO WEBSOCKET
        ================================================= */

        ws.on(
            "error",
            (error) => {

                console.error(

                    "Erro WebSocket:",

                    error

                );

            }
        );

    }
);


/* =========================================================
   INICIAR SERVIDOR
========================================================= */

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(

            `Servidor rodando na porta ${PORT}`

        );

        console.log(
            "HTTP: OK"
        );

        console.log(
            "WebSocket: OK"
        );

        console.log(
            "OTA: OK"
        );

        console.log(
            "STT: OK"
        );

        console.log(
            "Gemini: OK"
        );

    }
);
