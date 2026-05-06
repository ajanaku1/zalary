use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Organization {
    pub authority: Pubkey,
    #[max_len(64)]
    pub name: String,
    pub treasury: Pubkey,
    pub employee_count: u32,
    pub total_disbursed: u64,
    pub payroll_count: u32,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Employee {
    pub organization: Pubkey,
    pub wallet: Pubkey,
    pub encrypted_salary: [u8; 64],
    pub status: EmployeeStatus,
    pub world_id_verified: bool,
    pub nullifier_hash: [u8; 32],
    pub added_at: i64,
    pub last_paid_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PayrollRun {
    pub organization: Pubkey,
    pub initiator: Pubkey,
    pub employee_count: u32,
    pub total_amount: u64,
    pub timestamp: i64,
    pub status: PayrollStatus,
    pub bump: u8,
}

/// Empty marker account — its existence at ["pause", org_pda] pauses the org.
/// No fields. The 8-byte discriminator is the entire account state.
#[account]
#[derive(InitSpace)]
pub struct OrgPause {}

/// Designated auditor / viewing key for the org. Compliance primitive: the
/// authority can name a third party (tax authority, internal audit, regulator)
/// who would receive selective-disclosure decryption rights when the Token-2022
/// ConfidentialTransfer auditor-key wiring is enabled. Lives at
/// ["auditor", org_pda].
#[account]
#[derive(InitSpace)]
pub struct OrgAuditor {
    pub auditor: Pubkey,
    pub set_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum EmployeeStatus {
    Active,
    Pending,
    Inactive,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum PayrollStatus {
    Pending,
    Processing,
    Confirmed,
    Failed,
}
