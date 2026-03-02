import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Service for syncing dispute data between on-chain contracts and database
 */
export class DisputeSyncService {
  /**
   * Sync dispute status from on-chain to database
   * This should be called by a webhook or polling service
   */
  async syncDisputeFromChain(onChainDisputeId: string, onChainData: {
    status: string;
    winningParty?: "CLIENT" | "FREELANCER";
    resolvedAt?: Date;
  }) {
    const dispute = await prisma.dispute.findUnique({
      where: { onChainDisputeId },
      include: { job: true },
    });

    if (!dispute) {
      console.error(`Dispute with on-chain ID ${onChainDisputeId} not found in database`);
      return null;
    }

    // Map on-chain status to database status
    const status = this.mapOnChainStatus(onChainData.status);

    // Update dispute
    const updated = await prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status,
        winningParty: onChainData.winningParty,
        resolvedAt: onChainData.resolvedAt || (status === "RESOLVED" ? new Date() : undefined),
      },
    });

    // Update job status if dispute is resolved
    if (status === "RESOLVED" && onChainData.winningParty) {
      const newJobStatus = onChainData.winningParty === "FREELANCER" ? "COMPLETED" : "CANCELLED";
      await prisma.job.update({
        where: { id: dispute.jobId },
        data: { status: newJobStatus },
      });
    }

    return updated;
  }

  /**
   * Create or update dispute with on-chain ID
   */
  async linkDisputeToChain(disputeId: string, onChainDisputeId: string) {
    return await prisma.dispute.update({
      where: { id: disputeId },
      data: { onChainDisputeId },
    });
  }

  /**
   * Poll on-chain contract for dispute updates
   * This is a placeholder - implement actual contract interaction
   */
  async pollDisputeUpdates() {
    // Get all disputes that have on-chain IDs but are not resolved
    const activeDisputes = await prisma.dispute.findMany({
      where: {
        onChainDisputeId: { not: null },
        status: { in: ["OPEN", "VOTING", "APPEALED"] },
      },
    });

    // For each dispute, check on-chain status
    for (const dispute of activeDisputes) {
      try {
        // TODO: Implement actual contract call
        // const onChainStatus = await contractService.getDisputeStatus(dispute.onChainDisputeId);
        // await this.syncDisputeFromChain(dispute.onChainDisputeId!, onChainStatus);
        
        console.log(`Checking dispute ${dispute.id} with on-chain ID ${dispute.onChainDisputeId}`);
      } catch (error) {
        console.error(`Error polling dispute ${dispute.id}:`, error);
      }
    }
  }

  /**
   * Map on-chain status string to database enum
   */
  private mapOnChainStatus(onChainStatus: string): "OPEN" | "VOTING" | "RESOLVED" | "APPEALED" {
    const statusMap: Record<string, "OPEN" | "VOTING" | "RESOLVED" | "APPEALED"> = {
      "open": "OPEN",
      "voting": "VOTING",
      "resolved": "RESOLVED",
      "appealed": "APPEALED",
      // Add more mappings as needed
    };

    return statusMap[onChainStatus.toLowerCase()] || "OPEN";
  }

  /**
   * Get dispute statistics
   */
  async getDisputeStats() {
    const [total, open, voting, resolved, appealed] = await Promise.all([
      prisma.dispute.count(),
      prisma.dispute.count({ where: { status: "OPEN" } }),
      prisma.dispute.count({ where: { status: "VOTING" } }),
      prisma.dispute.count({ where: { status: "RESOLVED" } }),
      prisma.dispute.count({ where: { status: "APPEALED" } }),
    ]);

    return {
      total,
      byStatus: {
        open,
        voting,
        resolved,
        appealed,
      },
    };
  }
}

export const disputeSyncService = new DisputeSyncService();
