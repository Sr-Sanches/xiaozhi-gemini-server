import express from "express";
import { WebSocketServer } from "ws";
import http from "http";

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

// ===============================
// HTTP
// ===============================

app.get("/", (req, res) => {
    res.send("Xiaozhi Gemini Server funcionando!");
});

// ===============================
// TESTE GEMINI
// ===============================

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
                                text: "Você é o Xiaozhi, um pequeno robô inteligente, divertido e amigável. Responda em português do Brasil de forma natural e curta."
                            }
                        ]
                    }
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Erro Gemini:", JSON.stringify(data));

            return res.status(response.status).json(data);
        }

        const text =
            data.candidates?.[0]?.content?.parts?.[0]?.text ||
            "Não consegui gerar uma resposta.";

        res.json({
            response: text
        });

    } catch (error) {
        console.error("Erro no servidor:", error);

        res.status(500).json({
            error: error.message
        });
    }
});

// ===============================
// SERVIDOR HTTP
// ===============================

const server = http.createServer(app);

// ===============================
// WEBSOCKET
// ===============================

const wss = new WebSocketServer({
    server
});

wss.on("connection", (ws, req) => {

    console.log("=================================");
    console.log("Novo cliente WebSocket conectado");
    console.log("IP:", req.socket.remoteAddress);
    console.log("=================================");

    let sessionId = crypto.randomUUID();

    ws.on("message", async (data, isBinary) => {

        // ===========================
        // MENSAGEM BINÁRIA
        // ===========================

        if (isBinary) {

            console.log(
                "Áudio recebido:",
                data.length,
                "bytes"
            );

            // Por enquanto não vamos processar o áudio.
            // Depois vamos ligar o STT aqui.

            return;
        }

        // ===========================
        // MENSAGEM JSON
        // ===========================

        try {

            const message = JSON.parse(data.toString());

            console.log(
                "JSON recebido:",
                JSON.stringify(message)
            );

            // ===========================
            // HELLO
            // ===========================

            if (message.type === "hello") {

                console.log("Hello recebido do Xiaozhi");

                ws.send(
                    JSON.stringify({
                        type: "hello",
                        transport: "websocket",
                        session_id: sessionId,
                        audio_params: {
                            format: "opus",
                            sample_rate: 16000,
                            channels: 1,
                            frame_duration: 60
                        }
                    })
                );

                console.log(
                    "Hello enviado. Session:",
                    sessionId
                );

                return;
            }

            // ===========================
            // LISTEN
            // ===========================

            if (message.type === "listen") {

                console.log(
                    "Listen:",
                    message.state,
                    message.mode || ""
                );

                return;
            }

            // ===========================
            // ABORT
            // ===========================

            if (message.type === "abort") {

                console.log(
                    "Abort recebido:",
                    message.reason || ""
                );

                return;
            }

        } catch (error) {

            console.error(
                "Erro ao processar WebSocket:",
                error
            );

        }

    });

    ws.on("close", () => {

        console.log(
            "Cliente WebSocket desconectado:",
            sessionId
        );

    });

    ws.on("error", (error) => {

        console.error(
            "Erro WebSocket:",
            error
        );

    });

});

// ===============================
// INICIAR SERVIDOR
// ===============================

server.listen(PORT, "0.0.0.0", () => {

    console.log(
        `Servidor rodando na porta ${PORT}`
    );

    console.log(
        "WebSocket disponível no mesmo endereço"
    );

});
