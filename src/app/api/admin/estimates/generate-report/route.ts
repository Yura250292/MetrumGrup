import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Route config
export const maxDuration = 60; // 1 хвилина для генерації звіту
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    console.log('📊 Generating engineering report...');

    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview-preview",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4000,
      },
    });

    const result = await model.generateContent(prompt);
    const report = result.response.text();

    console.log('✅ Engineering report generated successfully');

    return NextResponse.json({
      report,
      generatedAt: new Date().toISOString(),
    });

  } catch (error: unknown) {
    console.error("Report generation error:", error);
    const message = error instanceof Error ? error.message : "Невідома помилка";
    return NextResponse.json(
      { error: `Помилка генерації звіту: ${message}` },
      { status: 500 }
    );
  }
}
