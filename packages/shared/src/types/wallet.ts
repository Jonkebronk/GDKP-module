export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'BID_LOCK'
  | 'BID_RELEASE'
  | 'AUCTION_WIN'
  | 'POT_PAYOUT'
  | 'ADMIN_ADJUST';

export type TransactionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  gold_amount: number;
  real_amount: number | null;
  currency: string | null;
  exchange_rate: number | null;
  paypal_transaction_id: string | null;
  paypal_order_id: string | null;
  status: TransactionStatus;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  completed_at: Date | null;
  error_message: string | null;
}

export interface WalletBalance {
  balance: number;
  locked_amount: number;
  available_balance: number;
  pending_deposits: number;
  pending_withdrawals: number;
}

export interface CreateDepositInput {
  amount: number;
  currency: 'SEK' | 'EUR' | 'USD';
}

export interface CreateDepositResult {
  order_id: string;
  approve_url: string;
  gold_amount: number;
  exchange_rate: number;
}

export interface CreateWithdrawalInput {
  gold_amount: number;
}

export interface CreateWithdrawalResult {
  transaction_id: string;
  real_amount: number;
  currency: string;
  status: TransactionStatus;
}

export interface ExchangeRates {
  SEK: number;
  EUR: number;
  USD: number;
  updated_at: Date;
}
