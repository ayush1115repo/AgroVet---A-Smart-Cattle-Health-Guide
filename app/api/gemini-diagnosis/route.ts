import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
// Note: This relies on GEMINI_API_KEY being present in .env.local
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: NextRequest) {
    try {
        // Check for API Key
        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json(
                { error: 'Gemini API Key is missing on the server.' },
                { status: 500 }
            );
        }

        const body = await req.json();
        const { symptoms, image, animal_details, local_prediction } = body;

        const animalType = animal_details?.breed || animal_details?.type || 'animal';
        const age = animal_details?.age || 'unknown age';

        // Configure Model (Updated to Gemini 2.5 Flash for 2026 standards)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        let result;

        if (image) {
            // IMAGE DIAGNOSIS FLOW
            // Image is expected to be a base64 data URL: "data:image/jpeg;base64,..."
            const base64Data = image.split(',')[1];
            const mimeType = image.split(',')[0].split(':')[1].split(';')[0];

            let prompt = `
         Act as an expert veterinarian. Analyze this image of a ${animalType} (Age: ${age}).
         Identify any visible skin conditions, wounds, or health issues.
       `;

            if (local_prediction) {
                prompt += `\n\nPreliminary local scan suggested: "${local_prediction.disease}" with ${Math.round(local_prediction.confidence * 100)}% confidence. Verify this.`;
            }

            prompt += `
         
         Provide the diagnosis in this STRICT JSON format:
         {
           "disease": "Name of the disease/condition",
           "confidence": 90,
           "severity": "High" | "Medium" | "Low",
           "causes": ["Cause 1", "Cause 2"],
           "treatment": ["Treatment step 1", "Treatment step 2"],
           "prevention": ["Prevention tip 1", "Prevention tip 2"]
         }
         Confidence should be 0-100. Severity must be High/Medium/Low.
       `;

            const imagePart = {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            };

            result = await model.generateContent([prompt, imagePart]);

        } else {
            // SYMPTOM DIAGNOSIS FLOW
            if (!symptoms || !Array.isArray(symptoms) || symptoms.length === 0) {
                return NextResponse.json({ error: 'No symptoms provided.' }, { status: 400 });
            }

            const prompt = `
         Act as an expert veterinarian. I have a ${animalType} (Age: ${age}) exhibiting these symptoms: ${symptoms.join(', ')}.
         
         Diagnose the most likely condition.
         Response STRICT JSON format:
         {
           "disease": "Name of the disease",
           "confidence": 85,
           "severity": "High" | "Medium" | "Low",
           "causes": ["Cause 1", "Cause 2"],
           "treatment": ["Treatment step 1", "Treatment step 2"],
           "prevention": ["Prevention tip 1", "Prevention tip 2"]
         }
       `;

            result = await model.generateContent(prompt);
        }

        const response = await result.response;
        const text = response.text();

        // Clean up the response
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            const diagnosisData = JSON.parse(cleanText);
            return NextResponse.json(diagnosisData);
        } catch (e) {
            console.error('Failed to parse Gemini response:', text);
            return NextResponse.json(
                { error: 'Failed to interpret AI diagnosis result.' },
                { status: 500 }
            );
        }

    } catch (error: any) {
        console.error('Gemini Diagnosis Error:', error);

        // Extract meaningful error message
        let errorMessage = 'Failed to process diagnosis.';
        if (error.message) {
            if (error.message.includes('User location is not supported')) {
                errorMessage = 'Google Gemini API is not available in your location. Using local fallback.';
            } else {
                errorMessage = error.message;
            }
        }

        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
