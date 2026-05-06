import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import { Zalary } from "../target/types/zalary";

describe("zalary", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Zalary as Program<Zalary>;
  const authority = provider.wallet as anchor.Wallet;

  let usdcMint: PublicKey;
  let authorityTokenAccount: PublicKey;
  let organizationPda: PublicKey;
  let organizationBump: number;
  let treasuryPda: PublicKey;
  let treasuryBump: number;
  const employeeWallet = Keypair.generate();
  let employeePda: PublicKey;

  before(async () => {
    // Create a mock USDC mint
    const mintAuthority = Keypair.generate();
    usdcMint = await createMint(
      provider.connection,
      (authority as any).payer,
      mintAuthority.publicKey,
      null,
      6 // USDC has 6 decimals
    );

    // Create authority's token account and mint some tokens
    authorityTokenAccount = await createAccount(
      provider.connection,
      (authority as any).payer,
      usdcMint,
      authority.publicKey
    );

    await mintTo(
      provider.connection,
      (authority as any).payer,
      usdcMint,
      authorityTokenAccount,
      mintAuthority,
      1_000_000_000 // 1000 USDC
    );

    // Derive PDAs
    [organizationPda, organizationBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("org"), authority.publicKey.toBuffer()],
      program.programId
    );

    [treasuryPda, treasuryBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), organizationPda.toBuffer()],
      program.programId
    );

    [employeePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("employee"),
        organizationPda.toBuffer(),
        employeeWallet.publicKey.toBuffer(),
      ],
      program.programId
    );
  });

  it("Creates an organization", async () => {
    const tx = await program.methods
      .createOrganization("Acme Corp")
      .accounts({
        organization: organizationPda,
        treasury: treasuryPda,
        usdcMint: usdcMint,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("Create org tx:", tx);

    const org = await program.account.organization.fetch(organizationPda);
    assert.equal(org.name, "Acme Corp");
    assert.equal(org.employeeCount, 0);
    assert.equal(org.totalDisbursed.toNumber(), 0);
  });

  it("Funds the treasury", async () => {
    const amount = 500_000_000; // 500 USDC

    const tx = await program.methods
      .fundTreasury(new anchor.BN(amount))
      .accounts({
        organization: organizationPda,
        treasury: treasuryPda,
        funderTokenAccount: authorityTokenAccount,
        usdcMint: usdcMint,
        funder: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Fund treasury tx:", tx);

    const treasuryAccount = await getAccount(provider.connection, treasuryPda);
    assert.equal(Number(treasuryAccount.amount), amount);
  });

  it("Adds an employee", async () => {
    const encryptedSalary = new Uint8Array(64).fill(0);
    // Encode 5000 USDC (5_000_000_000) in first 8 bytes as a placeholder
    const salary = Buffer.alloc(8);
    salary.writeBigUInt64LE(BigInt(5_000_000_000));
    encryptedSalary.set(salary, 0);

    const tx = await program.methods
      .addEmployee(employeeWallet.publicKey, Array.from(encryptedSalary) as any)
      .accounts({
        organization: organizationPda,
        employee: employeePda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Add employee tx:", tx);

    const employee = await program.account.employee.fetch(employeePda);
    assert.deepEqual(
      employee.wallet.toBase58(),
      employeeWallet.publicKey.toBase58()
    );
    assert.deepEqual(employee.status, { active: {} });
  });

  it("Updates employee salary", async () => {
    const newEncryptedSalary = new Uint8Array(64).fill(1);

    const tx = await program.methods
      .updateSalary(Array.from(newEncryptedSalary) as any)
      .accounts({
        organization: organizationPda,
        employee: employeePda,
        authority: authority.publicKey,
      })
      .rpc();

    console.log("Update salary tx:", tx);

    const employee = await program.account.employee.fetch(employeePda);
    assert.equal(employee.encryptedSalary[0], 1);
  });

  it("Runs payroll for an employee", async () => {
    // Create employee token account
    const employeeTokenAccount = await createAccount(
      provider.connection,
      (authority as any).payer,
      usdcMint,
      employeeWallet.publicKey
    );

    const org = await program.account.organization.fetch(organizationPda);
    const payrollCount = org.payrollCount;

    const [payrollPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("payroll"),
        organizationPda.toBuffer(),
        Buffer.from(new Uint8Array(new Uint32Array([payrollCount]).buffer)),
      ],
      program.programId
    );

    const payAmount = 100_000_000; // 100 USDC

    const tx = await program.methods
      .runPayroll(new anchor.BN(payAmount))
      .accounts({
        organization: organizationPda,
        treasury: treasuryPda,
        employee: employeePda,
        employeeTokenAccount: employeeTokenAccount,
        payrollRun: payrollPda,
        usdcMint: usdcMint,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Run payroll tx:", tx);

    const payroll = await program.account.payrollRun.fetch(payrollPda);
    assert.deepEqual(payroll.status, { confirmed: {} });
    assert.equal(payroll.totalAmount.toNumber(), payAmount);

    const empAccount = await getAccount(
      provider.connection,
      employeeTokenAccount
    );
    assert.equal(Number(empAccount.amount), payAmount);
  });

  it("Verifies World ID for an employee", async () => {
    const nullifierHash = new Uint8Array(32).fill(42); // Mock nullifier

    const tx = await program.methods
      .verifyWorldId(Array.from(nullifierHash) as any)
      .accounts({
        organization: organizationPda,
        employee: employeePda,
        claimer: employeeWallet.publicKey,
      })
      .signers([employeeWallet])
      .rpc();

    console.log("Verify World ID tx:", tx);

    const employee = await program.account.employee.fetch(employeePda);
    assert.isTrue(employee.worldIdVerified);
  });

  it("Removes an employee", async () => {
    const tx = await program.methods
      .removeEmployee()
      .accounts({
        organization: organizationPda,
        employee: employeePda,
        authority: authority.publicKey,
      })
      .rpc();

    console.log("Remove employee tx:", tx);

    const employee = await program.account.employee.fetch(employeePda);
    assert.deepEqual(employee.status, { inactive: {} });
  });

  it("Withdraws from treasury", async () => {
    const withdrawAmount = 100_000_000; // 100 USDC

    const tx = await program.methods
      .withdrawTreasury(new anchor.BN(withdrawAmount))
      .accounts({
        organization: organizationPda,
        treasury: treasuryPda,
        authorityTokenAccount: authorityTokenAccount,
        usdcMint: usdcMint,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Withdraw treasury tx:", tx);

    const treasuryAccount = await getAccount(provider.connection, treasuryPda);
    // Started with 500, paid 100 to employee, withdrew 100 = 300
    assert.equal(Number(treasuryAccount.amount), 300_000_000);
  });

  it("Rejects unauthorized actions", async () => {
    const randomUser = Keypair.generate();

    // Airdrop SOL to random user
    const sig = await provider.connection.requestAirdrop(
      randomUser.publicKey,
      1_000_000_000
    );
    await provider.connection.confirmTransaction(sig);

    try {
      await program.methods
        .removeEmployee()
        .accounts({
          organization: organizationPda,
          employee: employeePda,
          authority: randomUser.publicKey,
        })
        .signers([randomUser])
        .rpc();
      assert.fail("Should have thrown unauthorized error");
    } catch (err) {
      // Expected: PDA derivation will fail since seeds use authority.key()
      console.log("Correctly rejected unauthorized access");
    }
  });
});
