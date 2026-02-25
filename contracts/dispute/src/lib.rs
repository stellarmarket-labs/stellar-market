#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short, Address, Env, String, Vec,
    Symbol, vec, IntoVal,
};

// Import reputation contract types for cross-contract calls
mod reputation {
    use soroban_sdk::{contracttype, Address};

    #[contracttype]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct UserReputation {
        pub user: Address,
        pub total_score: u64,
        pub total_weight: u64,
        pub review_count: u32,
    }
}

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
    InsufficientReputation = 8,
    NotInitialized = 9,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DisputeStatus {
    Open,
    Voting,
    ResolvedForClient,
    ResolvedForFreelancer,
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
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
enum DataKey {
    Dispute(u64),
    DisputeCount,
    Votes(u64),
    HasVoted(u64, Address),
    ReputationContract,
    MinVoterReputation,
    Admin,
}

const MIN_VOTER_REPUTATION: u32 = 300;

const MIN_TTL_THRESHOLD: u32 = 1_000;
const MIN_TTL_EXTEND_TO: u32 = 10_000;

fn bump_dispute_ttl(env: &Env, dispute_id: u64) {
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::Dispute(dispute_id), MIN_TTL_THRESHOLD, MIN_TTL_EXTEND_TO);
}

fn bump_votes_ttl(env: &Env, dispute_id: u64) {
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::Votes(dispute_id), MIN_TTL_THRESHOLD, MIN_TTL_EXTEND_TO);
}

fn bump_has_voted_ttl(env: &Env, dispute_id: u64, voter: &Address) {
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::HasVoted(dispute_id, voter.clone()), MIN_TTL_THRESHOLD, MIN_TTL_EXTEND_TO);
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
    /// Initialize the dispute contract with reputation contract address and admin.
    pub fn initialize(
        env: Env,
        admin: Address,
        reputation_contract: Address,
        min_voter_reputation: u32,
    ) -> Result<(), DisputeError> {
        admin.require_auth();

        // Check if already initialized
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(DisputeError::Unauthorized);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::ReputationContract, &reputation_contract);
        env.storage()
            .instance()
            .set(&DataKey::MinVoterReputation, &min_voter_reputation);

        bump_dispute_count_ttl(&env);

        // Emit event
        env.events().publish(
            (symbol_short!("dispute"), symbol_short!("init")),
            (admin, reputation_contract, min_voter_reputation),
        );

        Ok(())
    }

    /// Set the minimum voter reputation threshold (admin only).
    pub fn set_min_voter_reputation(
        env: Env,
        admin: Address,
        min_reputation: u32,
    ) -> Result<(), DisputeError> {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(DisputeError::NotInitialized)?;

        if admin != stored_admin {
            return Err(DisputeError::Unauthorized);
        }

        env.storage()
            .instance()
            .set(&DataKey::MinVoterReputation, &min_reputation);
        bump_dispute_count_ttl(&env);

        // Emit event
        env.events().publish(
            (symbol_short!("dispute"), symbol_short!("minrep")),
            (admin, min_reputation),
        );

        Ok(())
    }

    /// Check if an address is eligible to vote based on reputation.
    pub fn is_eligible_voter(env: Env, voter: Address) -> Result<bool, DisputeError> {
        let reputation_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::ReputationContract)
            .ok_or(DisputeError::NotInitialized)?;

        let min_reputation: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MinVoterReputation)
            .unwrap_or(MIN_VOTER_REPUTATION);

        // Call reputation contract to get voter's reputation
        let reputation_result = env
            .try_invoke_contract::<reputation::UserReputation, soroban_sdk::Error>(
                &reputation_contract,
                &Symbol::new(&env, "get_reputation"),
                vec![&env, voter.into_val(&env)],
            );

        match reputation_result {
            Ok(Ok(rep)) => {
                // Use total_score as the reputation metric
                Ok(rep.total_score >= min_reputation as u64)
            }
            _ => Ok(false), // User not found or error = not eligible
        }
    }

    /// Raise a dispute on a job. Either the client or freelancer can initiate.
    pub fn raise_dispute(
        env: Env,
        job_id: u64,
        client: Address,
        freelancer: Address,
        initiator: Address,
        reason: String,
        min_votes: u32,
    ) -> Result<u64, DisputeError> {
        initiator.require_auth();

        if initiator != client && initiator != freelancer {
            return Err(DisputeError::InvalidParty);
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
            created_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(count), &dispute);
        env.storage()
            .instance()
            .set(&DataKey::DisputeCount, &count);
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
    /// Voters must have sufficient reputation to participate (if reputation system is initialized).
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

        if dispute.status != DisputeStatus::Open && dispute.status != DisputeStatus::Voting {
            return Err(DisputeError::VotingClosed);
        }

        // Parties involved cannot vote
        if voter == dispute.client || voter == dispute.freelancer {
            return Err(DisputeError::InvalidParty);
        }

        // Check voter reputation eligibility (only if reputation system is initialized)
        if env.storage().instance().has(&DataKey::ReputationContract) {
            let is_eligible = Self::is_eligible_voter(env.clone(), voter.clone())?;
            if !is_eligible {
                return Err(DisputeError::InsufficientReputation);
            }
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

    pub fn resolve_dispute(
        env: Env,
        dispute_id: u64,
        escrow: Address,
    ) -> Result<DisputeStatus, DisputeError> {
        let mut dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(DisputeError::DisputeNotFound)?;
        bump_dispute_ttl(&env, dispute_id);

        if dispute.status == DisputeStatus::ResolvedForClient
            || dispute.status == DisputeStatus::ResolvedForFreelancer
        {
            return Err(DisputeError::AlreadyResolved);
        }

        let total_votes = dispute.votes_for_client + dispute.votes_for_freelancer;
        if total_votes < dispute.min_votes {
            return Err(DisputeError::NotEnoughVotes);
        }

        dispute.status = if dispute.votes_for_client >= dispute.votes_for_freelancer {
            DisputeStatus::ResolvedForClient
        } else {
            DisputeStatus::ResolvedForFreelancer
        };

        let resolved_status = dispute.status.clone();
        let resolved_for_client = resolved_status == DisputeStatus::ResolvedForClient;

        let _ = env.invoke_contract::<()>(
            &escrow,
            &Symbol::new(&env, "resolve_dispute_callback"),
            vec![
                &env,
                dispute.job_id.into_val(&env),
                resolved_for_client.into_val(&env),
            ],
        );

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(dispute_id), &dispute);
        bump_dispute_ttl(&env, dispute_id);

        // Emit event
        env.events().publish(
            (symbol_short!("dispute"), symbol_short!("resolved")),
            (dispute_id, dispute.status.clone()),
        );

        Ok(dispute.status)
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
