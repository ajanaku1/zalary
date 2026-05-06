use anchor_lang::prelude::*;

#[error_code]
pub enum ZalaryError {
    #[msg("You are not authorized to perform this action")]
    Unauthorized,

    #[msg("Organization name too long (max 64 characters)")]
    NameTooLong,

    #[msg("Employee is not active")]
    EmployeeNotActive,

    #[msg("Employee is already active")]
    EmployeeAlreadyActive,

    #[msg("Insufficient funds in treasury")]
    InsufficientFunds,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("No active employees for payroll")]
    NoActiveEmployees,

    #[msg("Payroll already processed")]
    PayrollAlreadyProcessed,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Organization payroll is paused")]
    OrganizationPaused,
}
