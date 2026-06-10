import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '@trail/config';

const TONE_GUIDE = {
  friendly: 'warm and encouraging',
  luxury: 'sophisticated and elevated',
  playful: 'fun and enthusiastic',
};

const SYSTEM_PROMPT = `You are a fashion stylist AI.
Only compliment the clothing, outfit, and styling choices.
Never mention body shape, weight, skin tone, attractiveness, race, or age.
Keep the compliment under 20 words.
Return ONLY valid JSON. No markdown. No explanation.`;

export async function generateCompliment(params: {
  tone: 'friendly' | 'luxury' | 'playful';
}): Promise<{ compliment: string; score: number }> {
  const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `${SYSTEM_PROMPT}

Tone: ${TONE_GUIDE[params.tone]}
Return exactly: {"compliment": "...", "score": 8.5}
Score range: 6.0 to 9.9`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 80,
      },
    });

    const text = result.response.text().trim();
    // Basic JSON extraction in case of markdown wrapping
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : text;
    const parsed = JSON.parse(jsonText);

    return {
      compliment: String(parsed.compliment),
      score: Math.min(9.9, Math.max(6.0, Number(parsed.score))),
    };
  } catch (error) {
    console.error('Gemini error:', error);
    // Fallback — never crash a job over a compliment
    const randomIndex = Math.floor(Math.random() * FALLBACK_COMPLIMENTS.length);
    const randomCompliment = FALLBACK_COMPLIMENTS[randomIndex];
    
    let randomScore: number;
    const rand = Math.random();
    if (rand < 0.7) {
      // 70% -> 8.0 to 9.1
      randomScore = Number((8.0 + Math.random() * 1.1).toFixed(1));
    } else if (rand < 0.9) {
      // 20% -> 7.5 to 7.9
      randomScore = Number((7.5 + Math.random() * 0.4).toFixed(1));
    } else {
      // 10% -> 9.2 to 9.8
      randomScore = Number((9.2 + Math.random() * 0.6).toFixed(1));
    }

    return { compliment: randomCompliment, score: randomScore };
  }
}

const FALLBACK_COMPLIMENTS: string[] = [
  '✨ The styling of this piece is absolutely effortless.',
  '🌸 The colors in this outfit harmonize beautifully together.',
  '✨ A polished look that is both modern and classic.',
  '🌸 This pairing creates a really sophisticated profile.',
  '✨ Beautifully coordinated textures make this outfit pop.',
  '🌸 The choice of patterns here shows excellent styling intuition.',
  '✨ This style choice feels both fresh and timeless.',
  '🌸 An elegant ensemble with an incredibly cohesive look.',
  '✨ The layering on this outfit is done with great care.',
  '🌸 A chic and thoughtfully put-together outfit choice.',
  '✨ The flow of this fabric is incredibly graceful.',
  '🌸 A crisp, smart look that feels perfectly styled.',
  '✨ Wonderful choice of colors that really complement each other.',
  '🌸 The pattern coordination here is absolutely spot on.',
  '✨ A subtle yet highly elevated style statement.',
  '🌸 This styling feels wonderfully comfortable and chic.',
  '✨ Classic tailoring details make this look stand out.',
  '🌸 A beautiful balance of simplicity and sophistication.',
  '✨ The structure of this outfit is wonderfully designed.',
  '🌸 This ensemble has an incredibly polished presence.',
  '✨ Soft tones paired with a clean cut make this look lovely.',
  '🌸 An exceptionally styled outfit with great attention to detail.',
  '✨ The combination of these pieces feels so modern.',
  '🌸 Elegant layering creates a very stylish depth here.',
  '✨ The fabric choices look so premium and cozy.',
  '🌸 A refined styling choice that is effortlessly graceful.',
  '✨ This look combines style and ease in the best way.',
  '🌸 The clean lines of this garment are beautiful.',
  '✨ An incredibly cohesive look with a delightful aesthetic.',
  '🌸 Stylish color blocking that feels very on-trend.',
  '✨ The drape of this outfit creates a lovely, flowing silhouette.',
  '🌸 A tasteful pairing that is perfect for any occasion.',
  '✨ The monochrome palette of this outfit is stunning.',
  '🌸 High-quality fabrics and excellent coordination define this look.',
  '✨ That color combination is wonderfully creative and chic.',
  '🌸 Effortlessly styled for a polished, day-to-night look.',
  '✨ A vibrant and cheerful styling choice.',
  '🌸 This look is a perfect example of smart-casual elegance.',
  '✨ The textures in this outfit complement each other perfectly.',
  '🌸 Beautifully balanced layers make this look so chic.',
  '✨ A clean, contemporary style that looks wonderfully put-together.',
  '🌸 This colorway is exceptionally stylish and modern.',
  '✨ An elegant, flowing style that feels so natural.',
  '🌸 A classic look with a beautiful contemporary twist.',
  '✨ The minimal design details of this outfit are outstanding.',
  '🌸 Perfect coordination of accessory lines and outfit cuts.',
  '✨ This piece showcases a wonderful sense of fashion design.',
  '🌸 Highly sophisticated styling with a clean finish.',
  '✨ A cheerful and bright style combination.',
  '🌸 The subtle details in this outfit are absolutely brilliant.',
  '✨ That outfit choice is incredibly smart and sharp.',
  '🌸 Beautifully styled to combine both comfort and elegance.',
  '✨ A very charming style with a lovely flow.',
  '🌸 The soft draping of this piece is exceptionally elegant.',
  '✨ Bold styling choices that blend together perfectly.',
  '🌸 A look that is both cozy and impeccably polished.',
  '✨ Delightful coordination of matching tones and fabrics.',
  '🌸 This pairing is incredibly stylish and beautifully balanced.',
  '✨ A sleek and sophisticated approach to daily fashion.',
  '🌸 The design of this outfit is wonderfully modern.',
  '✨ This outfit has a truly refined and graceful aesthetic.',
  '🌸 A highly creative styling choice with amazing synergy.',
  '✨ Clean lines and soft fabrics create a stunning combination.',
  '🌸 This style has a very gentle and inviting charm.',
  '✨ Excellently proportioned layers that look very stylish.',
  '🌸 A beautiful and sophisticated color harmony.',
  '✨ The drape of this piece is absolutely lovely.',
  '🌸 The styling of this outfit is incredibly tasteful.',
  '✨ A classic and sophisticated look that never goes out of style.',
  '🌸 This design choice brings a wonderful sense of elegance.',
  '✨ A perfectly balanced outfit with a modern flair.',
  '🌸 Beautiful fabric flow that looks extremely graceful.',
  '✨ A crisp and fresh outfit combination.',
  '🌸 This look is styled with a wonderful sense of balance.',
  '✨ Rich, complementary colors make this outfit stand out.',
  '🌸 Soft layering that looks cozy yet refined.',
  '✨ That is a wonderfully curated wardrobe combination.',
  '🌸 A modern aesthetic with timeless elegance.',
  '✨ The texture pairing here is absolutely brilliant.',
  '🌸 That outfit is beautifully suited for a polished look.',
  '✨ A clean, minimalistic styling that speaks volumes.',
  '🌸 The gentle structure of this garment is beautiful.',
  '✨ This styling displays a marvelous color balance.',
  '🌸 A very stylish and contemporary outfit choice.',
  '✨ Warm tones and soft fabrics create a lovely vibe.',
  '🌸 A highly cohesive and elegant fashion statement.',
  '✨ This look has a wonderfully chic simplicity.',
  '🌸 Perfect pairing of a classic design with modern elements.',
  '✨ The subtle contrasts in this outfit are excellent.',
  '🌸 Extremely polished coordination of fabric and color.',
  '✨ An outfit that feels both highly styled and comfortable.',
  '🌸 A chic representation of modern fashion aesthetics.',
  '✨ The flowing lines of this outfit are exceptionally graceful.',
  '🌸 A delightful pairing of fabrics that work beautifully together.',
  '✨ A crisp, clean look that is styled to perfection.',
  '🌸 This look is a wonderful blend of style and practicality.',
  '✨ Sophisticated details give this outfit a premium feel.',
  '🌸 A beautifully styled look with a lovely, soft drape.',
  '✨ The color selection is exceptionally chic and pleasant.',
  '🌸 A timeless style pairing with a very polished finish.',
  '✨ The layers on this outfit create a beautiful sense of depth.',
  '🌸 Simple, elegant, and perfectly coordinated styling.',
  '✨ This outfit showcases a wonderful eye for color.',
  '🌸 A graceful style that combines comfort with class.',
  '✨ Beautifully tailored lines make this look incredibly sharp.'
];
