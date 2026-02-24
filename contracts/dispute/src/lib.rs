#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, vec, Address, Env,
    IntoVal, String, Symbol, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum DisputeError {
    DisputeNotFound = 1,
    Unauthorized = 2,
    AlreadyVoted = 3,
    VotingClosed = 4,
    NotEnoughVotes = 5,
    InvalidParty = 6,
    AlreadyResolved = 7,
    AppealWindowExpired = 8,
    MaxAppealsReached = 9,
    NotLosingParty = 10,
    CannotAppealBeforeResolution = 11,
    DisputeNotResolved = 12,
    NotWinningVoter = 13,
    AlreadyClaimed = 14,
    NoRewardAvailable = 15,
    NotConfigured = 16,
    AlreadyConfigured = 17,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DisputeStatus {
    Open,
    Voting,
    ResolvedForClient,
    ResolvedForFreelancer,
    Appealed,
    FinalResolution,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VoteChoice {
    Client,
    Freelancer,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Vote {
    pub voter: Address,
    pub choice: VoteChoice,
    pub reason: String,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Dispute {
    pub id: u64,
    pub job_id: u64,
    pub client: Address,
    pub freelancer: Address,
    pub initiator: Address,
    pub reason: String,
    pub status: DisputeStatus,
    pub votes_for_client: u32,
    pub votes_for_freelancer: u32,
    pub min_votes: u32,
    pub token: Address,
    pub initiator_penalty_stake: i128,
    pub created_at: u64,
    pub appeal_count: u32,
    pub max_appeals: u32,
    pub appeal_deadline: u64,
    pub resolution_timestamp: u64,
    pub dispute_fee: i128,
    pub malicious: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
enum DataKey {
    Dispute(u64),
    DisputeCount,
    Votes(u64),
    HasVoted(u64, Address),
    VoterRewarded(u64, Address),
    Admin,
    MaliciousThreshold,
    Configured,
}

const MIN_TTL_THRESHOLD: u32 = 1_000;
const MIN_TTL_EXTEND_TO: u32 = 10_000;

fn bump_dispute_ttl(env: &Env, dispute_id: u64) {
    env.storage().persistent().extend_ttl(
        &DataKey::Dispute(dispute_id),
        MIN_TTL_THRESHOLD,
        MIN_TTL_EXTEND_TO,
    );
}

fn bump_votes_ttl(env: &Env, dispute_id: u64) {
    env.storage().persistent().extend_ttl(
        &DataKey::Votes(dispute_id),
        MIN_TTL_THRESHOLD,
        MIN_TTL_EXTEND_TO,
    );
}

fn bump_has_voted_ttl(env: &Env, dispute_id: u64, voter: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::HasVoted(dispute_id, voter.clone()),
        MIN_TTL_THRESHOLD,
        MIN_TTL_EXTEND_TO,
    );
}

fn bump_voter_rewarded_ttl(env: &Env, dispute_id: u64, voter: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::VoterRewarded(dispute_id, voter.clone()),
        MIN_TTL_THRESHOLD,
        MIN_TTL_EXTEND_TO,
    );
}

fn bump_dispute_count_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(MIN_TTL_THRESHOLD, MIN_TTL_EXTEND_TO);
}

#[contract]
pub struct DisputeContract;

#[contractimpl]
impl DisputeContract {
    /// Initialize the contract with admin and malicious threshold.
    pub fn initialize(env: Env, admin: Address, threshold: u32) -> Result<(), DisputeError> {
        if env.storage().instance().has(&DataKey::Configured) {
            return Err(DisputeError::AlreadyConfigured);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::MaliciousThreshold, &threshold);
        env.storage().instance().set(&DataKey::Configured, &true);

        Ok(())
    }

    /// Update the malicious threshold. Only admin can call.
    pub fn set_malicious_threshold(env: Env, threshold: u32) -> Result<(), DisputeError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(DisputeError::NotConfigured)?;
        admin.require_auth();

        env.storage().instance().set(&DataKey::MaliciousThreshold, &threshold);

        Ok(())
    }

    /// Update the admin address. Only current admin can call.
    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), DisputeError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(DisputeError::NotConfigured)?;
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &new_admin);

        Ok(())
    }

    /// Check if a dispute was resolved as malicious.
    pub fn is_malicious_dispute(env: Env, dispute_id: u64) -> Result<bool, DisputeError> {
        let dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(DisputeError::DisputeNotFound)?;

        if dispute.status != DisputeStatus::ResolvedForClient
            && dispute.status != DisputeStatus::ResolvedForFreelancer
        {
            return Ok(false);
        }

        let threshold: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MaliciousThreshold)
            .unwrap_or(80); // Default to 80% if not set

        let total_votes = dispute.votes_for_client + dispute.votes_for_freelancer;
        if total_votes == 0 {
            return Ok(false);
        }

        let votes_against = if dispute.initiator == dispute.client {
            dispute.votes_for_freelancer
        } else {
            dispute.votes_for_client
        };

        let percentage = (votes_against * 100) / total_votes;
        Ok(percentage > threshold)
    }

    /// Raise a dispute on a job. Either the client or freelancer can initiate.
    /// The initiator pays a dispute fee held in escrow during voting.
    pub fn raise_dispute(
        env: Env,
        job_id: u64,
        client: Address,
        freelancer: Address,
        initiator: Address,
        reason: String,
        min_votes: u32,
        dispute_fee: i128,
        token: Address,
        penalty_stake: i128,
    ) -> Result<u64, DisputeError> {
        initiator.require_auth();

        if initiator != client && initiator != freelancer {
            return Err(DisputeError::InvalidParty);
        }

        // Hold dispute fee and penalty stake in contract escrow
        let token_client = token::Client::new(&env, &token);
        if dispute_fee > 0 {
            token_client.transfer(&initiator, &env.current_contract_address(), &dispute_fee);
        }
        if penalty_stake > 0 {
            token_client.transfer(&initiator, &env.current_contract_address(), &penalty_stake);
        }

        let mut count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::DisputeCount)
            .unwrap_or(0);
        count += 1;

        let dispute = Dispute {
            id: count,
            job_id,
            client,
            freelancer,
            initiator: initiator.clone(),
            reason,
            status: DisputeStatus::Open,
            votes_for_client: 0,
            votes_for_freelancer: 0,
            min_votes: if min_votes < 3 { 3 } else { min_votes },
            token,
            initiator_penalty_stake: penalty_stake,
            created_at: env.ledger().timestamp(),
            appeal_count: 0,
            max_appeals: 2,
            appeal_deadline: 0,
            resolution_timestamp: 0,
            dispute_fee,
            malicious: false,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(count), &dispute);
        env.storage().instance().set(&DataKey::DisputeCount, &count);
        bump_dispute_ttl(&env, count);
        bump_dispute_count_ttl(&env);
        env.storage()
            .persistent()
            .set(&DataKey::Votes(count), &Vec::<Vote>::new(&env));
        bump_votes_ttl(&env, count);

        // Emit event
        env.events().publish(
            (symbol_short!("dispute"), symbol_short!("raised")),
            (count, job_id, initiator),
        );

        Ok(count)
    }

    /// Cast a vote on a dispute. Voters cannot be the client or freelancer.
    pub fn cast_vote(
        env: Env,
        dispute_id: u64,
        voter: Address,
        choice: VoteChoice,
        reason: String,
    ) -> Result<(), DisputeError> {
        voter.require_auth();

        let mut dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(DisputeError::DisputeNotFound)?;
        bump_dispute_ttl(&env, dispute_id);

        if dispute.status != DisputeStatus::Open
            && dispute.status != DisputeStatus::Voting
            && dispute.status != DisputeStatus::Appealed
        {
            return Err(DisputeError::VotingClosed);
        }

        // Parties involved cannot vote
        if voter == dispute.client || voter == dispute.freelancer {
            return Err(DisputeError::InvalidParty);
        }

        // Check if already voted
        let voted_key = DataKey::HasVoted(dispute_id, voter.clone());
        if env.storage().persistent().has(&voted_key) {
            return Err(DisputeError::AlreadyVoted);
        }

        // Record vote
        let vote = Vote {
            voter: voter.clone(),
            choice: choice.clone(),
            reason,
            timestamp: env.ledger().timestamp(),
        };

        let mut votes: Vec<Vote> = env
            .storage()
            .persistent()
            .get(&DataKey::Votes(dispute_id))
            .unwrap_or(Vec::new(&env));
        votes.push_back(vote);
        env.storage()
            .persistent()
            .set(&DataKey::Votes(dispute_id), &votes);
        bump_votes_ttl(&env, dispute_id);

        match choice {
            VoteChoice::Client => dispute.votes_for_client += 1,
            VoteChoice::Freelancer => dispute.votes_for_freelancer += 1,
        }

        dispute.status = DisputeStatus::Voting;
        env.storage()
            .persistent()
            .set(&DataKey::Dispute(dispute_id), &dispute);
        env.storage().persistent().set(&voted_key, &true);
        bump_dispute_ttl(&env, dispute_id);
        bump_has_voted_ttl(&env, dispute_id, &voter);

        // Emit event
        env.events().publish(
            (symbol_short!("dispute"), symbol_short!("voted")),
            (dispute_id, voter, choice),
        );

        Ok(())
    }

    /// Resolve a dispute after enough votes are cast.
    /// If `malicious` is true, the dispute fee is refunded to the winning party
    /// instead of being distributed to voters.
    pub fn resolve_dispute(
        env: Env,
        dispute_id: u64,
        escrow: Address,
        malicious: bool,
    ) -> Result<DisputeStatus, DisputeError> {
        let mut dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(DisputeError::DisputeNotFound)?;
        bump_dispute_ttl(&env, dispute_id);

        if dispute.status == DisputeStatus::FinalResolution {
            return Err(DisputeError::AlreadyResolved);
        }

        let total_votes = dispute.votes_for_client + dispute.votes_for_freelancer;

        // Calculate required votes based on appeal count (doubles each round)
        let required_votes = dispute.min_votes * (2_u32.pow(dispute.appeal_count));

        if total_votes < required_votes {
            return Err(DisputeError::NotEnoughVotes);
        }

        let resolved_for_client = dispute.votes_for_client >= dispute.votes_for_freelancer;

        // Check if this is the final resolution
        let is_final = dispute.appeal_count >= dispute.max_appeals;

        if is_final {
            dispute.status = DisputeStatus::FinalResolution;
        } else {
            dispute.status = if resolved_for_client {
                DisputeStatus::ResolvedForClient
            } else {
                DisputeStatus::ResolvedForFreelancer
            };
        }

        // Set resolution timestamp and appeal deadline (e.g., 100 ledgers = ~8.3 minutes)
        dispute.resolution_timestamp = env.ledger().timestamp();
        dispute.appeal_deadline = env.ledger().sequence() as u64 + 100;

        dispute.malicious = malicious;

        let resolved_status = dispute.status.clone();

        // Only invoke escrow callback for final resolution
        if is_final {
            let _ = env.invoke_contract::<()>(
                &escrow,
                &Symbol::new(&env, "resolve_dispute_callback"),
                vec![
                    &env,
                    dispute.job_id.into_val(&env),
                    resolved_for_client.into_val(&env),
                ],
            );
        }

        // If malicious, refund dispute fee to the winning party (victim of bad-faith dispute)
        if malicious && dispute.dispute_fee > 0 {
            let token_client = token::Client::new(&env, &dispute.token);
            let refund_to = if resolved_for_client {
                &dispute.client
            } else {
                &dispute.freelancer
            };
            token_client.transfer(
                &env.current_contract_address(),
                refund_to,
                &dispute.dispute_fee,
            );
        }

        // Handle penalty stake
        if dispute.initiator_penalty_stake > 0 {
            let threshold: u32 = env
                .storage()
                .instance()
                .get(&DataKey::MaliciousThreshold)
                .unwrap_or(80);

            let total_votes = dispute.votes_for_client + dispute.votes_for_freelancer;
            let votes_against = if dispute.initiator == dispute.client {
                dispute.votes_for_freelancer
            } else {
                dispute.votes_for_client
            };

            let is_malicious = if total_votes > 0 {
                (votes_against * 100) / total_votes > threshold
            } else {
                false
            };

            let token_client = token::Client::new(&env, &dispute.token);
            if is_malicious {
                // Slash stake and send to winning party
                let winner = if dispute.status == DisputeStatus::ResolvedForClient {
                    dispute.client.clone()
                } else {
                    dispute.freelancer.clone()
                };
                token_client.transfer(
                    &env.current_contract_address(),
                    &winner,
                    &dispute.initiator_penalty_stake,
                );
            } else {
                // Return stake to initiator
                token_client.transfer(
                    &env.current_contract_address(),
                    &dispute.initiator,
                    &dispute.initiator_penalty_stake,
                );
            }
        }

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(dispute_id), &dispute);
        bump_dispute_ttl(&env, dispute_id);

        // Emit different events for first resolution vs final resolution
        if is_final {
            env.events().publish(
                (symbol_short!("dispute"), symbol_short!("final")),
                (dispute_id, resolved_status.clone()),
            );
        } else {
            env.events().publish(
                (symbol_short!("dispute"), symbol_short!("resolved")),
                (dispute_id, resolved_status.clone()),
            );
        }

        Ok(resolved_status)
    }

    /// Raise an appeal on a resolved dispute. Only the losing party can appeal.
    pub fn raise_appeal(
        env: Env,
        dispute_id: u64,
        appellant: Address,
    ) -> Result<(), DisputeError> {
        appellant.require_auth();

        let mut dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(DisputeError::DisputeNotFound)?;
        bump_dispute_ttl(&env, dispute_id);

        // Check if max appeals reached first
        if dispute.appeal_count >= dispute.max_appeals {
            return Err(DisputeError::MaxAppealsReached);
        }

        // Check if dispute has been resolved (but not final)
        if dispute.status != DisputeStatus::ResolvedForClient
            && dispute.status != DisputeStatus::ResolvedForFreelancer
            && dispute.status != DisputeStatus::FinalResolution
        {
            return Err(DisputeError::CannotAppealBeforeResolution);
        }

        // Cannot appeal final resolution
        if dispute.status == DisputeStatus::FinalResolution {
            return Err(DisputeError::MaxAppealsReached);
        }

        // Check if appeal window has expired
        if env.ledger().sequence() as u64 > dispute.appeal_deadline {
            return Err(DisputeError::AppealWindowExpired);
        }

        // Verify appellant is the losing party
        let is_losing_party = match dispute.status {
            DisputeStatus::ResolvedForClient => appellant == dispute.freelancer,
            DisputeStatus::ResolvedForFreelancer => appellant == dispute.client,
            _ => false,
        };

        if !is_losing_party {
            return Err(DisputeError::NotLosingParty);
        }

        // Increment appeal count and reset voting
        dispute.appeal_count += 1;
        dispute.status = DisputeStatus::Appealed;
        dispute.votes_for_client = 0;
        dispute.votes_for_freelancer = 0;

        // Clear previous votes
        env.storage()
            .persistent()
            .set(&DataKey::Votes(dispute_id), &Vec::<Vote>::new(&env));
        bump_votes_ttl(&env, dispute_id);

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(dispute_id), &dispute);
        bump_dispute_ttl(&env, dispute_id);

        // Emit event
        env.events().publish(
            (symbol_short!("dispute"), symbol_short!("appealed")),
            (dispute_id, appellant, dispute.appeal_count),
        );

        Ok(())
    }

    /// Claim voter reward for a resolved dispute. Only winning-side voters can claim.
    /// Reward = dispute_fee / winning_vote_count. Double-claim prevented by storage flag.
    pub fn claim_voter_reward(
        env: Env,
        dispute_id: u64,
        voter: Address,
    ) -> Result<i128, DisputeError> {
        voter.require_auth();

        let dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(DisputeError::DisputeNotFound)?;
        bump_dispute_ttl(&env, dispute_id);

        // Must be resolved (including FinalResolution from appeal system)
        if dispute.status != DisputeStatus::ResolvedForClient
            && dispute.status != DisputeStatus::ResolvedForFreelancer
            && dispute.status != DisputeStatus::FinalResolution
        {
            return Err(DisputeError::DisputeNotResolved);
        }

        // No rewards if dispute was malicious (fee already refunded)
        if dispute.malicious {
            return Err(DisputeError::NoRewardAvailable);
        }

        // No reward if fee is zero
        if dispute.dispute_fee <= 0 {
            return Err(DisputeError::NoRewardAvailable);
        }

        // Check voter hasn't already claimed
        let rewarded_key = DataKey::VoterRewarded(dispute_id, voter.clone());
        if env.storage().persistent().has(&rewarded_key) {
            return Err(DisputeError::AlreadyClaimed);
        }

        // Check voter voted on the winning side
        let votes: Vec<Vote> = env
            .storage()
            .persistent()
            .get(&DataKey::Votes(dispute_id))
            .unwrap_or(Vec::new(&env));

        let winning_choice = if dispute.status == DisputeStatus::ResolvedForClient {
            VoteChoice::Client
        } else {
            // ResolvedForFreelancer or FinalResolution — determine from vote counts
            if dispute.votes_for_client >= dispute.votes_for_freelancer {
                VoteChoice::Client
            } else {
                VoteChoice::Freelancer
            }
        };

        let mut voter_on_winning_side = false;
        for vote in votes.iter() {
            if vote.voter == voter && vote.choice == winning_choice {
                voter_on_winning_side = true;
                break;
            }
        }

        if !voter_on_winning_side {
            return Err(DisputeError::NotWinningVoter);
        }

        // Calculate reward: dispute_fee / winning_vote_count
        let winning_count = match winning_choice {
            VoteChoice::Client => dispute.votes_for_client as i128,
            VoteChoice::Freelancer => dispute.votes_for_freelancer as i128,
        };

        if winning_count == 0 {
            return Err(DisputeError::NoRewardAvailable);
        }

        let reward = dispute.dispute_fee / winning_count;
        if reward <= 0 {
            return Err(DisputeError::NoRewardAvailable);
        }

        // Transfer reward to voter
        let token_client = token::Client::new(&env, &dispute.token);
        token_client.transfer(&env.current_contract_address(), &voter, &reward);

        // Mark as claimed
        env.storage().persistent().set(&rewarded_key, &true);
        bump_voter_rewarded_ttl(&env, dispute_id, &voter);

        // Emit event
        env.events().publish(
            (symbol_short!("dispute"), symbol_short!("reward")),
            (dispute_id, voter, reward),
        );

        Ok(reward)
    }

    /// View function: returns the claimable reward for a voter, or 0 if not eligible.
    pub fn get_claimable_reward(env: Env, dispute_id: u64, voter: Address) -> i128 {
        let dispute: Dispute = match env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
        {
            Some(d) => d,
            None => return 0,
        };

        // Must be resolved, not malicious, and have a fee
        if (dispute.status != DisputeStatus::ResolvedForClient
            && dispute.status != DisputeStatus::ResolvedForFreelancer
            && dispute.status != DisputeStatus::FinalResolution)
            || dispute.malicious
            || dispute.dispute_fee <= 0
        {
            return 0;
        }

        // Must not have already claimed
        let rewarded_key = DataKey::VoterRewarded(dispute_id, voter.clone());
        if env.storage().persistent().has(&rewarded_key) {
            return 0;
        }

        // Must have voted on the winning side
        let votes: Vec<Vote> = env
            .storage()
            .persistent()
            .get(&DataKey::Votes(dispute_id))
            .unwrap_or(Vec::new(&env));

        let winning_choice = if dispute.status == DisputeStatus::ResolvedForClient {
            VoteChoice::Client
        } else {
            if dispute.votes_for_client >= dispute.votes_for_freelancer {
                VoteChoice::Client
            } else {
                VoteChoice::Freelancer
            }
        };

        let mut voter_on_winning_side = false;
        for vote in votes.iter() {
            if vote.voter == voter && vote.choice == winning_choice {
                voter_on_winning_side = true;
                break;
            }
        }

        if !voter_on_winning_side {
            return 0;
        }

        let winning_count = match winning_choice {
            VoteChoice::Client => dispute.votes_for_client as i128,
            VoteChoice::Freelancer => dispute.votes_for_freelancer as i128,
        };

        if winning_count == 0 {
            return 0;
        }

        dispute.dispute_fee / winning_count
    }

    /// Get dispute details.
    pub fn get_dispute(env: Env, dispute_id: u64) -> Result<Dispute, DisputeError> {
        let dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(DisputeError::DisputeNotFound)?;
        bump_dispute_ttl(&env, dispute_id);
        Ok(dispute)
    }

    /// Get all votes for a dispute.
    pub fn get_votes(env: Env, dispute_id: u64) -> Vec<Vote> {
        env.storage()
            .persistent()
            .get(&DataKey::Votes(dispute_id))
            .unwrap_or(Vec::new(&env))
    }

    /// Get total dispute count.
    pub fn get_dispute_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::DisputeCount)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
