require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        
        console.log("=== Available Models ===");
        if (data.models) {
            data.models.forEach(m => {
                if(m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
                    console.log(`- ${m.name} (Vision: ${m.description || 'Unknown'})`);
                }
            });
        } else {
            console.log("Error or no models found:", data);
        }
    } catch (e) {
        console.error("Fetch error:", e);
    }
}

listModels();
