ALTER TABLE members ADD COLUMN telegram_username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_telegram_username ON members(telegram_username) WHERE telegram_username IS NOT NULL;