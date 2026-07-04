// ✅ FIXED getDisputeById (no CI crash, no undefined.length)

static async getDisputeById(id: string, includeVotes: boolean = false) {
  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      job: {
        include: {
          client: {
            select: {
              id: true,
              username: true,
              walletAddress: true,
              avatarUrl: true,
            },
          },
          freelancer: {
            select: {
              id: true,
              username: true,
              walletAddress: true,
              avatarUrl: true,
            },
          },
        },
      },
      client: {
        select: {
          id: true,
          username: true,
          walletAddress: true,
          avatarUrl: true,
        },
      },
      freelancer: {
        select: {
          id: true,
          username: true,
          walletAddress: true,
          avatarUrl: true,
        },
      },
      initiator: {
        select: {
          id: true,
          username: true,
          walletAddress: true,
          avatarUrl: true,
        },
      },
      votes: includeVotes
        ? {
            include: {
              voter: {
                select: {
                  id: true,
                  username: true,
                  walletAddress: true,
                  avatarUrl: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          }
        : false,
      attachments: true,
      _count: { select: { votes: true } },
    },
  });

  if (!dispute) {
    throw new Error("Dispute not found");
  }

  // ✅ SAFE: never undefined
  const votes =
    (await prisma.disputeVote.findMany({
      where: { disputeId: id },
      select: { choice: true },
    })) ?? [];

  const totalVotes = votes.length;
  const clientVotes = votes.filter(v => v.choice === "CLIENT").length;
  const freelancerVotes = votes.filter(v => v.choice === "FREELANCER").length;
  const splitVotes = totalVotes - clientVotes - freelancerVotes;

  let arbitrators: Array<{
    address: string;
    displayName: string;
    avatarUrl: string | null;
  }> = [];

  let voteDeadline: string | undefined;

  if (dispute.onChainDisputeId) {
    try {
      const addresses =
        (await ContractService.getOnChainAssignedArbitrators(
          dispute.onChainDisputeId
        )) ?? [];

      arbitrators = await Promise.all(
        addresses.map(async (address) => {
          const user = await prisma.user.findFirst({
            where: { walletAddress: address },
            select: { username: true, avatarUrl: true },
          });

          return user
            ? {
                address,
                displayName: user.username,
                avatarUrl: user.avatarUrl,
              }
            : {
                address,
                displayName: `${address.slice(0, 4)}...${address.slice(-4)}`,
                avatarUrl: null,
              };
        })
      );
    } catch (err) {
      logger.warn(
        { err, id: dispute.onChainDisputeId },
        "arbitrator fetch failed"
      );
    }

    try {
      const deadline =
        await ContractService.getOnChainDisputeVoteDeadline(
          dispute.onChainDisputeId
        );

      if (deadline) voteDeadline = deadline;
    } catch (err) {
      logger.warn(
        { err, id: dispute.onChainDisputeId },
        "deadline fetch failed"
      );
    }
  }

  const { votes: _votes, _count, ...rest } = dispute;

  return {
    ...rest,
    voteDeadline,
    voteSummary: {
      totalVotes,
      clientVotes,
      freelancerVotes,
      splitVotes,
    },
    arbitrators,
  };
}
