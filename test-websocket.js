import WebSocket from "ws";

const URL =
    "wss://xiaozhi-gemini-server.onrender.com/xiaozhi/v1/";

const TOKEN =
    "xiaozhi-render-test-token";

const ws = new WebSocket(URL, {
    headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Protocol-Version": "1",
        "Device-Id": "11:22:33:44:55:66",
        "Client-Id": "teste-xiaozhi-123"
    }
});

console.log("Conectando ao WebSocket...");

ws.on("open", () => {

    console.log("✅ WebSocket conectado!");

    const hello = {
        type: "hello",
        version: 1,

        features: {
            mcp: true
        },

        transport: "websocket",

        audio_params: {
            format: "opus",
            sample_rate: 16000,
            channels: 1,
            frame_duration: 60
        }
    };

    console.log("Enviando HELLO...");

    ws.send(
        JSON.stringify(hello)
    );
});

ws.on("message", (data) => {

    console.log(
        "📩 Resposta do servidor:"
    );

    console.log(
        data.toString()
    );

    ws.close();
});

ws.on("error", (error) => {

    console.error(
        "❌ Erro:",
        error.message
    );

});

ws.on("close", (code, reason) => {

    console.log(
        "WebSocket fechado."
    );

    console.log(
        "Código:",
        code
    );

    console.log(
        "Motivo:",
        reason.toString()
    );

});
