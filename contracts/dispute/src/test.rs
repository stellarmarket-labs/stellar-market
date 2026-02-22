#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, String};

#[test]
fn test_raise_dispute() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, DisputeContract);
    let client = DisputeContractClient::new(&env, &contract_id);

    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Work not delivered"),
        &3u32,
    );

    assert_eq!(dispute_id, 1);

    let dispute = client.get_dispute(&dispute_id);
    assert_eq!(dispute.job_id, 1);
    assert_eq!(dispute.status, DisputeStatus::Open);
    assert_eq!(dispute.min_votes, 3);
}

#[test]
fn test_vote_and_resolve() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, DisputeContract);
    let client = DisputeContractClient::new(&env, &contract_id);

    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);
    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let voter3 = Address::generate(&env);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &freelancer,
        &String::from_str(&env, "Payment not released"),
        &3u32,
    );

    // 3 voters: 2 for freelancer, 1 for client
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

    let result = client.resolve_dispute(&dispute_id);
    assert_eq!(result, DisputeStatus::ResolvedForFreelancer);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_resolve_without_enough_votes() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, DisputeContract);
    let client = DisputeContractClient::new(&env, &contract_id);

    let user_client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    let dispute_id = client.raise_dispute(
        &1u64,
        &user_client,
        &freelancer,
        &user_client,
        &String::from_str(&env, "Issue"),
        &3u32,
    );

    // Only 1 vote, need 3
    let voter = Address::generate(&env);
    client.cast_vote(
        &dispute_id,
        &voter,
        &VoteChoice::Client,
        &String::from_str(&env, "Reason"),
    );

    client.resolve_dispute(&dispute_id); // Should panic
}
