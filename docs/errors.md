# Dispute contract error codes
| Code | Variant | Description |
|------|---------|-------------|
| #1 | `DisputeNotFound` | No dispute exists with the given ID |
| #2 | `Unauthorized` | Caller is not permitted to perform this action |
| #3 | `AlreadyVoted` | This address has already cast a vote on this dispute |
| #4 | `VotingClosed` | The voting window for this dispute has ended |
| #5 | `NotEnoughVotes` | Insufficient votes have been cast to resolve the dispute |
| #6 | `InvalidParty` | The given address is not a party to this dispute |
| #7 | `AlreadyResolved` | This dispute has already been resolved |
| #8 | `InsufficientReputation` | Voter does not meet the minimum reputation threshold |
| #9 | `NotInitialized` | The contract has not been initialized |
| #10 | `ConflictOfInterest` | Voter is a participant in the job under dispute |
| #11 | `ContractPaused` | The contract is currently paused; all mutations are blocked |
| #12 | `NotAdmin` | Caller is not a registered admin/signer |
| #13 | `DisputeCooldown` | A dispute was raised too recently; cooldown period not elapsed |
| #14 | `VotingPeriodNotExpired` | Cannot resolve before the voting period has fully elapsed |
| #15 | `DelegationNotFound` | No active delegation exists for this voter |
| #16 | `AlreadyDelegated` | This voter has already delegated their vote |
| #17 | `DelegateAlreadyVoted` | The delegate for this voter has already voted |

# Reputation contract error codes
| Code | Variant | Description |
|------|---------|-------------|
| #1 | `InvalidRating` | Rating must be between 1 and 5 |
| #2 | `AlreadyReviewed` | Reviewer has already submitted a review for this job/reviewee |
| #3 | `SelfReview` | A user cannot review themselves |
| #4 | `JobNotFound` | No escrow job exists with the given ID |
| #5 | `JobNotCompleted` | Job must be in Completed status before a review can be submitted |
| #6 | `NotJobParticipant` | Reviewer or reviewee is not a participant in the referenced job |
| #7 | `BelowMinStake` | Stake weight is below the configured minimum |
| #8 | `ContractPaused` | The contract is currently paused; all mutations are blocked |
| #9 | `NotAdmin` | Caller is not a registered admin/signer |
| #10 | `InvalidDecayRate` | Decay rate must be between 0 and 100 |
| #11 | `Unauthorized` | General authorization failure |
| #12 | `RateLimitExceeded` | Reviewer has submitted a review too recently; rate limit window not elapsed |
| #13 | `ReferralAlreadyRegistered` | This address already has a referrer registered |
| #14 | `SelfReferral` | A user cannot refer themselves |
| #15 | `ReviewNotFound` | No review matching the given criteria was found |
| #16 | `AppealWindowExpired` | The appeal window for this review has closed |
| #17 | `AppealThresholdNotMet` | Insufficient stake to meet the appeal threshold |
| #18 | `ReviewAlreadyAppealed` | This review has already been appealed |
| #19 | `NotReviewParticipant` | Caller is not a participant in the review being appealed |
| #20 | `AppealAlreadyExists` | An appeal for this review already exists |
| #21 | `AppealNotFound` | No appeal found matching the given criteria |
| #22 | `AppealAlreadyResolved` | This appeal has already been resolved |
| #23 | `AlreadyEndorsed` | This endorser has already endorsed the target for this skill |

## Stability guarantee
Error code numbers are **stable across contract upgrades**. New error variants are always appended with the next available integer; existing codes are never renumbered or removed.
