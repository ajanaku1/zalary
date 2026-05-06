export interface Employee {
  walletAddress: string;
  displayName?: string;
  email?: string;
  status: 'active' | 'pending_verification' | 'inactive';
  worldIdVerified: boolean;
  addedAt: number;
  lastPaidAt: number | null;
  avatarColor: string;
  initials: string;
}

export interface PayrollRun {
  id: string;
  timestamp: number;
  status: 'pending' | 'processing' | 'confirmed' | 'failed';
  transactionSignature: string | null;
  employeeCount: number;
}

export interface PaymentRecord {
  timestamp: number;
  amount: number;
  txSignature: string;
  type: 'salary' | 'bonus' | 'reimbursement';
}

export type PayrollStep = 'review' | 'confirm' | 'processing' | 'success';

export type AppView = 'landing' | 'employer' | 'employee';
