       import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { randomUUID } from "node:crypto";

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

const XIAOZHI_TOKEN =
    process.env.XIAOZHI_TOKEN || "xiaozhi-render-test-token";

const WEBSOCKET_URL =
    "wss://xiaozhi-gemini-server.onrender.com/xiaozhi/v1/";

app.get("/", (req, res) => {
    res.send("Xiaozhi Gemini Server funcionando!");
});


// ======================================================
// GEMINI
// ======================================================

app.post("/chat", async (req, res) => {
    try {
        const message = req.body.message;

        if (!message) {
            return res.status(400).json({
                error: "Mensagem não informada"
            });
        }

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": process.env.GEMINI_API_KEY
                },

                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: message
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

        const data = await response.json();

        if (!response.ok) {
            console.error(
                "Erro Gemini:",
                JSON.stringify(data)
            );

            return res.status(response.status).json(data);
        }

        const text =
            data.candidates?.[0]?.content?.parts?.[0]?.text ||
            "Não consegui gerar uma resposta.";

        res.json({
            response: text
        });

    } catch (error) {
        console.error(
            "Erro no servidor:",
            error
        );

        res.status(500).json({
            error: error.message
        });
    }
});


// ======================================================
// OTA
// ======================================================

app.get("/xiaozhi/ota/", (req, res) => {

    res.json({
        message: "Xiaozhi OTA funcionando!",

        websocket: {
            url: WEBSOCKET_URL
        }
    });
});


app.post("/xiaozhi/ota/", (req, res) => {

    console.log("=================================");
    console.log("OTA REQUEST RECEBIDO");

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

    console.log("=================================");

    const deviceVersion =
        req.body?.application?.version ||
        "0.0.0";

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


// ======================================================
// WEBSOCKET
// ======================================================

const server = http.createServer(app);

const wss = new WebSocketServer({
    server
});


wss.on("connection", (ws, req) => {

    const clientIp =
        req.socket.remoteAddress;

    const requestUrl =
        req.url || "/";


    console.log("=================================");
    console.log("NOVO CLIENTE WEBSOCKET");

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

    console.log("=================================");


    // ==================================================
    // TOKEN
    // ==================================================

    const authorization =
        req.headers["authorization"] || "";

    const expected =
        `Bearer ${XIAOZHI_TOKEN}`;


    if (authorization !== expected) {

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


    // ==================================================
    // SESSÃO
    // ==================================================

    const sessionId =
        randomUUID();


    console.log(
        "Session:",
        sessionId
    );


    // ==================================================
    // BUFFER DE ÁUDIO
    // ==================================================

    let audioChunks = [];

    let audioBytes = 0;

    let lastAudioTime = 0;

    let silenceTimer = null;


    // ==================================================
    // FINALIZAR FALA
    // ==================================================

    function finishSpeech() {

        if (audioChunks.length === 0) {
            return;
        }


        const totalFrames =
            audioChunks.length;


        const totalBytes =
            audioBytes;


        console.log("");
        console.log(
            "================================="
        );

        console.log(
            "FALA FINALIZADA"
        );

        console.log(
            "Frames:",
            totalFrames
        );

        console.log(
            "Bytes totais:",
            totalBytes
        );

        console.log(
            "================================="
        );

        console.log("");


        // Por enquanto não enviamos para STT.
        // Apenas limpamos o buffer.

        audioChunks = [];

        audioBytes = 0;

        lastAudioTime = 0;

        silenceTimer = null;
    }


    // ==================================================
    // MENSAGENS
    // ==================================================

    ws.on("message", async (data, isBinary) => {


        // ==============================================
        // ÁUDIO OPUS
        // ==============================================

        if (isBinary) {

            const chunk =
                Buffer.from(data);


            audioChunks.push(chunk);

            audioBytes +=
                chunk.length;


            lastAudioTime =
                Date.now();


            console.log(
                "Áudio recebido:",
                chunk.length,
                "bytes"
            );


            // Cancela timer anterior

            if (silenceTimer) {

                clearTimeout(
                    silenceTimer
                );
            }


            // Consideramos que a fala terminou
            // após 800 ms sem novos frames.

            silenceTimer =
                setTimeout(() => {

                    finishSpeech();

                }, 800);


            return;
        }


        // ==============================================
        // JSON
        // ==============================================

        try {

            const message =
                JSON.parse(
                    data.toString()
                );


            console.log(
                "JSON recebido:",
                JSON.stringify(message)
            );


            // ==========================================
            // HELLO
            // ==========================================

            if (
                message.type === "hello"
            ) {

                console.log(
                    "Hello recebido do Xiaozhi"
                );


                ws.send(
                    JSON.stringify({

                        type: "hello",

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


            // ==========================================
            // LISTEN
            // ==========================================

            if (
                message.type === "listen"
            ) {

                console.log(
                    "Listen:",
                    message.state,
                    message.mode || ""
                );


                return;
            }


            // ==========================================
            // ABORT
            // ==========================================

            if (
                message.type === "abort"
            ) {

                console.log(
                    "Abort:",
                    message.reason || ""
                );


                // Limpa áudio acumulado

                audioChunks = [];

                audioBytes = 0;


                if (silenceTimer) {

                    clearTimeout(
                        silenceTimer
                    );

                    silenceTimer = null;
                }


                return;
            }


            // ==========================================
            // MCP
            // ==========================================

            if (
                message.type === "mcp"
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
    });


    // ==================================================
    // CLOSE
    // ==================================================

    ws.on("close", () => {

        console.log(
            "Cliente desconectado:",
            sessionId
        );


        if (silenceTimer) {

            clearTimeout(
                silenceTimer
            );
        }
    });


    // ==================================================
    // ERROR
    // ==================================================

    ws.on("error", (error) => {

        console.error(
            "Erro WebSocket:",
            error
        );
    });

});


// ======================================================
// START SERVER
// ======================================================

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
    }
);
