-- Create user_bank_accounts table to store user's saved bank accounts
CREATE TABLE IF NOT EXISTS user_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Ensure one account number per user (can't save same account twice)
  UNIQUE(user_id, account_number, bank_code)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_bank_accounts_user_id ON user_bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bank_accounts_user_id_default ON user_bank_accounts(user_id, is_default) WHERE is_default = true;

-- Enable RLS
ALTER TABLE user_bank_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only view their own bank accounts
CREATE POLICY "Users can view their own bank accounts"
  ON user_bank_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own bank accounts
CREATE POLICY "Users can insert their own bank accounts"
  ON user_bank_accounts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own bank accounts
CREATE POLICY "Users can update their own bank accounts"
  ON user_bank_accounts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own bank accounts
CREATE POLICY "Users can delete their own bank accounts"
  ON user_bank_accounts
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_bank_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE TRIGGER update_user_bank_accounts_updated_at
  BEFORE UPDATE ON user_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_user_bank_accounts_updated_at();

-- Function to ensure only one default account per user
CREATE OR REPLACE FUNCTION ensure_single_default_bank_account()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting this account as default, unset all other defaults for this user
  IF NEW.is_default = true THEN
    UPDATE user_bank_accounts
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to ensure single default account
CREATE TRIGGER ensure_single_default_bank_account_trigger
  BEFORE INSERT OR UPDATE ON user_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_bank_account();

-- Add comment
COMMENT ON TABLE user_bank_accounts IS 'Stores user saved bank accounts for withdrawals';
COMMENT ON COLUMN user_bank_accounts.is_default IS 'Only one account can be default per user';
COMMENT ON COLUMN user_bank_accounts.is_verified IS 'Whether the account has been verified via Flutterwave';










