#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short, Address, Env, String, Vec,
};
use stellar_market_escrow::{EscrowContractClient, JobStatus};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReputationError {
    InvalidRating = 1,
    AlreadyReviewed = 2,
    SelfReview = 3,
    UserNotFound = 4,
    JobNotCompleted = 5,
    NotJobParticipant = 6,
    JobNotFound = 7,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Review {
    pub reviewer: Address,
    pub reviewee: Address,
    pub job_id: u64,
    pub rating: u32,
    pub comment: String,
    pub stake_weight: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserReputation {
    pub user: Address,
    pub total_score: u64,
    pub total_weight: u64,
    pub review_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
enum DataKey {
    Reputation(Address),
    Reviews(Address),
    ReviewExists(Address, Address, u64),
}

#[contract]
pub struct ReputationContract;

#[contractimpl]
impl ReputationContract {
    /// Submit a review for a user after completing a job.
    /// Rating must be between 1 and 5. Stake weight affects the review's influence.
    /// The escrow_contract_id is used to verify the job exists, is completed,
    /// and that reviewer/reviewee are the actual participants of the job.
    pub fn submit_review(
        env: Env,
        escrow_contract_id: Address,
        reviewer: Address,
        reviewee: Address,
        job_id: u64,
        rating: u32,
        comment: String,
        stake_weight: i128,
    ) -> Result<(), ReputationError> {
        reviewer.require_auth();

        if rating < 1 || rating > 5 {
            return Err(ReputationError::InvalidRating);
        }
        if reviewer == reviewee {
            return Err(ReputationError::SelfReview);
        }

        // Check if this reviewer already reviewed this user for this job
        let review_key = DataKey::ReviewExists(reviewer.clone(), reviewee.clone(), job_id);
        if env.storage().persistent().has(&review_key) {
            return Err(ReputationError::AlreadyReviewed);
        }

        // Cross-contract call: verify the job exists, is completed, and the
        // reviewer/reviewee are the actual client and freelancer of the job.
        let escrow_client = EscrowContractClient::new(&env, &escrow_contract_id);
        let job = match escrow_client.try_get_job(&job_id) {
            Ok(Ok(j)) => j,
            Ok(Err(_)) | Err(_) => return Err(ReputationError::JobNotFound),
        };

        if job.status != JobStatus::Completed {
            return Err(ReputationError::JobNotCompleted);
        }

        let valid_participants = (reviewer == job.client && reviewee == job.freelancer)
            || (reviewer == job.freelancer && reviewee == job.client);

        if !valid_participants {
            return Err(ReputationError::NotJobParticipant);
        }

        let weight = if stake_weight > 0 {
            stake_weight as u64
        } else {
            1u64
        };

        // Update user reputation
        let rep_key = DataKey::Reputation(reviewee.clone());
        let mut reputation: UserReputation = env
            .storage()
            .persistent()
            .get(&rep_key)
            .unwrap_or(UserReputation {
                user: reviewee.clone(),
                total_score: 0,
                total_weight: 0,
                review_count: 0,
            });

        reputation.total_score += (rating as u64) * weight;
        reputation.total_weight += weight;
        reputation.review_count += 1;

        env.storage().persistent().set(&rep_key, &reputation);

        // Store review
        let review = Review {
            reviewer: reviewer.clone(),
            reviewee: reviewee.clone(),
            job_id,
            rating,
            comment,
            stake_weight,
            timestamp: env.ledger().timestamp(),
        };

        let reviews_key = DataKey::Reviews(reviewee.clone());
        let mut reviews: Vec<Review> = env
            .storage()
            .persistent()
            .get(&reviews_key)
            .unwrap_or(Vec::new(&env));
        reviews.push_back(review);
        env.storage().persistent().set(&reviews_key, &reviews);

        // Mark as reviewed
        env.storage().persistent().set(&review_key, &true);

        // Emit event
        env.events().publish(
            (symbol_short!("reput"), symbol_short!("reviewed")),
            (reviewer, reviewee, job_id, rating),
        );

        Ok(())
    }

    /// Get the reputation data for a user.
    pub fn get_reputation(env: Env, user: Address) -> Result<UserReputation, ReputationError> {
        let rep_key = DataKey::Reputation(user);
        env.storage()
            .persistent()
            .get(&rep_key)
            .ok_or(ReputationError::UserNotFound)
    }

    /// Get the weighted average rating for a user (multiplied by 100 for precision).
    /// e.g., a return value of 450 means 4.50 stars.
    pub fn get_average_rating(env: Env, user: Address) -> Result<u64, ReputationError> {
        let rep = Self::get_reputation(env, user)?;
        if rep.total_weight == 0 {
            return Ok(0);
        }
        Ok((rep.total_score * 100) / rep.total_weight)
    }

    /// Get the total number of reviews for a user.
    pub fn get_review_count(env: Env, user: Address) -> u32 {
        let rep_key = DataKey::Reputation(user);
        let reputation: Option<UserReputation> = env.storage().persistent().get(&rep_key);
        match reputation {
            Some(rep) => rep.review_count,
            None => 0,
        }
    }

    /// Get all reviews for a user.
    pub fn get_reviews(env: Env, user: Address) -> Vec<Review> {
        let reviews_key = DataKey::Reviews(user);
        env.storage()
            .persistent()
            .get(&reviews_key)
            .unwrap_or(Vec::new(&env))
    }
}

#[cfg(test)]
mod test;
