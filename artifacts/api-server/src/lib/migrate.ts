import { getPool, query, row, exec, run } from "./pg";
import { logger } from "./logger";

async function ddl(sql: string): Promise<void> {
  await getPool().query(sql.trim());
}

async function createSchema(): Promise<void> {
  // ── Core tables ───────────────────────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS users (
      id                    SERIAL PRIMARY KEY,
      name                  VARCHAR(255) NOT NULL,
      email                 VARCHAR(255) UNIQUE NOT NULL,
      password_hash         VARCHAR(255) NOT NULL,
      phone                 VARCHAR(50),
      handicap              DECIMAL(4,1),
      role                  VARCHAR(20) NOT NULL DEFAULT 'golfer'
                              CHECK (role IN ('golfer','club_admin','advertiser')),
      created_at            TIMESTAMP DEFAULT NOW(),
      profile_picture       TEXT,
      push_token            VARCHAR(255),
      club_id               INT,
      gender                VARCHAR(30) CHECK (gender IN ('male','female','prefer_not_to_say')),
      date_of_birth         DATE,
      home_province         VARCHAR(100),
      hna_number            VARCHAR(50),
      student_number        VARCHAR(100),
      is_private            SMALLINT NOT NULL DEFAULT 0,
      analytics_consent     SMALLINT NOT NULL DEFAULT 1,
      is_super_user         SMALLINT NOT NULL DEFAULT 0,
      hna_locked            SMALLINT NOT NULL DEFAULT 0,
      student_number_locked SMALLINT NOT NULL DEFAULT 0
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS clubs (
      id                SERIAL PRIMARY KEY,
      name              VARCHAR(255) NOT NULL,
      location          VARCHAR(255) NOT NULL,
      province          VARCHAR(100) NOT NULL,
      image_url         VARCHAR(500),
      holes             INT DEFAULT 18,
      price_from        DECIMAL(10,2),
      facilities        JSONB,
      featured          SMALLINT DEFAULT 0,
      active            SMALLINT DEFAULT 1,
      created_at        TIMESTAMP DEFAULT NOW(),
      latitude          DECIMAL(10,7),
      longitude         DECIMAL(10,7),
      cart_available    SMALLINT NOT NULL DEFAULT 0,
      cart_compulsory   SMALLINT NOT NULL DEFAULT 0,
      cart_price        DECIMAL(10,2),
      geofence_enabled  SMALLINT NOT NULL DEFAULT 0,
      geofence_radius_m INT NOT NULL DEFAULT 200,
      ninth_tee_lat     DECIMAL(10,7),
      ninth_tee_lng     DECIMAL(10,7),
      ninth_tee_radius_m INT NOT NULL DEFAULT 50,
      website           VARCHAR(500),
      logo_url          VARCHAR(500),
      username          VARCHAR(100) UNIQUE,
      password_hash     VARCHAR(255),
      description       TEXT,
      phone             VARCHAR(50),
      email             VARCHAR(255),
      address           VARCHAR(500)
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS bookings (
      id              SERIAL PRIMARY KEY,
      user_id         INT NOT NULL REFERENCES users(id),
      tee_time_id     INT,
      players         INT NOT NULL DEFAULT 1,
      split_bill      SMALLINT DEFAULT 0,
      total_amount    DECIMAL(10,2) NOT NULL,
      my_amount       DECIMAL(10,2) NOT NULL,
      booking_ref     VARCHAR(20) UNIQUE NOT NULL,
      payment_method  VARCHAR(50) DEFAULT 'payfast',
      status          VARCHAR(20) DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','cancelled','completed')),
      created_at      TIMESTAMP DEFAULT NOW(),
      holes           SMALLINT DEFAULT 18,
      voucher_code    VARCHAR(50),
      discount_amount DECIMAL(10,2) DEFAULT 0,
      cart_fee        DECIMAL(10,2) NOT NULL DEFAULT 0,
      platform_fee    DECIMAL(10,2) DEFAULT 0,
      club_amount     DECIMAL(10,2)
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS booking_players (
      id         SERIAL PRIMARY KEY,
      booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      user_id    INT REFERENCES users(id),
      paid       SMALLINT DEFAULT 0,
      amount     DECIMAL(10,2),
      guest_name VARCHAR(100)
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS friendships (
      id           SERIAL PRIMARY KEY,
      requester_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status       VARCHAR(20) DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','declined')),
      created_at   TIMESTAMP DEFAULT NOW(),
      UNIQUE (requester_id, addressee_id)
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS reviews (
      id         SERIAL PRIMARY KEY,
      club_id    INT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      user_id    INT NOT NULL REFERENCES users(id),
      rating     INT NOT NULL,
      comment    TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS club_images (
      id            SERIAL PRIMARY KEY,
      club_id       INT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      url           VARCHAR(1000) NOT NULL,
      caption       VARCHAR(255),
      display_order INT DEFAULT 0,
      created_at    TIMESTAMP DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS ads (
      id         SERIAL PRIMARY KEY,
      user_id    INT,
      club_id    INT,
      title      VARCHAR(255) NOT NULL,
      subtitle   TEXT,
      image_url  VARCHAR(500),
      cta_text   VARCHAR(100),
      link_url   VARCHAR(500),
      placement  VARCHAR(20) DEFAULT 'home'
                   CHECK (placement IN ('home','club','explore')),
      priority   INT DEFAULT 0,
      active     SMALLINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS conversations (
      id            SERIAL PRIMARY KEY,
      name          VARCHAR(255),
      is_group      SMALLINT DEFAULT 0,
      created_by    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at    TIMESTAMP DEFAULT NOW(),
      group_picture TEXT
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS conversation_members (
      id              SERIAL PRIMARY KEY,
      conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at       TIMESTAMP DEFAULT NOW(),
      UNIQUE (conversation_id, user_id)
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS messages (
      id              SERIAL PRIMARY KEY,
      conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content         TEXT NOT NULL,
      created_at      TIMESTAMP DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS vouchers (
      id             SERIAL PRIMARY KEY,
      code           VARCHAR(50) UNIQUE NOT NULL,
      discount_type  VARCHAR(20) NOT NULL
                       CHECK (discount_type IN ('fixed','percentage','wallet_credit')),
      discount_value DECIMAL(10,2) NOT NULL,
      club_id        INT REFERENCES clubs(id) ON DELETE CASCADE,
      min_amount     DECIMAL(10,2) DEFAULT 0,
      max_uses       INT,
      uses_count     INT DEFAULT 0,
      active         SMALLINT DEFAULT 1,
      expires_at     TIMESTAMP,
      created_at     TIMESTAMP DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      id            SERIAL PRIMARY KEY,
      setting_key   VARCHAR(100) UNIQUE NOT NULL,
      setting_value VARCHAR(255) NOT NULL,
      updated_at    TIMESTAMP DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS golf_events (
      id               SERIAL PRIMARY KEY,
      club_id          INT NOT NULL,
      name             VARCHAR(200) NOT NULL,
      description      TEXT,
      event_date       DATE NOT NULL,
      start_time       TIME,
      end_time         TIME,
      event_type       VARCHAR(30) NOT NULL DEFAULT 'other'
                         CHECK (event_type IN ('open_day','competition','corporate','social','other')),
      restriction      VARCHAR(30) NOT NULL DEFAULT 'open'
                         CHECK (restriction IN ('open','members_only','invitation_only')),
      entry_fee        DECIMAL(10,2),
      max_participants INT,
      status           VARCHAR(20) NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','cancelled','completed')),
      created_by       INT NOT NULL,
      created_at       TIMESTAMP DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS club_members (
      id                  SERIAL PRIMARY KEY,
      club_id             INT NOT NULL,
      user_id             INT NOT NULL,
      membership_type     VARCHAR(30) NOT NULL DEFAULT 'standard'
                            CHECK (membership_type IN (
                              'standard','premium','honorary','junior','senior','family','social',
                              'full_member','six_day_member','week_day_member',
                              'pensioner_full','pensioner_six_day','pensioner_week_day',
                              'student_member','junior_member'
                            )),
      status              VARCHAR(20) NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','suspended')),
      added_by            INT NOT NULL,
      created_at          TIMESTAMP DEFAULT NOW(),
      start_date          DATE,
      renewal_date        DATE,
      benefits            TEXT,
      prepaid_rounds      INT NOT NULL DEFAULT 0,
      prepaid_rounds_used INT NOT NULL DEFAULT 0,
      UNIQUE (club_id, user_id)
    )
  `);

  // Roster rows for golfers a club has added who do NOT yet have a TapIn account.
  // These hold the club's HNA claim until the golfer signs up with the matching email,
  // at which point they are promoted to a real club_members row (see auth/register).
  await ddl(`
    CREATE TABLE IF NOT EXISTS pending_memberships (
      id              SERIAL PRIMARY KEY,
      club_id         INT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      email           VARCHAR(255) NOT NULL,
      hna_number      VARCHAR(50),
      membership_type VARCHAR(50) NOT NULL DEFAULT 'standard',
      status          VARCHAR(20) NOT NULL DEFAULT 'active',
      start_date      DATE,
      renewal_date    DATE,
      benefits        TEXT,
      prepaid_rounds  INT NOT NULL DEFAULT 0,
      student_number  VARCHAR(100),
      created_at      TIMESTAMP DEFAULT NOW(),
      UNIQUE (club_id, email)
    )
  `);

  // ── HNA card verifications ─────────────────────────────────────────────────
  // A golfer submits a photo of their physical SA Player ID (HNA) card. A TapIn
  // super-user reviews it and approves/rejects. An APPROVED, non-expired row is one
  // of the two sources that make a golfer's HNA "verified" (see lib/hna.ts).
  await ddl(`
    CREATE TABLE IF NOT EXISTS hna_verifications (
      id            SERIAL PRIMARY KEY,
      user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hna_number    VARCHAR(50) NOT NULL,
      card_image    TEXT NOT NULL,
      status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected')),
      review_note   TEXT,
      reviewed_by   INT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at   TIMESTAMP,
      valid_until   DATE,
      created_at    TIMESTAMP DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS event_registrations (
      id            SERIAL PRIMARY KEY,
      event_id      INT NOT NULL,
      user_id       INT NOT NULL,
      status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected')),
      registered_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (event_id, user_id)
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id         SERIAL PRIMARY KEY,
      user_id    INT NOT NULL,
      type       VARCHAR(50) NOT NULL,
      title      VARCHAR(200) NOT NULL,
      body       TEXT NOT NULL,
      data       JSONB,
      is_read    SMALLINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS club_notifications (
      id               SERIAL PRIMARY KEY,
      club_id          INT NOT NULL,
      sent_by          INT NOT NULL,
      type             VARCHAR(50) NOT NULL,
      title            VARCHAR(200) NOT NULL,
      body             TEXT NOT NULL,
      tee_shift_minutes INT,
      affected_date    DATE,
      recipient_count  INT NOT NULL DEFAULT 0,
      sent_at          TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Portal tables ─────────────────────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS portal_tee_slots (
      id                 SERIAL PRIMARY KEY,
      club_id            INT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      date               DATE NOT NULL,
      tee_time           VARCHAR(5) NOT NULL,
      session_type       VARCHAR(20) NOT NULL CHECK (session_type IN ('AM','PM','Twilight')),
      tee_start_type     VARCHAR(30) NOT NULL DEFAULT '1st Tee'
                           CHECK (tee_start_type IN ('1st Tee','10th Tee','Two-Tee Start')),
      max_players        INT NOT NULL DEFAULT 4,
      weekday_rate_code  VARCHAR(50),
      weekend_rate_code  VARCHAR(50),
      is_active          SMALLINT NOT NULL DEFAULT 1,
      notes              TEXT,
      player_count       INT NOT NULL DEFAULT 0,
      created_at         TIMESTAMP DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS portal_slot_bookings (
      id           SERIAL PRIMARY KEY,
      slot_id      INT NOT NULL REFERENCES portal_tee_slots(id) ON DELETE CASCADE,
      player_name  VARCHAR(255) NOT NULL,
      player_email VARCHAR(255),
      player_phone VARCHAR(50),
      created_at   TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Payments ──────────────────────────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS wallets (
      id         SERIAL PRIMARY KEY,
      user_id    INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      balance    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id          SERIAL PRIMARY KEY,
      user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        VARCHAR(20) NOT NULL DEFAULT 'card'
                    CHECK (type IN ('card','payfast')),
      label       VARCHAR(100) NOT NULL,
      card_last4  VARCHAR(4),
      card_brand  VARCHAR(20),
      card_expiry VARCHAR(7),
      is_default  SMALLINT DEFAULT 0,
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS wallet_topups (
      id         SERIAL PRIMARY KEY,
      user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount     DECIMAL(10,2) NOT NULL,
      status     VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','completed','failed')),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Privacy & social ──────────────────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS user_blocks (
      id              SERIAL PRIMARY KEY,
      user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at      TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_id, blocked_user_id)
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS message_reports (
      id               SERIAL PRIMARY KEY,
      reporter_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reported_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id  INT REFERENCES conversations(id) ON DELETE SET NULL,
      message_id       INT REFERENCES messages(id) ON DELETE SET NULL,
      reported_excerpt TEXT,
      reason           VARCHAR(40) NOT NULL,
      note             TEXT,
      status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','reviewed','dismissed','actioned')),
      review_note      TEXT,
      reviewed_by      INT REFERENCES users(id),
      reviewed_at      TIMESTAMP,
      created_at       TIMESTAMP DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS club_memberships (
      id           SERIAL PRIMARY KEY,
      user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      club_id      INT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      plan_name    VARCHAR(100) NOT NULL,
      plan_details TEXT,
      start_date   DATE NOT NULL,
      expiry_date  DATE,
      status       VARCHAR(20) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','expired','cancelled','suspended')),
      notes        TEXT,
      created_at   TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Auth / OTP ────────────────────────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS password_reset_otps (
      id          SERIAL PRIMARY KEY,
      user_id     INT NOT NULL,
      email       VARCHAR(255),
      phone       VARCHAR(20),
      otp_hash    VARCHAR(64) NOT NULL,
      reset_token VARCHAR(64),
      expires_at  TIMESTAMP NOT NULL,
      used_at     TIMESTAMP,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS club_password_reset_otps (
      id          SERIAL PRIMARY KEY,
      club_id     INT NOT NULL,
      email       VARCHAR(255) NOT NULL,
      otp_hash    VARCHAR(64) NOT NULL,
      reset_token VARCHAR(64),
      expires_at  TIMESTAMP NOT NULL,
      used_at     TIMESTAMP,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS pending_invitations (
      id            SERIAL PRIMARY KEY,
      inviter_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invitee_email VARCHAR(255) NOT NULL,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (inviter_id, invitee_email)
    )
  `);

  // ── App-wide settings ─────────────────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key        VARCHAR(100) NOT NULL PRIMARY KEY,
      value      TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS tee_time_reminders_sent (
      booking_id INT NOT NULL,
      user_id    INT NOT NULL,
      sent_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (booking_id, user_id)
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      id            SERIAL PRIMARY KEY,
      setting_key   VARCHAR(100) UNIQUE NOT NULL,
      setting_value VARCHAR(255) NOT NULL,
      updated_at    TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Notifications ─────────────────────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS user_notification_prefs (
      id                    SERIAL PRIMARY KEY,
      user_id               INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      notif_bookings        SMALLINT NOT NULL DEFAULT 1,
      notif_messages        SMALLINT NOT NULL DEFAULT 1,
      notif_friend_requests SMALLINT NOT NULL DEFAULT 1,
      notif_payments        SMALLINT NOT NULL DEFAULT 1,
      notif_club_news       SMALLINT NOT NULL DEFAULT 1,
      notif_promotions      SMALLINT NOT NULL DEFAULT 0,
      updated_at            TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Ad removal ────────────────────────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS ad_removal_config (
      id           SERIAL PRIMARY KEY,
      price_zar    DECIMAL(10,2) NOT NULL DEFAULT 29.99,
      period_days  INT NOT NULL DEFAULT 30,
      period_label VARCHAR(50) NOT NULL DEFAULT '30 days',
      updated_at   TIMESTAMP DEFAULT NOW()
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS user_ad_removal (
      id           SERIAL PRIMARY KEY,
      user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purchased_at TIMESTAMP DEFAULT NOW(),
      expires_at   TIMESTAMP NOT NULL,
      price_paid   DECIMAL(10,2) NOT NULL,
      period_days  INT NOT NULL,
      payment_ref  VARCHAR(255),
      status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','active','expired'))
    )
  `);

  // ── Club pricing tiers ────────────────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS club_pricing_tiers (
      id        SERIAL PRIMARY KEY,
      club_id   INT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      tier_type VARCHAR(50) NOT NULL,
      price_18h DECIMAL(10,2),
      price_9h  DECIMAL(10,2),
      hidden    SMALLINT NOT NULL DEFAULT 0,
      UNIQUE (club_id, tier_type)
    )
  `);

  // ── Schedule configs ──────────────────────────────────────────────────────
  await ddl(`
    CREATE TABLE IF NOT EXISTS tee_time_schedule_configs (
      id          SERIAL PRIMARY KEY,
      club_id     INT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      name        VARCHAR(100) NOT NULL,
      config_type CHAR(1) NOT NULL DEFAULT 'A',
      config_data JSONB NOT NULL,
      created_at  TIMESTAMP DEFAULT NOW(),
      updated_at  TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── updated_at trigger function ───────────────────────────────────────────
  await ddl(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $$ LANGUAGE plpgsql
  `);

  const triggerTables = [
    "tee_time_schedule_configs",
    "platform_settings",
    "wallets",
    "ad_removal_config",
    "user_notification_prefs",
    "app_settings",
  ];
  for (const t of triggerTables) {
    await ddl(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'trg_${t}_updated_at'
        ) THEN
          CREATE TRIGGER trg_${t}_updated_at
            BEFORE UPDATE ON ${t}
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        END IF;
      END $$
    `);
  }

  // ── Indexes ───────────────────────────────────────────────────────────────
  const indexes: string[] = [
    "CREATE INDEX IF NOT EXISTS idx_users_role         ON users (role)",
    "CREATE INDEX IF NOT EXISTS idx_users_push_token   ON users (push_token)",
    "CREATE INDEX IF NOT EXISTS idx_users_club_id      ON users (club_id)",
    "CREATE INDEX IF NOT EXISTS idx_clubs_active       ON clubs (active)",
    "CREATE INDEX IF NOT EXISTS idx_clubs_featured     ON clubs (featured, active)",
    "CREATE INDEX IF NOT EXISTS idx_clubs_province     ON clubs (province)",
    "CREATE INDEX IF NOT EXISTS idx_clubs_geo          ON clubs (latitude, longitude)",
    "CREATE INDEX IF NOT EXISTS idx_bookings_user        ON bookings (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_bookings_tee_time    ON bookings (tee_time_id)",
    "CREATE INDEX IF NOT EXISTS idx_bookings_status      ON bookings (status)",
    "CREATE INDEX IF NOT EXISTS idx_bookings_user_status ON bookings (user_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_bookings_created     ON bookings (created_at)",
    "CREATE INDEX IF NOT EXISTS idx_bp_booking ON booking_players (booking_id)",
    "CREATE INDEX IF NOT EXISTS idx_bp_user    ON booking_players (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_fr_requester ON friendships (requester_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_fr_addressee ON friendships (addressee_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_reviews_club ON reviews (club_id)",
    "CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_ads_placement ON ads (placement, active, priority)",
    "CREATE INDEX IF NOT EXISTS idx_messages_conv_time ON messages (conversation_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_conv_members_user  ON conversation_members (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_msg_reports_status   ON message_reports (status, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_msg_reports_reported ON message_reports (reported_user_id)",
    "CREATE INDEX IF NOT EXISTS idx_vouchers_active ON vouchers (active, expires_at)",
    "CREATE INDEX IF NOT EXISTS idx_psb_slot      ON portal_slot_bookings (slot_id)",
    "CREATE INDEX IF NOT EXISTS idx_pts_club_date ON portal_tee_slots (club_id, date)",
    "CREATE INDEX IF NOT EXISTS idx_prot_email ON password_reset_otps (email)",
    "CREATE INDEX IF NOT EXISTS idx_prot_phone ON password_reset_otps (phone)",
    "CREATE INDEX IF NOT EXISTS idx_prot_user  ON password_reset_otps (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_prot_token ON password_reset_otps (reset_token)",
    "CREATE INDEX IF NOT EXISTS idx_cprot_email ON club_password_reset_otps (email)",
    "CREATE INDEX IF NOT EXISTS idx_cprot_club  ON club_password_reset_otps (club_id)",
    "CREATE INDEX IF NOT EXISTS idx_cprot_token ON club_password_reset_otps (reset_token)",
    "CREATE INDEX IF NOT EXISTS idx_pi_email ON pending_invitations (invitee_email)",
    "CREATE INDEX IF NOT EXISTS idx_user_notif_user   ON user_notifications (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_user_notif_unread ON user_notifications (user_id, is_read)",
    "CREATE INDEX IF NOT EXISTS idx_club_notif_club ON club_notifications (club_id)",
    "CREATE INDEX IF NOT EXISTS idx_club_notif_date ON club_notifications (affected_date)",
    "CREATE INDEX IF NOT EXISTS idx_uar_user    ON user_ad_removal (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_uar_expires ON user_ad_removal (expires_at)",
    "CREATE INDEX IF NOT EXISTS idx_golf_events_club ON golf_events (club_id)",
    "CREATE INDEX IF NOT EXISTS idx_golf_events_date ON golf_events (event_date)",
    "CREATE INDEX IF NOT EXISTS idx_club_members_club ON club_members (club_id)",
    "CREATE INDEX IF NOT EXISTS idx_club_members_user ON club_members (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_pending_memberships_email ON pending_memberships (email)",
    "CREATE INDEX IF NOT EXISTS idx_pending_memberships_club ON pending_memberships (club_id)",
    "CREATE INDEX IF NOT EXISTS idx_event_reg_event ON event_registrations (event_id)",
    "CREATE INDEX IF NOT EXISTS idx_event_reg_user  ON event_registrations (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_club_images_club ON club_images (club_id)",
    "CREATE INDEX IF NOT EXISTS idx_hna_verif_user   ON hna_verifications (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_hna_verif_status ON hna_verifications (status)",
  ];
  for (const idx of indexes) {
    await ddl(idx);
  }

  // ── Schema evolution: drop legacy tee_times table ────────────────────────
  await ddl("DROP TABLE IF EXISTS tee_times CASCADE");

  // ── Schema evolution: unique constraint on portal_tee_slots ──────────────
  // Deduplicate first (safe no-op if no dupes exist)
  await query(`
    DELETE FROM portal_tee_slots a
    USING portal_tee_slots b
    WHERE a.id > b.id
      AND a.club_id = b.club_id AND a.date = b.date AND a.tee_time = b.tee_time
  `);
  await ddl("CREATE UNIQUE INDEX IF NOT EXISTS uq_pts_club_date_time ON portal_tee_slots (club_id, date, tee_time)");

  // ── Schema evolution: drop portal_clubs, repoint portal_tee_slots → clubs ─
  await query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'portal_clubs') THEN
        -- Drop old FK first (before any UPDATE, so the FK does not block writes)
        ALTER TABLE portal_tee_slots DROP CONSTRAINT IF EXISTS portal_tee_slots_club_id_fkey;
        -- Remap portal_tee_slots.club_id through portal_clubs.clubs_id to the main clubs table
        -- (only needed when clubs_id column still exists and slots still point to portal_clubs rows)
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portal_clubs' AND column_name = 'clubs_id') THEN
          UPDATE portal_tee_slots pts
          SET club_id = pc.clubs_id
          FROM portal_clubs pc
          WHERE pts.club_id = pc.id AND pc.clubs_id IS NOT NULL;
        END IF;
        -- Remove any rows that still have no valid clubs.id mapping
        DELETE FROM portal_tee_slots WHERE club_id NOT IN (SELECT id FROM clubs);
        -- Add new FK pointing directly to clubs
        ALTER TABLE portal_tee_slots ADD CONSTRAINT portal_tee_slots_club_id_fkey
          FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;
        DROP TABLE portal_clubs CASCADE;
      END IF;
    END $$
  `);
  // Allow bookings to reference a portal slot (portal_tee_slots is now the only slot source)
  await ddl("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS portal_slot_id INT REFERENCES portal_tee_slots(id)");
  // chat_disabled: set when a chat report is upheld — globally suspends the user's
  // ability to start conversations or send messages anywhere in the app.
  await ddl("ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_disabled SMALLINT NOT NULL DEFAULT 0");
  // terms_accepted_at: timestamp the user agreed to the Terms of Use & Community
  // Guidelines. New sign-ups set this at registration; existing users (NULL) are
  // shown a one-time acceptance gate on next app launch.
  await ddl("ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP");
  // privacy_accepted_at / privacy_policy_version: auditable record (POPIA) of which
  // Privacy Policy version the user consented to and when. Set at registration.
  await ddl("ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMP");
  await ddl("ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_policy_version TEXT");
  // is_muted: per-member mute flag. When set, the member receives no push or in-app
  // notifications for new messages in that conversation; messages still load on open.
  await ddl("ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS is_muted SMALLINT NOT NULL DEFAULT 0");
  // blocked_slots: JSON array of slot indices (0–3) the club has individually blocked.
  await ddl("ALTER TABLE portal_tee_slots ADD COLUMN IF NOT EXISTS blocked_slots TEXT DEFAULT '[]'");
  // Cancellation policy: per-club configurable cancellation/refund rules shown to golfers.
  await ddl("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cancel_policy_preset VARCHAR(20) NOT NULL DEFAULT 'standard'");
  // cancel_full_refund_hours: hours before tee time a cancellation qualifies for 100% refund (null = non-refundable).
  await ddl("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cancel_full_refund_hours INT DEFAULT 48");
  // cancel_has_partial: whether a partial-refund middle tier exists.
  await ddl("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cancel_has_partial SMALLINT NOT NULL DEFAULT 1");
  // cancel_partial_pct: percentage refunded in the partial window (e.g. 50).
  await ddl("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cancel_partial_pct INT DEFAULT 50");
  // cancel_partial_hours: lower-bound hours for partial-refund window (above this and below full-refund window).
  await ddl("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cancel_partial_hours INT DEFAULT 24");
  // cancel_payment_hours: hours after booking creation before unpaid bookings are auto-cancelled (24 or 48).
  await ddl("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cancel_payment_hours INT NOT NULL DEFAULT 24");
  // cancel_weather: policy when the club closes the course (full_refund / rebook_only / no_refund).
  await ddl("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cancel_weather VARCHAR(20) NOT NULL DEFAULT 'full_refund'");
  // cancel_contact_email / _phone: where golfers send refund requests — routes to the club, not TapIn Golf.
  await ddl("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cancel_contact_email VARCHAR(255)");
  await ddl("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cancel_contact_phone VARCHAR(50)");
  // cancel_payment_minutes: replaces cancel_payment_hours with granular 30 min–48 h range.
  await ddl("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cancel_payment_minutes INT NOT NULL DEFAULT 1440");
  // cancel_other_policies: free-text block for dress code, check-in time, tee-box arrival, etc.
  await ddl("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cancel_other_policies TEXT");
  // cancel_fee_pct: cancellation fee % always withheld (must be >= platform_fee_pct, default 5).
  await ddl("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cancel_fee_pct INT NOT NULL DEFAULT 5");
  // club_inbox_notifications: system → club portal event feed (new bookings, cancellations, etc.)
  await ddl(`
    CREATE TABLE IF NOT EXISTS club_inbox_notifications (
      id         SERIAL PRIMARY KEY,
      club_id    INT NOT NULL,
      type       VARCHAR(50) NOT NULL DEFAULT 'info',
      title      VARCHAR(255) NOT NULL,
      body       TEXT NOT NULL,
      meta       TEXT,
      read_at    TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await ddl("CREATE INDEX IF NOT EXISTS idx_club_inbox_club ON club_inbox_notifications (club_id, created_at DESC)");
  await ddl("ALTER TABLE club_inbox_notifications ADD COLUMN IF NOT EXISTS refund_processed_at TIMESTAMP");
  // Invoice tracking — one invoice per booking, first send vs copy
  await ddl("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invoice_sent_at TIMESTAMP");
  await ddl("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invoice_resend_count INT NOT NULL DEFAULT 0");
  // Keep tee_time_id nullable for backward compat with bookings made before this migration
  await query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bookings' AND column_name = 'tee_time_id' AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE bookings ALTER COLUMN tee_time_id DROP NOT NULL;
      END IF;
    END $$
  `);
  // club_name on HNA verifications: the golfer's home club at time of submission,
  // auto-populated from their active club membership. Shown in the staff review UI
  // and surfaced on the golfer's profile when approved via TapIn staff card.
  await ddl("ALTER TABLE hna_verifications ADD COLUMN IF NOT EXISTS club_name VARCHAR(255)");

  // ── Cancellation vouchers ─────────────────────────────────────────────────
  // One batch per issuance event (club cancels a day due to flooding etc.)
  // One voucher row per affected user (unique code, user-specific)
  await ddl(`
    CREATE TABLE IF NOT EXISTS cancellation_voucher_batches (
      id            SERIAL PRIMARY KEY,
      club_id       INT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      issued_by     INT NOT NULL REFERENCES users(id),
      reason        TEXT NOT NULL,
      affected_date DATE,
      value_rands   DECIMAL(10,2),
      expires_at    TIMESTAMP,
      voucher_count INT NOT NULL DEFAULT 0,
      created_at    TIMESTAMP DEFAULT NOW()
    )
  `);
  await ddl(`
    CREATE TABLE IF NOT EXISTS cancellation_vouchers (
      id          SERIAL PRIMARY KEY,
      code        VARCHAR(64) UNIQUE NOT NULL,
      batch_id    INT NOT NULL REFERENCES cancellation_voucher_batches(id) ON DELETE CASCADE,
      club_id     INT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      booking_id  INT REFERENCES bookings(id) ON DELETE SET NULL,
      reason      TEXT,
      value_rands DECIMAL(10,2),
      redeemed_at TIMESTAMP,
      expires_at  TIMESTAMP,
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `);
  await ddl("CREATE INDEX IF NOT EXISTS idx_canc_voucher_user   ON cancellation_vouchers (user_id)");
  await ddl("CREATE INDEX IF NOT EXISTS idx_canc_voucher_batch  ON cancellation_vouchers (batch_id)");
  await ddl("CREATE INDEX IF NOT EXISTS idx_canc_voucher_club   ON cancellation_vouchers (club_id)");
  await ddl("CREATE INDEX IF NOT EXISTS idx_canc_voucher_batch_club ON cancellation_voucher_batches (club_id, created_at DESC)");
}

// ── Seed reviews ──────────────────────────────────────────────────────────────
const SEED_REVIEWS: Array<{ clubName: string; reviews: Array<{ rating: number; comment: string }> }> = [
  {
    clubName: "Glendower Golf Club",
    reviews: [
      { rating: 5, comment: "Fantastic fairways, well-maintained greens. The caddy service is exceptional." },
      { rating: 4, comment: "Great club, enjoyed the driving range before our round. Pro shop well stocked." },
      { rating: 5, comment: "One of the best in Gauteng. Challenging 18 holes with beautiful scenery." },
    ],
  },
  {
    clubName: "Randpark Golf Club",
    reviews: [
      { rating: 4, comment: "Two courses means you always have options. The Firethorn is a real test." },
      { rating: 5, comment: "Excellent condition, friendly staff. The restaurant has a great braai menu." },
      { rating: 4, comment: "Good value for 36 holes. Lessons from the pro are well worth it." },
    ],
  },
  {
    clubName: "Westlake Golf Club",
    reviews: [
      { rating: 5, comment: "Mountain views are absolutely stunning. One of Cape Town's hidden gems." },
      { rating: 5, comment: "Immaculate course, the greens are lightning fast. Will be back!" },
      { rating: 4, comment: "Lovely course with a great vibe. The bar after golf is perfect." },
    ],
  },
  {
    clubName: "Royal Cape Golf Club",
    reviews: [
      { rating: 5, comment: "Historic course with beautiful trees and a classic layout. A must-play." },
      { rating: 4, comment: "Prestigious club with amazing service. Caddy really helped with club selection." },
      { rating: 5, comment: "Royal Cape lives up to its name. Pristine fairways, perfect greens." },
    ],
  },
  {
    clubName: "Durban Country Club",
    reviews: [
      { rating: 5, comment: "Coastal breeze makes every hole an adventure. The pool after is perfect." },
      { rating: 5, comment: "World-class facility in a stunning setting. The restaurant is top tier." },
      { rating: 4, comment: "Challenging layout but very enjoyable. The par 3s over the water are memorable." },
    ],
  },
  {
    clubName: "Leopard Creek",
    reviews: [
      { rating: 5, comment: "Watching elephants graze on the 14th fairway is something I'll never forget." },
      { rating: 5, comment: "Absolutely world-class. The big 5 views are unreal. Worth every rand." },
      { rating: 5, comment: "The most unique golf experience in Africa. Caddies are knowledgeable and fun." },
    ],
  },
  {
    clubName: "Fancourt Hotel & CC",
    reviews: [
      { rating: 5, comment: "The Links course is pure magic. Three world-class courses in one resort." },
      { rating: 5, comment: "Gary Player-designed courses are brilliant. The spa and hotel add to a perfect weekend." },
      { rating: 4, comment: "Expensive but worth it. The academy helped shave 3 shots off my handicap." },
    ],
  },
  {
    clubName: "Sun City Gary Player CC",
    reviews: [
      { rating: 5, comment: "Gary Player Country Club is everything you'd expect. Immaculate condition." },
      { rating: 4, comment: "Great golf but the real highlight is the Sun City resort experience." },
      { rating: 5, comment: "Hosted the Nedbank Golf Challenge here — you can feel the history on every hole." },
    ],
  },
];

async function seedData(): Promise<void> {
  // ── Clubs ─────────────────────────────────────────────────────────────────
  const [{ cnt: clubCount }] = await query<{ cnt: string }>("SELECT COUNT(*) as cnt FROM clubs");
  if (Number(clubCount) === 0) {
    const clubs: [string, string, string, number, number, number, string][] = [
      ["Glendower Golf Club",    "Edenvale",  "Gauteng",      18, 650.0,  1, '["Driving Range","Pro Shop","Restaurant","Caddy Service"]'],
      ["Randpark Golf Club",     "Randburg",  "Gauteng",      36, 580.0,  1, '["Two 18-hole courses","Pro Shop","Restaurant","Lessons"]'],
      ["Westlake Golf Club",     "Tokai",     "Western Cape", 18, 720.0,  1, '["Mountain Views","Pro Shop","Club Hire","Bar"]'],
      ["Royal Cape Golf Club",   "Wynberg",   "Western Cape", 18, 850.0,  1, '["Historic Club","Pro Shop","Restaurant","Caddy Service"]'],
      ["Durban Country Club",    "Durban",    "KZN",          18, 900.0,  1, '["Beach Course","Pro Shop","Restaurant","Pool"]'],
      ["Leopard Creek",          "Malelane",  "Mpumalanga",   18, 2500.0, 1, '["Big 5 Views","Luxury Lodge","Caddy Required","Pro Shop"]'],
      ["Fancourt Hotel & CC",    "George",    "Western Cape", 54, 1800.0, 1, '["3 Courses","Links Course","Academy","Spa","Luxury Hotel"]'],
      ["Sun City Gary Player CC","Sun City",  "North West",   18, 1200.0, 1, '["Resort","Pro Shop","Casino","Hotel","Pool"]'],
    ];
    for (const c of clubs) {
      await exec(
        "INSERT INTO clubs (name, location, province, holes, price_from, featured, facilities) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb)",
        c
      );
    }

    // Seed GPS coordinates
    const gps: [number, number, string][] = [
      [-26.159873, 28.141771, "Glendower Golf Club"],
      [-26.114738, 27.965825, "Randpark Golf Club"],
      [-34.085009, 18.444875, "Westlake Golf Club"],
      [-34.013498, 18.485051, "Royal Cape Golf Club"],
      [-29.827867, 31.034113, "Durban Country Club"],
      [-25.441748, 31.534459, "Leopard Creek"],
      [-33.969331, 22.409119, "Fancourt Hotel & CC"],
      [-25.345759, 27.098594, "Sun City Gary Player CC"],
    ];
    for (const [lat, lng, name] of gps) {
      await query("UPDATE clubs SET latitude = ?, longitude = ? WHERE name = ?", [lat, lng, name]);
    }

    // Seed descriptions
    const descriptions: [string, string][] = [
      ["Glendower Golf Club",    "One of Gauteng's premier parkland courses, Glendower offers a challenging 18-hole layout with tree-lined fairways and immaculate greens. Having hosted the SA Open multiple times, it is a bucket-list club for every South African golfer."],
      ["Randpark Golf Club",     "Home to two full 18-hole championship courses — the Firethorn and the Bushwillow — Randpark caters to golfers of all levels in the heart of Johannesburg's northern suburbs. Excellent facilities and a warm club atmosphere make it a Gauteng favourite."],
      ["Westlake Golf Club",     "Nestled at the foot of the Constantiaberg mountains, Westlake is one of Cape Town's most scenic parkland courses. Tree-lined fairways, lightning-fast greens, and mountain backdrops make it a favourite among Western Cape golfers."],
      ["Royal Cape Golf Club",   "Established in 1885, Royal Cape is the oldest golf club in Africa. This historic parkland course in Wynberg blends colonial heritage with championship-grade golf, attracting players from across the globe seeking a piece of golfing history."],
      ["Durban Country Club",    "Set beside the warm Indian Ocean, the Durban Country Club offers a unique coastal golf experience. The prevailing sea breeze and undulating fairways create one of South Africa's most memorable and challenging rounds."],
      ["Leopard Creek",          "Bordering Kruger National Park, Leopard Creek is South Africa's most dramatic golf experience. Big Five game — including hippos and elephants — roam the course boundaries, making every round a true wildlife adventure alongside world-class golf."],
      ["Fancourt Hotel & CC",    "Home to three world-class Gary Player-designed championship courses, Fancourt is South Africa's ultimate golf resort. The iconic Links course — rated among the top 100 courses in the world — is the centrepiece of an extraordinary golfing destination."],
      ["Sun City Gary Player CC","The legendary Gary Player Country Club at Sun City has hosted the Nedbank Golf Challenge for decades. This resort masterpiece combines championship-calibre golf with the full Sun City experience — making it one of Africa's most celebrated venues."],
    ];
    for (const [name, desc] of descriptions) {
      await query("UPDATE clubs SET description = ? WHERE name = ? AND (description IS NULL OR description = '')", [desc, name]);
    }

    // Assign cart config
    await query("UPDATE clubs SET cart_available = 0, cart_compulsory = 0, cart_price = NULL WHERE id % 3 = 0");
    await query("UPDATE clubs SET cart_available = 1, cart_compulsory = 0, cart_price = 200.00 WHERE id % 3 = 1");
    await query("UPDATE clubs SET cart_available = 1, cart_compulsory = 1, cart_price = 250.00 WHERE id % 3 = 2");

    logger.info("Database seeded with clubs");
  }

  // ── Reviews ───────────────────────────────────────────────────────────────
  const [{ cnt: revCount }] = await query<{ cnt: string }>("SELECT COUNT(*) as cnt FROM reviews");
  if (Number(revCount) === 0) {
    let reviewerId: number;
    const firstUser = await row<{ id: number }>("SELECT id FROM users LIMIT 1");
    if (firstUser) {
      reviewerId = firstUser.id;
    } else {
      const crypto = await import("crypto");
      const demoHash = crypto.createHmac("sha256", "tapin-seed-key").update("demo-reviewer-2024").digest("hex");
      reviewerId = await exec(
        "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'golfer')",
        ["Demo Golfer", "demo@tapingolf.co.za", demoHash]
      );
    }
    for (const seed of SEED_REVIEWS) {
      const club = await row<{ id: number }>("SELECT id FROM clubs WHERE name = ? LIMIT 1", [seed.clubName]);
      if (!club) continue;
      for (const rev of seed.reviews) {
        await exec(
          "INSERT INTO reviews (club_id, user_id, rating, comment) VALUES (?, ?, ?, ?)",
          [club.id, reviewerId, rev.rating, rev.comment]
        );
      }
    }
    logger.info("Database seeded with club reviews");
  }

  // ── Ads ───────────────────────────────────────────────────────────────────
  const [{ cnt: adCount }] = await query<{ cnt: string }>("SELECT COUNT(*) as cnt FROM ads");
  if (Number(adCount) === 0) {
    const seedAds = [
      { title: "Glendower Golf Club",        subtitle: "Book your round at one of Gauteng's finest 18-hole courses. Home of the SA Open.",                                                   cta_text: "Book Now",        link_url: "https://www.glendower.co.za",         placement: "home",    priority: 10 },
      { title: "Fancourt Hotel & Country Club", subtitle: "54 holes of world-class golf in George. Stay, play & unwind at South Africa's premier golf resort.",                              cta_text: "Explore Packages",link_url: "https://www.fancourt.co.za",          placement: "home",    priority: 8 },
      { title: "Leopard Creek",              subtitle: "Golf on the banks of the Crocodile River — Big 5 views guaranteed. Book your exclusive round.",                                       cta_text: "Book a Round",   link_url: "https://www.leopardcreek.co.za",      placement: "explore", priority: 9 },
      { title: "Royal Cape Golf Club",       subtitle: "South Africa's oldest golf club. Play where the legends played — right in the heart of Cape Town.",                                  cta_text: "Visit Royal Cape",link_url: "https://www.royalcapegolfclub.co.za",  placement: "club",    priority: 7 },
    ];
    for (const ad of seedAds) {
      await exec(
        "INSERT INTO ads (title, subtitle, cta_text, link_url, placement, priority, active) VALUES (?, ?, ?, ?, ?, ?, 1)",
        [ad.title, ad.subtitle, ad.cta_text, ad.link_url, ad.placement, ad.priority]
      );
    }
    logger.info("Ads seeded");
  }

  // ── Vouchers ──────────────────────────────────────────────────────────────
  const vouchers: [string, string, number][] = [
    ["TAPIN10",   "percentage",   10],
    ["GOLF50",    "fixed",        50],
    ["WELCOME20", "percentage",   20],
    ["WALLET100", "wallet_credit",100],
    ["TAPIN25",   "wallet_credit", 25],
    ["GOLF200",   "wallet_credit",200],
  ];
  for (const [code, type, value] of vouchers) {
    await exec(
      "INSERT INTO vouchers (code, discount_type, discount_value, min_amount, active) VALUES (?, ?, ?, 0, 1) ON CONFLICT (code) DO NOTHING",
      [code, type, value]
    );
  }

  // ── Platform settings ─────────────────────────────────────────────────────
  await exec(
    "INSERT INTO platform_settings (setting_key, setting_value) VALUES ('platform_fee_pct', '5') ON CONFLICT (setting_key) DO NOTHING",
    []
  );
  await exec(
    "INSERT INTO platform_settings (setting_key, setting_value) VALUES ('vat_pct', '15') ON CONFLICT (setting_key) DO NOTHING",
    []
  );

  // ── App settings ──────────────────────────────────────────────────────────
  await exec(
    "INSERT INTO app_settings (key, value) VALUES ('notify_minutes_before', '120') ON CONFLICT (key) DO NOTHING",
    []
  );

  // ── Ad removal config ─────────────────────────────────────────────────────
  await exec(
    "INSERT INTO ad_removal_config (id, price_zar, period_days, period_label) VALUES (1, 29.99, 30, '30 days') ON CONFLICT (id) DO NOTHING",
    []
  );

  // ── Super users ───────────────────────────────────────────────────────────
  await query(
    "UPDATE users SET is_super_user = 1 WHERE email = ANY(?::text[])",
    [["marco@tapingolf.co.za", "cliff@tapingolf.co.za"]]
  );

  // ── Club portal credentials ───────────────────────────────────────────────
  const bcrypt = await import("bcryptjs");
  const allClubs = await query<{ id: number; name: string }>(
    "SELECT id, name FROM clubs WHERE username IS NULL OR username = '' ORDER BY id"
  );
  let credCount = 0;
  for (const club of allClubs) {
    const base = club.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 25);
    const slug = `${base}_${club.id}`;
    const hash = await bcrypt.hash("Golf2026!", 8);
    await query(
      "UPDATE clubs SET username = ?, password_hash = ? WHERE id = ? AND (username IS NULL OR username = '')",
      [slug, hash, club.id]
    );
    credCount++;
  }
  if (credCount > 0) logger.info({ count: credCount }, "Club portal credentials seeded");
}

// Recompute portal_tee_slots.player_count from active (non-cancelled) bookings.
// Historically player_count was only ever incremented, so cancelled/abandoned
// bookings left phantom reservations that made open slots look full.
async function reconcileSlotPlayerCounts(): Promise<void> {
  // Legacy cleanup: Stitch bookings used to be marked 'confirmed' at creation,
  // before payment. Abandoned ones (no player ever paid) past the grace window
  // are cancelled so they stop holding seats.
  await exec(
    `UPDATE bookings SET status = 'cancelled'
      WHERE payment_method = 'stitch'
        AND status IN ('pending','confirmed')
        AND created_at < NOW() - INTERVAL '15 minutes'
        AND NOT EXISTS (
          SELECT 1 FROM booking_players bp
           WHERE bp.booking_id = bookings.id AND bp.paid = 1
        )`
  );
  const fixed = await exec(
    `UPDATE portal_tee_slots pts
       SET player_count = COALESCE((
         SELECT SUM(b.players)::int
           FROM bookings b
          WHERE b.portal_slot_id = pts.id
            AND b.status <> 'cancelled'
       ), 0)
     WHERE pts.player_count <> COALESCE((
         SELECT SUM(b.players)::int
           FROM bookings b
          WHERE b.portal_slot_id = pts.id
            AND b.status <> 'cancelled'
       ), 0)`
  );
  if (fixed > 0) logger.info({ slots: fixed }, "Reconciled tee-slot player counts");
}

export async function migrate(): Promise<void> {
  await createSchema();
  logger.info("PostgreSQL schema ready");
  await seedData();
  await reconcileSlotPlayerCounts();
  logger.info("Migrations complete");
}
