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
   PÁGINA PRINCIPAL
   ========================================================= */

app.get("/", (req, res) => {
    res.send("Xiaozhi Gemini Server funcionando!");
});


/* =========================================================
   GEMINI
   ========================================================= */

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

            return res
                .status(response.status)
                .json(data);

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


/* =========================================================
   OTA
   ========================================================= */

app.get("/xiaozhi/ota/", (req, res) => {

    res.json({

        message:
            "Xiaozhi OTA funcionando!",

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


/* =========================================================
   SERVIDOR HTTP
   ========================================================= */

const server =
    http.createServer(app);


/* =========================================================
   WEBSOCKET
   ========================================================= */

const wss =
    new WebSocketServer({
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


    /* =====================================================
       VERIFICA TOKEN
       ===================================================== */

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


    /* =====================================================
       CRIA SESSÃO
       ===================================================== */

    const sessionId =
        randomUUID();


    console.log(
        "Session:",
        sessionId
    );


    /* =====================================================
       DECODIFICADOR OPUS
       
       16000 Hz
       Mono
       ===================================================== */

    const opusDecoder =
        new OpusScript(
            16000,
            1,
            OpusScript.Application.AUDIO
        );


    console.log(
        "Decodificador Opus criado."
    );


    /* =====================================================
       RECEBE MENSAGENS
       ===================================================== */

    ws.on(
        "message",
        async (data, isBinary) => {


            /* =============================================
               ÁUDIO OPUS
               ============================================= */

            if (isBinary) {

                console.log(
                    "Áudio recebido:",
                    data.length,
                    "bytes"
                );


                try {

                    const pcm =
                        opusDecoder.decode(data);


                    console.log(
                        "PCM decodificado:",
                        pcm.length,
                        "bytes"
                    );


                } catch (error) {

                    console.error(
                        "Erro ao decodificar Opus:",
                        error.message
                    );

                }


                return;

            }


            /* =============================================
               JSON
               ============================================= */

            try {

                const message =
                    JSON.parse(
                        data.toString()
                    );


                console.log(
                    "JSON recebido:",
                    JSON.stringify(message)
                );


                /* =========================================
                   HELLO
                   ========================================= */

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


                /* =========================================
                   LISTEN
                   ========================================= */

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


                /* =========================================
                   ABORT
                   ========================================= */

                if (
                    message.type === "abort"
                ) {

                    console.log(
                        "Abort:",
                        message.reason || ""
                    );


                    return;

                }


                /* =========================================
                   MCP
                   ========================================= */

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

        }
    );


    /* =====================================================
       DESCONECTOU
       ===================================================== */

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


    /* =====================================================
       ERRO WEBSOCKET
       ===================================================== */

    ws.on(
        "error",
        (error) => {

            console.error(
                "Erro WebSocket:",
                error
            );

        }
    );

});


/* =========================================================
   INICIA SERVIDOR
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

    }
);
