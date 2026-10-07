import express from "express";

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

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

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
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

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
