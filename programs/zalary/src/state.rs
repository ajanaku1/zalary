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
