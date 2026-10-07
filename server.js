import express from "express";
import { GoogleGenAI } from "@google/genai";

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

app.get("/", (req, res) => {
    res.send("Xiaozhi Gemini Server funcionando!");
});

app.post("/chat", async (req, res) => {
    try {
        const message = req.body.message;

        if (!message) {
            return res.status(400).json({
                error: "Mensagem não informada"
            });
        }

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: message,
            config: {
                systemInstruction:
                    "Você é o Xiaozhi, um pequeno robô inteligente, divertido e amigável. Responda em português do Brasil de forma natural e curta."
            }
        });

        res.json({
            response: response.text
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Erro ao consultar Gemini",
            details: error.message
        });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log('Servidor rodando na porta ${PORT}');
});
