import { GoogleGenAI, Type } from "@google/genai";
import { BookConfig } from "../types";

const sanitizeContext = (data: string): string => {
  const MAX_CONTEXT_CHARS = 20000; 
  if (data.length > MAX_CONTEXT_CHARS) {
    return data.substring(0, MAX_CONTEXT_CHARS) + "... [Kontekst trunkert for stabilitet]";
  }
  return data;
};

export const generateBookStructure = async (config: BookConfig, contextData: string = ""): Promise<{ foreword: string, chapters: { title: string }[], afterword: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const sanitizedContext = sanitizeContext(contextData);
  
  // Profesjonell kapittel-logikk for pocket-thriller (250-300 sider)
  let chapterCount = "6-10";
  if (config.length === 'long') chapterCount = "12-15";
  if (config.length === 'pocket') chapterCount = "24-30"; // Hyppigere vendinger for thrillere

  const prompt = `
    ROLLE: Verdenskjent profesjonell forfatter og litterær redaktør.
    OPPGAVE: Lag en profesjonell, bestselgende bokstruktur for et verk med tittelen: ${config.title}.
    
    LITTERÆR SPESIFIKASJON:
    - Format: ${config.length === 'pocket' ? 'Pocket-thriller (250-300 sider)' : 'Standard utgivelse'}.
    - Omfang: ${chapterCount} kapitler.
    
    Boktype: ${config.bookType}
    Tema: ${config.theme}
    Stil: ${config.style}
    Bakgrunnsmateriale: ${sanitizedContext}

    DESIGN-REGLER:
    For en pocket-thriller må hver kapitteltittel være engasjerende og drive handlingen fremover. Strukturen skal følge en klassisk spenningskurve med økende intensitet.
    
    Generer JSON med et profesjonelt forord, ${chapterCount} kapitteltitler, og et etterord.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 4000 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            foreword: { type: Type.STRING },
            chapters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING }
                },
                required: ["title"]
              }
            },
            afterword: { type: Type.STRING }
          },
          required: ["foreword", "chapters", "afterword"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Feil ved generering av manuskript-struktur.");
    return JSON.parse(text);
  } catch (error) {
    console.error("Strukturgenerering feilet:", error);
    throw error;
  }
};

export const generateChapterContent = async (
  config: BookConfig, 
  chapterTitle: string, 
  previousSummary: string,
  contextData: string = ""
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const chapterContext = sanitizeContext(contextData).slice(0, 7000);

  const prompt = `
    ROLLE: Profesjonell bestselgerforfatter.
    OPPGAVE: Skriv et dyptgående og litterært kapittel med høy kvalitet.
    
    Verk: ${config.title}
    Kapittel: "${chapterTitle}"
    Stil: ${config.style}
    
    PRODUKSJONSKRAV:
    - Ved 'pocket-thriller' format må teksten være detaljert, fokusere på atmosfære, indre monolog og spenningsdrivende dialog.
    - Unngå oppsummeringer. Vis handlingen gjennom beskrivelser (Show, don't tell).
    - Målet er å produsere nok tekst til å matche et sidetall på 250-300 sider totalt for boken.
    - Bruk et rikt, profesjonelt norsk språk.
    
    Kontekst: ${previousSummary.slice(-1000)}
    Kildemateriale: ${chapterContext}

    Skriv i Markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });

    return response.text || "Feil under tekstproduksjon.";
  } catch (error: any) {
    console.error(`Kapittel "${chapterTitle}" feilet:`, error);
    throw error;
  }
};

export const generateInternalImagePrompt = async (chapterContent: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const prompt = `
    Som profesjonell bokillustratør, lag en bilde-prompt for en kunstnerisk illustrasjon basert på dette kapittelet.
    Innhold: ${chapterContent.substring(0, 2000)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt
    });
    return response.text || "Cinematic professional book illustration.";
  } catch (error) {
    console.error("Bilde-prompt feilet:", error);
    return "Atmospheric thriller art.";
  }
};

export const generateBookImage = async (prompt: string, aspectRatio: "3:4" | "1:1" | "16:9" = "3:4"): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `Professional literary book cover art, ${prompt}. Award-winning design, cinematic lighting, no text.` }]
      },
      config: { 
        imageConfig: { aspectRatio } 
      }
    });

    if (!response.candidates?.[0]?.content?.parts) throw new Error("Kunne ikke generere bilde.");

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Bilde-data mangler.");
  } catch (error) {
    console.error("Bildegenerering feilet:", error);
    throw error;
  }
};