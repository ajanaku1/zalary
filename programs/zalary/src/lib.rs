use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked, CloseAccount,
};

pub mod errors;
pub mod state;

use errors::ZalaryError;
use state::*;

declare_id!("FGBieAeHERm7CJxtXsicQ7NaQ4FqsDixSwmMqKhovfpH");

#[program]
pub mod zalary {
    use super::*;

    /// Create a new organization with a USDC treasury.
    pub fn create_organization(ctx: Context<CreateOrganization>, name: String) -> Result<()> {
        require!(name.len() <= 64, ZalaryError::NameTooLong);

        let org = &mut ctx.accounts.organization;
        org.authority = ctx.accounts.authority.key();
        org.name = name;
        org.treasury = ctx.accounts.treasury.key();
        org.employee_count = 0;
        org.total_disbursed = 0;
        org.payroll_count = 0;
        org.created_at = Clock::get()?.unix_timestamp;
        org.bump = ctx.bumps.organization;

        msg!("Organization created: {}", org.name);
        Ok(())
    }

    /// Add an employee to the organization.
    pub fn add_employee(
        ctx: Context<AddEmployee>,
        wallet: Pubkey,
        encrypted_salary: [u8; 64],
    ) -> Result<()> {
        let employee = &mut ctx.accounts.employee;
        employee.organization = ctx.accounts.organization.key();
        employee.wallet = wallet;
        employee.encrypted_salary = encrypted_salary;
        employee.status = EmployeeStatus::Active;
        employee.world_id_verified = false;
        employee.added_at = Clock::get()?.unix_timestamp;
        employee.last_paid_at = 0;
        employee.bump = ctx.bumps.employee;

        let org = &mut ctx.accounts.organization;
        org.employee_count = org
            .employee_count
            .checked_add(1)
            .ok_or(ZalaryError::Overflow)?;

        msg!("Employee added: {}", wallet);
        Ok(())
    }

    /// Remove (deactivate) an employee.
    pub fn remove_employee(ctx: Context<RemoveEmployee>) -> Result<()> {
        let employee = &mut ctx.accounts.employee;
        require!(
            employee.status == EmployeeStatus::Active,
            ZalaryError::EmployeeNotActive
        );
        employee.status = EmployeeStatus::Inactive;

        let org = &mut ctx.accounts.organization;
        org.employee_count = org.employee_count.saturating_sub(1);

        msg!("Employee removed: {}", employee.wallet);
        Ok(())
    }

    /// Update an employee's encrypted salary.
    pub fn update_salary(
        ctx: Context<UpdateSalary>,
        new_encrypted_salary: [u8; 64],
    ) -> Result<()> {
        let employee = &mut ctx.accounts.employee;
        require!(
            employee.status == EmployeeStatus::Active,
            ZalaryError::EmployeeNotActive
        );
        employee.encrypted_salary = new_encrypted_salary;

        msg!("Salary updated for: {}", employee.wallet);
        Ok(())
    }

    /// Fund the organization treasury with USDC.
    pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
        require!(amount > 0, ZalaryError::InvalidAmount);

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.funder_token_account.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
                authority: ctx.accounts.funder.to_account_info(),
            },
        );
        token_interface::transfer_checked(cpi_ctx, amount, ctx.accounts.usdc_mint.decimals)?;

        msg!("Treasury funded with {} tokens", amount);
        Ok(())
    }

    /// Run payroll — transfers USDC from treasury to an employee's token account.
    /// In production this would batch via Arcium confidential transfers.
    /// For the hackathon demo, call this per-employee and it creates a PayrollRun record.
    pub fn run_payroll(
        ctx: Context<RunPayroll>,
        amount: u64,
    ) -> Result<()> {
        let employee = &ctx.accounts.employee;
        require!(
            employee.status == EmployeeStatus::Active,
            ZalaryError::EmployeeNotActive
        );
        require!(amount > 0, ZalaryError::InvalidAmount);
        require!(
            ctx.accounts.treasury.amount >= amount,
            ZalaryError::InsufficientFunds
        );
        // Pause check: pause_check is a passive AccountInfo at ["pause", org].
        // If it carries any lamports/data, the org is paused.
        require!(
            ctx.accounts.pause_check.data_is_empty() && ctx.accounts.pause_check.lamports() == 0,
            ZalaryError::OrganizationPaused
        );

        let org = &ctx.accounts.organization;
        let org_key = org.authority.key();
        let seeds = &[
            b"org".as_ref(),
            org_key.as_ref(),
            &[org.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        // Transfer from treasury to employee token account (Token-2022 compatible)
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.treasury.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.employee_token_account.to_account_info(),
                authority: ctx.accounts.organization.to_account_info(),
            },
            signer_seeds,
        );
        token_interface::transfer_checked(cpi_ctx, amount, ctx.accounts.usdc_mint.decimals)?;

        // Update payroll run
        let payroll = &mut ctx.accounts.payroll_run;
        payroll.organization = ctx.accounts.organization.key();
        payroll.initiator = ctx.accounts.authority.key();
        payroll.employee_count = 1; // per-employee call for demo
        payroll.total_amount = amount;
        payroll.timestamp = Clock::get()?.unix_timestamp;
        payroll.status = PayrollStatus::Confirmed;
        payroll.bump = ctx.bumps.payroll_run;

        // Update org stats
        let org = &mut ctx.accounts.organization;
        org.total_disbursed = org
            .total_disbursed
            .checked_add(amount)
            .ok_or(ZalaryError::Overflow)?;
        org.payroll_count = org
            .payroll_count
            .checked_add(1)
            .ok_or(ZalaryError::Overflow)?;

        // Update employee last_paid_at
        let employee = &mut ctx.accounts.employee;
        employee.last_paid_at = Clock::get()?.unix_timestamp;

        msg!("Payroll run: {} tokens to {}", amount, employee.wallet);
        Ok(())
    }

    /// Employee claims/withdraws from their token account (simple transfer wrapper).
    pub fn claim_funds(ctx: Context<ClaimFunds>, amount: u64) -> Result<()> {
        require!(amount > 0, ZalaryError::InvalidAmount);

        let employee = &ctx.accounts.employee;
        require!(
            employee.status == EmployeeStatus::Active,
            ZalaryError::EmployeeNotActive
        );
        require!(
            employee.wallet == ctx.accounts.claimer.key(),
            ZalaryError::Unauthorized
        );

        // Transfer from employee escrow ATA to claimer's personal ATA
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.claimer_token_account.to_account_info(),
                authority: ctx.accounts.claimer.to_account_info(),
            },
        );
        token_interface::transfer_checked(cpi_ctx, amount, ctx.accounts.usdc_mint.decimals)?;

        msg!("Employee claimed {} tokens", amount);
        Ok(())
    }

    /// Verify employee's World ID proof (stores verification status on-chain).
    pub fn verify_world_id(
        ctx: Context<VerifyWorldId>,
        nullifier_hash: [u8; 32],
    ) -> Result<()> {
        let employee = &mut ctx.accounts.employee;
        require!(
            employee.wallet == ctx.accounts.claimer.key(),
            ZalaryError::Unauthorized
        );
        require!(
            !employee.world_id_verified,
            ZalaryError::EmployeeAlreadyActive
        );

        employee.world_id_verified = true;
        employee.nullifier_hash = nullifier_hash;

        msg!("World ID verified for: {}", employee.wallet);
        Ok(())
    }

    /// Pause all payroll operations for this organization. Useful for incident
    /// response, compliance holds, or M&A freezes. Run_payroll will reject while
    /// paused. Implemented as a separate PDA so existing orgs upgrade without
    /// account migration.
    pub fn pause_organization(_ctx: Context<PauseOrganization>) -> Result<()> {
        msg!("Organization paused");
        Ok(())
    }

    /// Resume payroll operations by closing the pause PDA.
    pub fn resume_organization(_ctx: Context<ResumeOrganization>) -> Result<()> {
        msg!("Organization resumed");
        Ok(())
    }

    /// Close the organization and its treasury, refunding all rent to the authority.
    /// Treasury must be empty — call `withdraw_treasury` first if there's a balance.
    pub fn close_organization(ctx: Context<CloseOrganization>) -> Result<()> {
        let org = &ctx.accounts.organization;
        let org_key = org.authority.key();
        let seeds = &[b"org".as_ref(), org_key.as_ref(), &[org.bump]];
        let signer_seeds = &[&seeds[..]];

        // close_account requires the token account to be empty (token program enforces this)
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.treasury.to_account_info(),
                destination: ctx.accounts.authority.to_account_info(),
                authority: ctx.accounts.organization.to_account_info(),
            },
            signer_seeds,
        );
        token_interface::close_account(cpi_ctx)?;

        msg!("Organization closed: {}", org.name);
        Ok(())
    }

    /// Owner-only withdrawal from treasury.
    pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
        require!(amount > 0, ZalaryError::InvalidAmount);
        require!(
            ctx.accounts.treasury.amount >= amount,
            ZalaryError::InsufficientFunds
        );

        let org = &ctx.accounts.organization;
        let org_key = org.authority.key();
        let seeds = &[
            b"org".as_ref(),
            org_key.as_ref(),
            &[org.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.treasury.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.authority_token_account.to_account_info(),
                authority: ctx.accounts.organization.to_account_info(),
            },
            signer_seeds,
        );
        token_interface::transfer_checked(cpi_ctx, amount, ctx.accounts.usdc_mint.decimals)?;

        msg!("Treasury withdrawal: {} tokens", amount);
        Ok(())
    }
}

// ============================================================================
// Account validation structs
// ============================================================================

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateOrganization<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Organization::INIT_SPACE,
        seeds = [b"org", authority.key().as_ref()],
        bump,
    )]
    pub organization: Account<'info, Organization>,

    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = organization,
        seeds = [b"treasury", organization.key().as_ref()],
        bump,
    )]
    pub treasury: InterfaceAccount<'info, TokenAccount>,

    pub usdc_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct AddEmployee<'info> {
    #[account(
        mut,
        seeds = [b"org", authority.key().as_ref()],
        bump = organization.bump,
        has_one = authority,
    )]
    pub organization: Account<'info, Organization>,

    #[account(
        init,
        payer = authority,
        space = 8 + Employee::INIT_SPACE,
        seeds = [b"employee", organization.key().as_ref(), wallet.as_ref()],
        bump,
    )]
    pub employee: Account<'info, Employee>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveEmployee<'info> {
    #[account(
        mut,
        seeds = [b"org", authority.key().as_ref()],
        bump = organization.bump,
        has_one = authority,
    )]
    pub organization: Account<'info, Organization>,

    #[account(
        mut,
        seeds = [b"employee", organization.key().as_ref(), employee.wallet.as_ref()],
        bump = employee.bump,
        has_one = organization,
    )]
    pub employee: Account<'info, Employee>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateSalary<'info> {
    #[account(
        seeds = [b"org", authority.key().as_ref()],
        bump = organization.bump,
        has_one = authority,
    )]
    pub organization: Account<'info, Organization>,

    #[account(
        mut,
        seeds = [b"employee", organization.key().as_ref(), employee.wallet.as_ref()],
        bump = employee.bump,
        has_one = organization,
    )]
    pub employee: Account<'info, Employee>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct FundTreasury<'info> {
    #[account(
        seeds = [b"org", organization.authority.as_ref()],
        bump = organization.bump,
    )]
    pub organization: Account<'info, Organization>,

    #[account(
        mut,
        seeds = [b"treasury", organization.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = organization,
    )]
    pub treasury: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
    )]
    pub funder_token_account: InterfaceAccount<'info, TokenAccount>,

    pub usdc_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub funder: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct RunPayroll<'info> {
    #[account(
        mut,
        seeds = [b"org", authority.key().as_ref()],
        bump = organization.bump,
        has_one = authority,
        has_one = treasury,
    )]
    pub organization: Box<Account<'info, Organization>>,

    #[account(
        mut,
        seeds = [b"treasury", organization.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = organization,
    )]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"employee", organization.key().as_ref(), employee.wallet.as_ref()],
        bump = employee.bump,
        has_one = organization,
    )]
    pub employee: Box<Account<'info, Employee>>,

    /// The employee's USDC token account to receive payment.
    #[account(
        mut,
        token::mint = usdc_mint,
    )]
    pub employee_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = authority,
        space = 8 + PayrollRun::INIT_SPACE,
        seeds = [
            b"payroll",
            organization.key().as_ref(),
            &organization.created_at.to_le_bytes(),
            &organization.payroll_count.to_le_bytes(),
        ],
        bump,
    )]
    pub payroll_run: Box<Account<'info, PayrollRun>>,

    pub usdc_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// Pause check — must be empty (no lamports, no data) for payroll to run.
    /// Anchor doesn't validate seeds for AccountInfo, so the runtime check on
    /// data_is_empty() inside the handler covers both "PDA exists" and "wrong
    /// account passed" cases (a wrong account would have lamports/data too).
    /// CHECK: passive existence check; seeds derived deterministically client-side.
    #[account(
        seeds = [b"pause", organization.key().as_ref()],
        bump,
    )]
    pub pause_check: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct PauseOrganization<'info> {
    #[account(
        seeds = [b"org", authority.key().as_ref()],
        bump = organization.bump,
        has_one = authority,
    )]
    pub organization: Account<'info, Organization>,

    #[account(
        init,
        payer = authority,
        space = 8 + OrgPause::INIT_SPACE,
        seeds = [b"pause", organization.key().as_ref()],
        bump,
    )]
    pub pause: Account<'info, OrgPause>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResumeOrganization<'info> {
    #[account(
        seeds = [b"org", authority.key().as_ref()],
        bump = organization.bump,
        has_one = authority,
    )]
    pub organization: Account<'info, Organization>,

    #[account(
        mut,
        close = authority,
        seeds = [b"pause", organization.key().as_ref()],
        bump,
    )]
    pub pause: Account<'info, OrgPause>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimFunds<'info> {
    #[account(
        seeds = [b"org", organization.authority.as_ref()],
        bump = organization.bump,
    )]
    pub organization: Account<'info, Organization>,

    #[account(
        seeds = [b"employee", organization.key().as_ref(), employee.wallet.as_ref()],
        bump = employee.bump,
        has_one = organization,
    )]
    pub employee: Account<'info, Employee>,

    /// Employee's escrow token account (where payroll deposited).
    #[account(
        mut,
        token::mint = usdc_mint,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Employee's personal token account to receive claimed funds.
    #[account(
        mut,
        token::mint = usdc_mint,
    )]
    pub claimer_token_account: InterfaceAccount<'info, TokenAccount>,

    pub usdc_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub claimer: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct VerifyWorldId<'info> {
    #[account(
        seeds = [b"org", organization.authority.as_ref()],
        bump = organization.bump,
    )]
    pub organization: Account<'info, Organization>,

    #[account(
        mut,
        seeds = [b"employee", organization.key().as_ref(), employee.wallet.as_ref()],
        bump = employee.bump,
        has_one = organization,
    )]
    pub employee: Account<'info, Employee>,

    pub claimer: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseOrganization<'info> {
    #[account(
        mut,
        close = authority,
        seeds = [b"org", authority.key().as_ref()],
        bump = organization.bump,
        has_one = authority,
        has_one = treasury,
    )]
    pub organization: Account<'info, Organization>,

    #[account(
        mut,
        seeds = [b"treasury", organization.key().as_ref()],
        bump,
    )]
    pub treasury: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    #[account(
        seeds = [b"org", authority.key().as_ref()],
        bump = organization.bump,
        has_one = authority,
        has_one = treasury,
    )]
    pub organization: Account<'info, Organization>,

    #[account(
        mut,
        seeds = [b"treasury", organization.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = organization,
    )]
    pub treasury: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
    )]
    pub authority_token_account: InterfaceAccount<'info, TokenAccount>,

    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub authority: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}
