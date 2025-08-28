import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const { periodLabel, kpis } = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY saknas i .env.local" }, { status: 500 });
    }
    if (!kpis || !periodLabel) {
      return NextResponse.json({ error: "periodLabel och kpis krävs" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });

    const prompt = `
### Månadsrapport för perioden ${periodLabel}

**Viktigaste insikterna:**
- Totalt antal sessioner: ${kpis.sessions}
- Antal unika användare: ${kpis.users}
- Genomsnittlig sessionstid: ${Math.round(kpis.averageSessionDuration || 0)} sek
- Antal konverteringar: ${kpis.conversions}

**Kommentar om möjliga orsaker och 3 rekommenderade åtgärder.**
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: "Skriv affärsnära och konkret, utan fluff." },
        { role: "user", content: prompt },
      ],
    });

    const summary = completion.choices?.[0]?.message?.content?.trim() || "";
    return NextResponse.json({ summary });
  } catch (e: any) {
    console.error("AI route error:", e);
    return NextResponse.json({ error: e?.message || "AI-fel" }, { status: 500 });
  }
}
