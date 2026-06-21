use crate::{ReputationContract, ReputationContractClient, DataKey, UserReputation};
use soroban_sdk::{testutils::Address as _, Address, Env, String, vec};

#[test]
fn test_leaderboard_1000_users() {
    let env = Env::default();
    env.mock_all_auths();
    
    let reputation_id = env.register_contract(None, ReputationContract);
    let client = ReputationContractClient::new(&env, &reputation_id);
    
    let admin = Address::generate(&env);
    client.initialize(&vec![&env, admin.clone()], &1, &0);
    
    // Simulate updating the leaderboard by manipulating the persistent storage directly 
    // instead of submitting 1000 actual reviews (which would be very slow and complex).
    env.as_contract(&reputation_id, || {
        for i in 0..1000 {
            let addr = Address::generate(&env);
            let user_score = (i * 10) as u64; // Scores: 0, 10, 20, ..., 9990
            
            // Set the reputation
            env.storage().persistent().set(
                &DataKey::Reputation(addr.clone()),
                &UserReputation {
                    user: addr.clone(),
                    total_score: user_score,
                    total_weight: 1,
                    review_count: 1,
                    last_updated_ledger: env.ledger().timestamp() as u32,
                },
            );
            
            // Note: we can't easily call private `update_leaderboard` from test directly unless we expose it.
            // But we can trigger it via a mock dispute or by inserting directly using the sparse index format.
            
            // For testing the sparse index, we just populate the index directly
            let entry_key = (soroban_sdk::Symbol::new(&env, "lb"), u128::MAX - (user_score as u128), addr.clone());
            let user_key = (soroban_sdk::Symbol::new(&env, "lb_rev"), addr.clone());
            
            env.storage().persistent().set(&entry_key, &user_score);
            env.storage().persistent().set(&user_key, &user_score);
        }
    });

    let top_10 = client.get_leaderboard(&10);
    assert_eq!(top_10.len(), 10);
    
    // Scores should be 9990, 9980, 9970, ..., 9900
    for (i, (_, score)) in top_10.into_iter().enumerate() {
        assert_eq!(score, 9990 - (i as u64 * 10));
    }
}
