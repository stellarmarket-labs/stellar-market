#![cfg(test)]

use super::*;
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    token, Env, String,
};

#[contract]
pub struct DummyEscrow;

#[contractimpl]
impl DummyEscrow {
    pub fn resolve_dispute_callback(_env: Env, _job_id: u64, _resolved_for_client: bool) {}
}

fn setup_env() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let dispute_contract_id = env.register_contract(None, DisputeContract);
    let escrow_contract_id = env.register_contract(None, DummyEscrow);
    (env, dispute_contract_id, escrow_contract_id)
}

fn create_token(env: &Env) -> (Address, token::StellarAssetClient<'_>) {
    let admin = Address::generate(env);
    #[allow(deprecated)]
    let token_address = env.register_stellar_asset_contract(admin.clone());
    let token_admin = token::StellarAssetClient::new(env, &token_address);
    (token_address, token_admin)
}

// ---- Core dispute tests ----

#[test]
fn test_raise_dispute() {
    let (env, dispute_contract_id, _escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    token_admin.mint(&user_client, &1000);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Work not delivered"),
        &3u32,
        &100,
        &token_address,
    );

    assert_eq!(dispute_id, 1);

    let dispute = client.get_dispute(&dispute_id);
    assert_eq!(dispute.job_id, 1);
    assert_eq!(dispute.status, DisputeStatus::Open);
    assert_eq!(dispute.min_votes, 3);
    assert_eq!(dispute.appeal_count, 0);
    assert_eq!(dispute.max_appeals, 2);
    assert_eq!(dispute.dispute_fee, 100);
    assert_eq!(dispute.malicious, false);

    // Verify fee was transferred to contract
    let token_client = token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&user_client), 900);
    assert_eq!(token_client.balance(&dispute_contract_id), 100);
}

#[test]
fn test_vote_and_resolve() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    token_admin.mint(&freelancer, &1000);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &freelancer,
        &String::from_str(&env, "Payment not released"),
        &3u32,
        &100,
        &token_address,
    );

    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let voter3 = Address::generate(&env);

    client.cast_vote(
        &dispute_id,
        &voter1,
        &VoteChoice::Freelancer,
        &String::from_str(&env, "Work was done"),
    );
    client.cast_vote(
        &dispute_id,
        &voter2,
        &VoteChoice::Freelancer,
        &String::from_str(&env, "Agree with freelancer"),
    );
    client.cast_vote(
        &dispute_id,
        &voter3,
        &VoteChoice::Client,
        &String::from_str(&env, "Incomplete work"),
    );

    let result = client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);
    assert_eq!(result, DisputeStatus::ResolvedForFreelancer);

    // Fee should still be held in contract for voter rewards
    let token_client = token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&dispute_contract_id), 100);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_resolve_without_enough_votes() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, _token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Issue"),
        &3u32,
        &0,
        &token_address,
    );

    let voter = Address::generate(&env);
    client.cast_vote(
        &dispute_id,
        &voter,
        &VoteChoice::Client,
        &String::from_str(&env, "Reason"),
    );

    client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);
}

// ---- Voter reward tests ----

#[test]
fn test_claim_voter_reward_proportional() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    token_admin.mint(&user_client, &1000);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Bad work"),
        &3u32,
        &100,
        &token_address,
    );

    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let voter3 = Address::generate(&env);

    // 2 vote for client, 1 for freelancer
    client.cast_vote(
        &dispute_id,
        &voter1,
        &VoteChoice::Client,
        &String::from_str(&env, "r1"),
    );
    client.cast_vote(
        &dispute_id,
        &voter2,
        &VoteChoice::Client,
        &String::from_str(&env, "r2"),
    );
    client.cast_vote(
        &dispute_id,
        &voter3,
        &VoteChoice::Freelancer,
        &String::from_str(&env, "r3"),
    );

    client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);

    // Each winning voter (voter1, voter2) should get 100/2 = 50
    let reward1 = client.claim_voter_reward(&dispute_id, &voter1);
    assert_eq!(reward1, 50);

    let reward2 = client.claim_voter_reward(&dispute_id, &voter2);
    assert_eq!(reward2, 50);

    let token_client = token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&voter1), 50);
    assert_eq!(token_client.balance(&voter2), 50);
    assert_eq!(token_client.balance(&dispute_contract_id), 0);
}

#[test]
fn test_get_claimable_reward() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    token_admin.mint(&user_client, &1000);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Bad work"),
        &3u32,
        &90,
        &token_address,
    );

    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let voter3 = Address::generate(&env);
    let non_voter = Address::generate(&env);

    client.cast_vote(
        &dispute_id,
        &voter1,
        &VoteChoice::Client,
        &String::from_str(&env, "r"),
    );
    client.cast_vote(
        &dispute_id,
        &voter2,
        &VoteChoice::Client,
        &String::from_str(&env, "r"),
    );
    client.cast_vote(
        &dispute_id,
        &voter3,
        &VoteChoice::Freelancer,
        &String::from_str(&env, "r"),
    );

    // Before resolution, should return 0
    assert_eq!(client.get_claimable_reward(&dispute_id, &voter1), 0);

    client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);

    // Winning voter gets 90/2 = 45
    assert_eq!(client.get_claimable_reward(&dispute_id, &voter1), 45);
    assert_eq!(client.get_claimable_reward(&dispute_id, &voter2), 45);
    // Losing voter gets 0
    assert_eq!(client.get_claimable_reward(&dispute_id, &voter3), 0);
    // Non-voter gets 0
    assert_eq!(client.get_claimable_reward(&dispute_id, &non_voter), 0);

    // After claiming, should return 0
    client.claim_voter_reward(&dispute_id, &voter1);
    assert_eq!(client.get_claimable_reward(&dispute_id, &voter1), 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #14)")]
fn test_double_claim_prevented() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    token_admin.mint(&user_client, &1000);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Bad work"),
        &3u32,
        &90,
        &token_address,
    );

    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let voter3 = Address::generate(&env);

    client.cast_vote(&dispute_id, &voter1, &VoteChoice::Client, &String::from_str(&env, "r"));
    client.cast_vote(&dispute_id, &voter2, &VoteChoice::Client, &String::from_str(&env, "r"));
    client.cast_vote(&dispute_id, &voter3, &VoteChoice::Freelancer, &String::from_str(&env, "r"));

    client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);

    client.claim_voter_reward(&dispute_id, &voter1); // First claim OK
    client.claim_voter_reward(&dispute_id, &voter1); // Double claim panics
}

#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn test_losing_voter_cannot_claim() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    token_admin.mint(&user_client, &1000);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Bad work"),
        &3u32,
        &90,
        &token_address,
    );

    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let voter3 = Address::generate(&env);

    client.cast_vote(&dispute_id, &voter1, &VoteChoice::Client, &String::from_str(&env, "r"));
    client.cast_vote(&dispute_id, &voter2, &VoteChoice::Client, &String::from_str(&env, "r"));
    client.cast_vote(&dispute_id, &voter3, &VoteChoice::Freelancer, &String::from_str(&env, "r"));

    client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);

    // voter3 voted for freelancer but client won — should fail
    client.claim_voter_reward(&dispute_id, &voter3);
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")]
fn test_claim_before_resolution_fails() {
    let (env, dispute_contract_id, _escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    token_admin.mint(&user_client, &1000);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Bad work"),
        &3u32,
        &90,
        &token_address,
    );

    let voter1 = Address::generate(&env);
    client.cast_vote(&dispute_id, &voter1, &VoteChoice::Client, &String::from_str(&env, "r"));

    // Try to claim before resolution
    client.claim_voter_reward(&dispute_id, &voter1);
}

#[test]
fn test_malicious_dispute_refunds_winning_party() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    // Initiator (user_client) pays 100 fee
    token_admin.mint(&user_client, &1000);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Malicious claim"),
        &3u32,
        &100,
        &token_address,
    );

    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let voter3 = Address::generate(&env);

    // Freelancer wins (dispute was malicious)
    client.cast_vote(&dispute_id, &voter1, &VoteChoice::Freelancer, &String::from_str(&env, "r"));
    client.cast_vote(&dispute_id, &voter2, &VoteChoice::Freelancer, &String::from_str(&env, "r"));
    client.cast_vote(&dispute_id, &voter3, &VoteChoice::Client, &String::from_str(&env, "r"));

    let result = client.resolve_dispute(&dispute_id, &escrow_contract_id, &true);
    assert_eq!(result, DisputeStatus::ResolvedForFreelancer);

    // Fee refunded to freelancer (winning/victim party)
    let token_client = token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&freelancer), 100);
    assert_eq!(token_client.balance(&dispute_contract_id), 0);

    // Dispute marked as malicious
    let dispute = client.get_dispute(&dispute_id);
    assert_eq!(dispute.malicious, true);
}

#[test]
#[should_panic(expected = "Error(Contract, #15)")]
fn test_claim_reward_on_malicious_dispute_fails() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    token_admin.mint(&user_client, &1000);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Malicious"),
        &3u32,
        &100,
        &token_address,
    );

    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let voter3 = Address::generate(&env);

    client.cast_vote(&dispute_id, &voter1, &VoteChoice::Freelancer, &String::from_str(&env, "r"));
    client.cast_vote(&dispute_id, &voter2, &VoteChoice::Freelancer, &String::from_str(&env, "r"));
    client.cast_vote(&dispute_id, &voter3, &VoteChoice::Client, &String::from_str(&env, "r"));

    client.resolve_dispute(&dispute_id, &escrow_contract_id, &true);

    // Winning voter tries to claim on malicious dispute — no reward available
    client.claim_voter_reward(&dispute_id, &voter1);
}

#[test]
fn test_zero_fee_dispute() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, _token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "No fee dispute"),
        &3u32,
        &0,
        &token_address,
    );

    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let voter3 = Address::generate(&env);

    client.cast_vote(&dispute_id, &voter1, &VoteChoice::Client, &String::from_str(&env, "r"));
    client.cast_vote(&dispute_id, &voter2, &VoteChoice::Client, &String::from_str(&env, "r"));
    client.cast_vote(&dispute_id, &voter3, &VoteChoice::Freelancer, &String::from_str(&env, "r"));

    client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);

    // Claimable reward should be 0
    assert_eq!(client.get_claimable_reward(&dispute_id, &voter1), 0);
}

#[test]
fn test_single_winning_voter_gets_full_fee() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    token_admin.mint(&user_client, &1000);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Issue"),
        &3u32,
        &100,
        &token_address,
    );

    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let voter3 = Address::generate(&env);

    // All 3 vote for client -> client wins, all 3 share equally
    client.cast_vote(&dispute_id, &voter1, &VoteChoice::Client, &String::from_str(&env, "r"));
    client.cast_vote(&dispute_id, &voter2, &VoteChoice::Client, &String::from_str(&env, "r"));
    client.cast_vote(&dispute_id, &voter3, &VoteChoice::Client, &String::from_str(&env, "r"));

    client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);

    // All 3 are winners: 100/3 = 33 each (integer division)
    let reward = client.claim_voter_reward(&dispute_id, &voter1);
    assert_eq!(reward, 33);

    let token_client = token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&voter1), 33);
}

// ---- Appeal system tests ----

#[test]
fn test_appeal_by_losing_party() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, _token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Quality issue"),
        &3u32,
        &0,
        &token_address,
    );

    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let voter3 = Address::generate(&env);

    client.cast_vote(&dispute_id, &voter1, &VoteChoice::Freelancer, &String::from_str(&env, "Good work"));
    client.cast_vote(&dispute_id, &voter2, &VoteChoice::Freelancer, &String::from_str(&env, "Agree"));
    client.cast_vote(&dispute_id, &voter3, &VoteChoice::Client, &String::from_str(&env, "Disagree"));

    let result = client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);
    assert_eq!(result, DisputeStatus::ResolvedForFreelancer);

    // Client (losing party) appeals
    client.raise_appeal(&dispute_id, &user_client);

    let dispute = client.get_dispute(&dispute_id);
    assert_eq!(dispute.status, DisputeStatus::Appealed);
    assert_eq!(dispute.appeal_count, 1);
    assert_eq!(dispute.votes_for_client, 0);
    assert_eq!(dispute.votes_for_freelancer, 0);
}

#[test]
fn test_appeal_requires_double_votes() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, _token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Issue"),
        &3u32,
        &0,
        &token_address,
    );

    // First round: 3 votes needed
    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let voter3 = Address::generate(&env);

    client.cast_vote(&dispute_id, &voter1, &VoteChoice::Freelancer, &String::from_str(&env, "Vote 1"));
    client.cast_vote(&dispute_id, &voter2, &VoteChoice::Freelancer, &String::from_str(&env, "Vote 2"));
    client.cast_vote(&dispute_id, &voter3, &VoteChoice::Client, &String::from_str(&env, "Vote 3"));

    client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);

    // Client appeals
    client.raise_appeal(&dispute_id, &user_client);

    // Second round: 6 votes needed (3 * 2^1)
    let voter4 = Address::generate(&env);
    let voter5 = Address::generate(&env);
    let voter6 = Address::generate(&env);
    let voter7 = Address::generate(&env);
    let voter8 = Address::generate(&env);
    let voter9 = Address::generate(&env);

    client.cast_vote(&dispute_id, &voter4, &VoteChoice::Client, &String::from_str(&env, "Appeal vote 1"));
    client.cast_vote(&dispute_id, &voter5, &VoteChoice::Client, &String::from_str(&env, "Appeal vote 2"));
    client.cast_vote(&dispute_id, &voter6, &VoteChoice::Client, &String::from_str(&env, "Appeal vote 3"));
    client.cast_vote(&dispute_id, &voter7, &VoteChoice::Client, &String::from_str(&env, "Appeal vote 4"));
    client.cast_vote(&dispute_id, &voter8, &VoteChoice::Freelancer, &String::from_str(&env, "Appeal vote 5"));
    client.cast_vote(&dispute_id, &voter9, &VoteChoice::Freelancer, &String::from_str(&env, "Appeal vote 6"));

    // Should succeed with 6 votes
    let result = client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);
    assert_eq!(result, DisputeStatus::ResolvedForClient);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_appeal_by_winning_party_fails() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, _token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Issue"),
        &3u32,
        &0,
        &token_address,
    );

    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let voter3 = Address::generate(&env);

    client.cast_vote(&dispute_id, &voter1, &VoteChoice::Freelancer, &String::from_str(&env, "Vote 1"));
    client.cast_vote(&dispute_id, &voter2, &VoteChoice::Freelancer, &String::from_str(&env, "Vote 2"));
    client.cast_vote(&dispute_id, &voter3, &VoteChoice::Client, &String::from_str(&env, "Vote 3"));

    client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);

    // Freelancer (winning party) tries to appeal - should fail
    client.raise_appeal(&dispute_id, &freelancer);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_max_appeals_reached() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, _token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Issue"),
        &3u32,
        &0,
        &token_address,
    );

    // First resolution
    for _i in 0..3 {
        let voter = Address::generate(&env);
        client.cast_vote(&dispute_id, &voter, &VoteChoice::Freelancer, &String::from_str(&env, "V1"));
    }
    client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);

    // First appeal
    client.raise_appeal(&dispute_id, &user_client);
    for _i in 0..6 {
        let voter = Address::generate(&env);
        client.cast_vote(&dispute_id, &voter, &VoteChoice::Freelancer, &String::from_str(&env, "Vote"));
    }
    client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);

    // Second appeal
    client.raise_appeal(&dispute_id, &user_client);
    for _i in 0..12 {
        let voter = Address::generate(&env);
        client.cast_vote(&dispute_id, &voter, &VoteChoice::Freelancer, &String::from_str(&env, "Vote"));
    }
    client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);

    // Third appeal should fail (max_appeals = 2)
    client.raise_appeal(&dispute_id, &user_client);
}

#[test]
fn test_final_resolution_after_max_appeals() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, _token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Issue"),
        &3u32,
        &0,
        &token_address,
    );

    // First resolution
    for _i in 0..3 {
        let voter = Address::generate(&env);
        client.cast_vote(&dispute_id, &voter, &VoteChoice::Freelancer, &String::from_str(&env, "Vote"));
    }
    client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);

    // First appeal
    client.raise_appeal(&dispute_id, &user_client);
    for _i in 0..6 {
        let voter = Address::generate(&env);
        client.cast_vote(&dispute_id, &voter, &VoteChoice::Freelancer, &String::from_str(&env, "Vote"));
    }
    client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);

    // Second appeal (last one allowed)
    client.raise_appeal(&dispute_id, &user_client);
    for _i in 0..12 {
        let voter = Address::generate(&env);
        client.cast_vote(&dispute_id, &voter, &VoteChoice::Client, &String::from_str(&env, "Vote"));
    }

    // This should be final resolution
    let result = client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);
    assert_eq!(result, DisputeStatus::FinalResolution);

    let dispute = client.get_dispute(&dispute_id);
    assert_eq!(dispute.appeal_count, 2);
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_appeal_before_resolution_fails() {
    let (env, dispute_contract_id, _escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, _token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Issue"),
        &3u32,
        &0,
        &token_address,
    );

    // Try to appeal before any resolution - should fail
    client.raise_appeal(&dispute_id, &user_client);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_appeal_after_deadline_fails() {
    let (env, dispute_contract_id, escrow_contract_id) = setup_env();
    let client = DisputeContractClient::new(&env, &dispute_contract_id);

    let (token_address, _token_admin) = create_token(&env);
    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Issue"),
        &3u32,
        &0,
        &token_address,
    );

    // Vote and resolve
    for _i in 0..3 {
        let voter = Address::generate(&env);
        client.cast_vote(&dispute_id, &voter, &VoteChoice::Freelancer, &String::from_str(&env, "Vote"));
    }
    client.resolve_dispute(&dispute_id, &escrow_contract_id, &false);

    // Jump past appeal deadline (100 ledgers)
    env.ledger().with_mut(|li| {
        li.sequence_number += 101;
    });

    // Try to appeal after deadline - should fail
    client.raise_appeal(&dispute_id, &user_client);
}
