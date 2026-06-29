import { PrismaClient, DisputeEventType, type DisputeEvent } from "@prisma/client";
import { disputeEmitter } from "../lib/dispute-emitter";

const prisma = new PrismaClient();

export async function recordDisputeEvent(
  disputeId: string,
  type: DisputeEventType,
  payload?: Record<string, unknown>,
): Promise<DisputeEvent> {
  const event = await prisma.disputeEvent.create({
    data: {
      disputeId,
      type,
      payload: payload ?? {},
    },
  });

  disputeEmitter.emitDisputeEvent(disputeId, event);
  return event;
}
