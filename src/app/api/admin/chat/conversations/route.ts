import { NextRequest, NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import {
  createGroupConversation,
  getOrCreateDM,
  getOrCreateEstimateChannel,
  getOrCreateProjectChannel,
  listConversationsForUser,
} from "@/lib/chat/service";
import { createConversationSchema } from "@/lib/schemas/chat";

function handleError(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  if (message === "Unauthorized") return unauthorizedResponse();
  if (message === "Forbidden") return forbiddenResponse();
  console.error("[chat/conversations] error:", err);
  return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
}

export async function GET() {
  try {
    const session = await requireStaffAccess();
    const conversations = await listConversationsForUser(session.user.id);
    return NextResponse.json({ conversations });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaffAccess();
    const json = await request.json();
    const parsed = createConversationSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Невірні дані", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    let conversation;
    if (parsed.data.type === "DM") {
      conversation = await getOrCreateDM(session.user.id, parsed.data.userId);
    } else if (parsed.data.type === "PROJECT") {
      conversation = await getOrCreateProjectChannel(parsed.data.projectId, session.user.id);
    } else if (parsed.data.type === "ESTIMATE") {
      conversation = await getOrCreateEstimateChannel(parsed.data.estimateId, session.user.id);
    } else {
      conversation = await createGroupConversation(
        session.user.id,
        parsed.data.title,
        parsed.data.participantIds
      );
    }

    return NextResponse.json({ conversation });
  } catch (err) {
    return handleError(err);
  }
}
