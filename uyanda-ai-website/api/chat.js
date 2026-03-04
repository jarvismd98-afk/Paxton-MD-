const OpenAI = require('openai');

module.exports = async (req, res) => {
    // CORS headers (so frontend can call it)
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message required' });
    }

    try {
        const openrouter = new OpenAI({
            apiKey: process.env.OPENROUTER_API_KEY,  // ← pulled from Vercel env
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
                'HTTP-Referer': 'https://uyanda-ai-website.vercel.app', // update later
                'X-Title': 'Uyanda AI',
            }
        });

        const completion = await openrouter.chat.completions.create({
            model: 'nvidia/nemotron-nano-9b-v2:free',
            messages: [
                { role: 'system', content: 'You are Uyanda, a sweet and friendly AI assistant. Answer with warmth and girly charm.' },
                { role: 'user', content: message }
            ],
            temperature: 0.7,
            max_tokens: 300,
        });

        res.json({ reply: completion.choices[0].message.content });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Uyanda is thinking... try again 💕' });
    }
};
