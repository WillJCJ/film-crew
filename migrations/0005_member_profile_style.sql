ALTER TABLE members ADD COLUMN profile_color TEXT;
ALTER TABLE members ADD COLUMN profile_emoji TEXT;

UPDATE members
SET
  profile_color = COALESCE(profile_color, '#3E8F3B'),
  profile_emoji = COALESCE(profile_emoji, '🎬');
