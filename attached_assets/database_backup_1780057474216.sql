--
-- PostgreSQL database dump
--

\restrict jnC6lGENp7ZIlGWadXEH1gLqb2Zwwesyk49SmJKywMdgIYvYoFEaKaEH0d7QGDP

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $$;


ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ad_removal_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ad_removal_config (
    id integer NOT NULL,
    price_zar numeric(10,2) DEFAULT 29.99 NOT NULL,
    period_days integer DEFAULT 30 NOT NULL,
    period_label character varying(50) DEFAULT '30 days'::character varying NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.ad_removal_config OWNER TO postgres;

--
-- Name: ad_removal_config_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ad_removal_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ad_removal_config_id_seq OWNER TO postgres;

--
-- Name: ad_removal_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ad_removal_config_id_seq OWNED BY public.ad_removal_config.id;


--
-- Name: ads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ads (
    id integer NOT NULL,
    user_id integer,
    club_id integer,
    title character varying(255) NOT NULL,
    subtitle text,
    image_url character varying(500),
    cta_text character varying(100),
    link_url character varying(500),
    placement character varying(20) DEFAULT 'home'::character varying,
    priority integer DEFAULT 0,
    active smallint DEFAULT 1,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT ads_placement_check CHECK (((placement)::text = ANY ((ARRAY['home'::character varying, 'club'::character varying, 'explore'::character varying])::text[])))
);


ALTER TABLE public.ads OWNER TO postgres;

--
-- Name: ads_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ads_id_seq OWNER TO postgres;

--
-- Name: ads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ads_id_seq OWNED BY public.ads.id;


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_settings (
    key character varying(100) NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.app_settings OWNER TO postgres;

--
-- Name: booking_players; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.booking_players (
    id integer NOT NULL,
    booking_id integer NOT NULL,
    user_id integer,
    paid smallint DEFAULT 0,
    amount numeric(10,2),
    guest_name character varying(100)
);


ALTER TABLE public.booking_players OWNER TO postgres;

--
-- Name: booking_players_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.booking_players_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.booking_players_id_seq OWNER TO postgres;

--
-- Name: booking_players_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.booking_players_id_seq OWNED BY public.booking_players.id;


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bookings (
    id integer NOT NULL,
    user_id integer NOT NULL,
    tee_time_id integer,
    players integer DEFAULT 1 NOT NULL,
    split_bill smallint DEFAULT 0,
    total_amount numeric(10,2) NOT NULL,
    my_amount numeric(10,2) NOT NULL,
    booking_ref character varying(20) NOT NULL,
    payment_method character varying(50) DEFAULT 'payfast'::character varying,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    holes smallint DEFAULT 18,
    voucher_code character varying(50),
    discount_amount numeric(10,2) DEFAULT 0,
    cart_fee numeric(10,2) DEFAULT 0 NOT NULL,
    platform_fee numeric(10,2) DEFAULT 0,
    club_amount numeric(10,2),
    portal_slot_id integer,
    CONSTRAINT bookings_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'cancelled'::character varying, 'completed'::character varying])::text[])))
);


ALTER TABLE public.bookings OWNER TO postgres;

--
-- Name: bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bookings_id_seq OWNER TO postgres;

--
-- Name: bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bookings_id_seq OWNED BY public.bookings.id;


--
-- Name: club_images; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.club_images (
    id integer NOT NULL,
    club_id integer NOT NULL,
    url character varying(1000) NOT NULL,
    caption character varying(255),
    display_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.club_images OWNER TO postgres;

--
-- Name: club_images_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.club_images_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.club_images_id_seq OWNER TO postgres;

--
-- Name: club_images_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.club_images_id_seq OWNED BY public.club_images.id;


--
-- Name: club_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.club_members (
    id integer NOT NULL,
    club_id integer NOT NULL,
    user_id integer NOT NULL,
    membership_type character varying(30) DEFAULT 'standard'::character varying NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    added_by integer NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    start_date date,
    renewal_date date,
    benefits text,
    prepaid_rounds integer DEFAULT 0 NOT NULL,
    prepaid_rounds_used integer DEFAULT 0 NOT NULL,
    CONSTRAINT club_members_membership_type_check CHECK (((membership_type)::text = ANY ((ARRAY['standard'::character varying, 'premium'::character varying, 'honorary'::character varying, 'junior'::character varying, 'senior'::character varying, 'family'::character varying, 'social'::character varying, 'full_member'::character varying, 'six_day_member'::character varying, 'week_day_member'::character varying, 'pensioner_full'::character varying, 'pensioner_six_day'::character varying, 'pensioner_week_day'::character varying, 'student_member'::character varying, 'junior_member'::character varying])::text[]))),
    CONSTRAINT club_members_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'suspended'::character varying])::text[])))
);


ALTER TABLE public.club_members OWNER TO postgres;

--
-- Name: club_members_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.club_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.club_members_id_seq OWNER TO postgres;

--
-- Name: club_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.club_members_id_seq OWNED BY public.club_members.id;


--
-- Name: club_memberships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.club_memberships (
    id integer NOT NULL,
    user_id integer NOT NULL,
    club_id integer NOT NULL,
    plan_name character varying(100) NOT NULL,
    plan_details text,
    start_date date NOT NULL,
    expiry_date date,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT club_memberships_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'expired'::character varying, 'cancelled'::character varying, 'suspended'::character varying])::text[])))
);


ALTER TABLE public.club_memberships OWNER TO postgres;

--
-- Name: club_memberships_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.club_memberships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.club_memberships_id_seq OWNER TO postgres;

--
-- Name: club_memberships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.club_memberships_id_seq OWNED BY public.club_memberships.id;


--
-- Name: club_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.club_notifications (
    id integer NOT NULL,
    club_id integer NOT NULL,
    sent_by integer NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(200) NOT NULL,
    body text NOT NULL,
    tee_shift_minutes integer,
    affected_date date,
    recipient_count integer DEFAULT 0 NOT NULL,
    sent_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.club_notifications OWNER TO postgres;

--
-- Name: club_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.club_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.club_notifications_id_seq OWNER TO postgres;

--
-- Name: club_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.club_notifications_id_seq OWNED BY public.club_notifications.id;


--
-- Name: club_password_reset_otps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.club_password_reset_otps (
    id integer NOT NULL,
    club_id integer NOT NULL,
    email character varying(255) NOT NULL,
    otp_hash character varying(64) NOT NULL,
    reset_token character varying(64),
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.club_password_reset_otps OWNER TO postgres;

--
-- Name: club_password_reset_otps_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.club_password_reset_otps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.club_password_reset_otps_id_seq OWNER TO postgres;

--
-- Name: club_password_reset_otps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.club_password_reset_otps_id_seq OWNED BY public.club_password_reset_otps.id;


--
-- Name: club_pricing_tiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.club_pricing_tiers (
    id integer NOT NULL,
    club_id integer NOT NULL,
    tier_type character varying(50) NOT NULL,
    price_18h numeric(10,2),
    price_9h numeric(10,2),
    hidden smallint DEFAULT 0 NOT NULL
);


ALTER TABLE public.club_pricing_tiers OWNER TO postgres;

--
-- Name: club_pricing_tiers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.club_pricing_tiers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.club_pricing_tiers_id_seq OWNER TO postgres;

--
-- Name: club_pricing_tiers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.club_pricing_tiers_id_seq OWNED BY public.club_pricing_tiers.id;


--
-- Name: clubs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clubs (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    location character varying(255) NOT NULL,
    province character varying(100) NOT NULL,
    image_url character varying(500),
    holes integer DEFAULT 18,
    price_from numeric(10,2),
    facilities jsonb,
    featured smallint DEFAULT 0,
    active smallint DEFAULT 1,
    created_at timestamp without time zone DEFAULT now(),
    latitude numeric(10,7),
    longitude numeric(10,7),
    cart_available smallint DEFAULT 0 NOT NULL,
    cart_compulsory smallint DEFAULT 0 NOT NULL,
    cart_price numeric(10,2),
    geofence_enabled smallint DEFAULT 0 NOT NULL,
    geofence_radius_m integer DEFAULT 200 NOT NULL,
    ninth_tee_lat numeric(10,7),
    ninth_tee_lng numeric(10,7),
    ninth_tee_radius_m integer DEFAULT 50 NOT NULL,
    website character varying(500),
    logo_url character varying(500),
    username character varying(100),
    password_hash character varying(255),
    description text,
    phone character varying(50),
    email character varying(255),
    address character varying(500)
);


ALTER TABLE public.clubs OWNER TO postgres;

--
-- Name: clubs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.clubs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clubs_id_seq OWNER TO postgres;

--
-- Name: clubs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.clubs_id_seq OWNED BY public.clubs.id;


--
-- Name: conversation_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.conversation_members (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    user_id integer NOT NULL,
    joined_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.conversation_members OWNER TO postgres;

--
-- Name: conversation_members_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.conversation_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.conversation_members_id_seq OWNER TO postgres;

--
-- Name: conversation_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.conversation_members_id_seq OWNED BY public.conversation_members.id;


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.conversations (
    id integer NOT NULL,
    name character varying(255),
    is_group smallint DEFAULT 0,
    created_by integer NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    group_picture text
);


ALTER TABLE public.conversations OWNER TO postgres;

--
-- Name: conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.conversations_id_seq OWNER TO postgres;

--
-- Name: conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.conversations_id_seq OWNED BY public.conversations.id;


--
-- Name: event_registrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_registrations (
    id integer NOT NULL,
    event_id integer NOT NULL,
    user_id integer NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    registered_at timestamp without time zone DEFAULT now(),
    CONSTRAINT event_registrations_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.event_registrations OWNER TO postgres;

--
-- Name: event_registrations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.event_registrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.event_registrations_id_seq OWNER TO postgres;

--
-- Name: event_registrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.event_registrations_id_seq OWNED BY public.event_registrations.id;


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.friendships (
    id integer NOT NULL,
    requester_id integer NOT NULL,
    addressee_id integer NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT friendships_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'accepted'::character varying, 'declined'::character varying])::text[])))
);


ALTER TABLE public.friendships OWNER TO postgres;

--
-- Name: friendships_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.friendships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.friendships_id_seq OWNER TO postgres;

--
-- Name: friendships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.friendships_id_seq OWNED BY public.friendships.id;


--
-- Name: golf_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.golf_events (
    id integer NOT NULL,
    club_id integer NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    event_date date NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    event_type character varying(30) DEFAULT 'other'::character varying NOT NULL,
    restriction character varying(30) DEFAULT 'open'::character varying NOT NULL,
    entry_fee numeric(10,2),
    max_participants integer,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT golf_events_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['open_day'::character varying, 'competition'::character varying, 'corporate'::character varying, 'social'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT golf_events_restriction_check CHECK (((restriction)::text = ANY ((ARRAY['open'::character varying, 'members_only'::character varying, 'invitation_only'::character varying])::text[]))),
    CONSTRAINT golf_events_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'cancelled'::character varying, 'completed'::character varying])::text[])))
);


ALTER TABLE public.golf_events OWNER TO postgres;

--
-- Name: golf_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.golf_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.golf_events_id_seq OWNER TO postgres;

--
-- Name: golf_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.golf_events_id_seq OWNED BY public.golf_events.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    sender_id integer NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.messages OWNER TO postgres;

--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.messages_id_seq OWNER TO postgres;

--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: password_reset_otps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_reset_otps (
    id integer NOT NULL,
    user_id integer NOT NULL,
    email character varying(255),
    phone character varying(20),
    otp_hash character varying(64) NOT NULL,
    reset_token character varying(64),
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.password_reset_otps OWNER TO postgres;

--
-- Name: password_reset_otps_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.password_reset_otps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.password_reset_otps_id_seq OWNER TO postgres;

--
-- Name: password_reset_otps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.password_reset_otps_id_seq OWNED BY public.password_reset_otps.id;


--
-- Name: payment_methods; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_methods (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type character varying(20) DEFAULT 'card'::character varying NOT NULL,
    label character varying(100) NOT NULL,
    card_last4 character varying(4),
    card_brand character varying(20),
    card_expiry character varying(7),
    is_default smallint DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT payment_methods_type_check CHECK (((type)::text = ANY ((ARRAY['card'::character varying, 'payfast'::character varying])::text[])))
);


ALTER TABLE public.payment_methods OWNER TO postgres;

--
-- Name: payment_methods_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payment_methods_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payment_methods_id_seq OWNER TO postgres;

--
-- Name: payment_methods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payment_methods_id_seq OWNED BY public.payment_methods.id;


--
-- Name: pending_invitations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pending_invitations (
    id integer NOT NULL,
    inviter_id integer NOT NULL,
    invitee_email character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pending_invitations OWNER TO postgres;

--
-- Name: pending_invitations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pending_invitations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pending_invitations_id_seq OWNER TO postgres;

--
-- Name: pending_invitations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pending_invitations_id_seq OWNED BY public.pending_invitations.id;


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platform_settings (
    id integer NOT NULL,
    setting_key character varying(100) NOT NULL,
    setting_value character varying(255) NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.platform_settings OWNER TO postgres;

--
-- Name: platform_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.platform_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.platform_settings_id_seq OWNER TO postgres;

--
-- Name: platform_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.platform_settings_id_seq OWNED BY public.platform_settings.id;


--
-- Name: portal_slot_bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.portal_slot_bookings (
    id integer NOT NULL,
    slot_id integer NOT NULL,
    player_name character varying(255) NOT NULL,
    player_email character varying(255),
    player_phone character varying(50),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.portal_slot_bookings OWNER TO postgres;

--
-- Name: portal_slot_bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.portal_slot_bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.portal_slot_bookings_id_seq OWNER TO postgres;

--
-- Name: portal_slot_bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.portal_slot_bookings_id_seq OWNED BY public.portal_slot_bookings.id;


--
-- Name: portal_tee_slots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.portal_tee_slots (
    id integer NOT NULL,
    club_id integer NOT NULL,
    date date NOT NULL,
    tee_time character varying(5) NOT NULL,
    session_type character varying(20) NOT NULL,
    tee_start_type character varying(30) DEFAULT '1st Tee'::character varying NOT NULL,
    max_players integer DEFAULT 4 NOT NULL,
    weekday_rate_code character varying(50),
    weekend_rate_code character varying(50),
    is_active smallint DEFAULT 1 NOT NULL,
    notes text,
    player_count integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT portal_tee_slots_session_type_check CHECK (((session_type)::text = ANY ((ARRAY['AM'::character varying, 'PM'::character varying, 'Twilight'::character varying])::text[]))),
    CONSTRAINT portal_tee_slots_tee_start_type_check CHECK (((tee_start_type)::text = ANY ((ARRAY['1st Tee'::character varying, '10th Tee'::character varying, 'Two-Tee Start'::character varying])::text[])))
);


ALTER TABLE public.portal_tee_slots OWNER TO postgres;

--
-- Name: portal_tee_slots_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.portal_tee_slots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.portal_tee_slots_id_seq OWNER TO postgres;

--
-- Name: portal_tee_slots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.portal_tee_slots_id_seq OWNED BY public.portal_tee_slots.id;


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reviews (
    id integer NOT NULL,
    club_id integer NOT NULL,
    user_id integer NOT NULL,
    rating integer NOT NULL,
    comment text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.reviews OWNER TO postgres;

--
-- Name: reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reviews_id_seq OWNER TO postgres;

--
-- Name: reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reviews_id_seq OWNED BY public.reviews.id;


--
-- Name: tee_time_reminders_sent; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tee_time_reminders_sent (
    booking_id integer NOT NULL,
    user_id integer NOT NULL,
    sent_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tee_time_reminders_sent OWNER TO postgres;

--
-- Name: tee_time_schedule_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tee_time_schedule_configs (
    id integer NOT NULL,
    club_id integer NOT NULL,
    name character varying(100) NOT NULL,
    config_type character(1) DEFAULT 'A'::bpchar NOT NULL,
    config_data jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.tee_time_schedule_configs OWNER TO postgres;

--
-- Name: tee_time_schedule_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tee_time_schedule_configs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tee_time_schedule_configs_id_seq OWNER TO postgres;

--
-- Name: tee_time_schedule_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tee_time_schedule_configs_id_seq OWNED BY public.tee_time_schedule_configs.id;


--
-- Name: user_ad_removal; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_ad_removal (
    id integer NOT NULL,
    user_id integer NOT NULL,
    purchased_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone NOT NULL,
    price_paid numeric(10,2) NOT NULL,
    period_days integer NOT NULL,
    payment_ref character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    CONSTRAINT user_ad_removal_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'expired'::character varying])::text[])))
);


ALTER TABLE public.user_ad_removal OWNER TO postgres;

--
-- Name: user_ad_removal_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_ad_removal_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_ad_removal_id_seq OWNER TO postgres;

--
-- Name: user_ad_removal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_ad_removal_id_seq OWNED BY public.user_ad_removal.id;


--
-- Name: user_blocks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_blocks (
    id integer NOT NULL,
    user_id integer NOT NULL,
    blocked_user_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.user_blocks OWNER TO postgres;

--
-- Name: user_blocks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_blocks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_blocks_id_seq OWNER TO postgres;

--
-- Name: user_blocks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_blocks_id_seq OWNED BY public.user_blocks.id;


--
-- Name: user_notification_prefs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_notification_prefs (
    id integer NOT NULL,
    user_id integer NOT NULL,
    notif_bookings smallint DEFAULT 1 NOT NULL,
    notif_messages smallint DEFAULT 1 NOT NULL,
    notif_friend_requests smallint DEFAULT 1 NOT NULL,
    notif_payments smallint DEFAULT 1 NOT NULL,
    notif_club_news smallint DEFAULT 1 NOT NULL,
    notif_promotions smallint DEFAULT 0 NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.user_notification_prefs OWNER TO postgres;

--
-- Name: user_notification_prefs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_notification_prefs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_notification_prefs_id_seq OWNER TO postgres;

--
-- Name: user_notification_prefs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_notification_prefs_id_seq OWNED BY public.user_notification_prefs.id;


--
-- Name: user_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_notifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(200) NOT NULL,
    body text NOT NULL,
    data jsonb,
    is_read smallint DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.user_notifications OWNER TO postgres;

--
-- Name: user_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_notifications_id_seq OWNER TO postgres;

--
-- Name: user_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_notifications_id_seq OWNED BY public.user_notifications.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    phone character varying(50),
    handicap numeric(4,1),
    role character varying(20) DEFAULT 'golfer'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    profile_picture text,
    push_token character varying(255),
    club_id integer,
    gender character varying(30),
    date_of_birth date,
    home_province character varying(100),
    hna_number character varying(50),
    student_number character varying(100),
    is_private smallint DEFAULT 0 NOT NULL,
    analytics_consent smallint DEFAULT 1 NOT NULL,
    is_super_user smallint DEFAULT 0 NOT NULL,
    hna_locked smallint DEFAULT 0 NOT NULL,
    student_number_locked smallint DEFAULT 0 NOT NULL,
    CONSTRAINT users_gender_check CHECK (((gender)::text = ANY ((ARRAY['male'::character varying, 'female'::character varying, 'prefer_not_to_say'::character varying])::text[]))),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['golfer'::character varying, 'club_admin'::character varying, 'advertiser'::character varying])::text[])))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vouchers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vouchers (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    discount_type character varying(20) NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    club_id integer,
    min_amount numeric(10,2) DEFAULT 0,
    max_uses integer,
    uses_count integer DEFAULT 0,
    active smallint DEFAULT 1,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT vouchers_discount_type_check CHECK (((discount_type)::text = ANY ((ARRAY['fixed'::character varying, 'percentage'::character varying, 'wallet_credit'::character varying])::text[])))
);


ALTER TABLE public.vouchers OWNER TO postgres;

--
-- Name: vouchers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vouchers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vouchers_id_seq OWNER TO postgres;

--
-- Name: vouchers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vouchers_id_seq OWNED BY public.vouchers.id;


--
-- Name: wallet_topups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wallet_topups (
    id integer NOT NULL,
    user_id integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT wallet_topups_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);


ALTER TABLE public.wallet_topups OWNER TO postgres;

--
-- Name: wallet_topups_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.wallet_topups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.wallet_topups_id_seq OWNER TO postgres;

--
-- Name: wallet_topups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.wallet_topups_id_seq OWNED BY public.wallet_topups.id;


--
-- Name: wallets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wallets (
    id integer NOT NULL,
    user_id integer NOT NULL,
    balance numeric(10,2) DEFAULT 0.00 NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.wallets OWNER TO postgres;

--
-- Name: wallets_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.wallets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.wallets_id_seq OWNER TO postgres;

--
-- Name: wallets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.wallets_id_seq OWNED BY public.wallets.id;


--
-- Name: ad_removal_config id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_removal_config ALTER COLUMN id SET DEFAULT nextval('public.ad_removal_config_id_seq'::regclass);


--
-- Name: ads id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ads ALTER COLUMN id SET DEFAULT nextval('public.ads_id_seq'::regclass);


--
-- Name: booking_players id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_players ALTER COLUMN id SET DEFAULT nextval('public.booking_players_id_seq'::regclass);


--
-- Name: bookings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings ALTER COLUMN id SET DEFAULT nextval('public.bookings_id_seq'::regclass);


--
-- Name: club_images id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_images ALTER COLUMN id SET DEFAULT nextval('public.club_images_id_seq'::regclass);


--
-- Name: club_members id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_members ALTER COLUMN id SET DEFAULT nextval('public.club_members_id_seq'::regclass);


--
-- Name: club_memberships id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_memberships ALTER COLUMN id SET DEFAULT nextval('public.club_memberships_id_seq'::regclass);


--
-- Name: club_notifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_notifications ALTER COLUMN id SET DEFAULT nextval('public.club_notifications_id_seq'::regclass);


--
-- Name: club_password_reset_otps id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_password_reset_otps ALTER COLUMN id SET DEFAULT nextval('public.club_password_reset_otps_id_seq'::regclass);


--
-- Name: club_pricing_tiers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_pricing_tiers ALTER COLUMN id SET DEFAULT nextval('public.club_pricing_tiers_id_seq'::regclass);


--
-- Name: clubs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clubs ALTER COLUMN id SET DEFAULT nextval('public.clubs_id_seq'::regclass);


--
-- Name: conversation_members id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversation_members ALTER COLUMN id SET DEFAULT nextval('public.conversation_members_id_seq'::regclass);


--
-- Name: conversations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations ALTER COLUMN id SET DEFAULT nextval('public.conversations_id_seq'::regclass);


--
-- Name: event_registrations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_registrations ALTER COLUMN id SET DEFAULT nextval('public.event_registrations_id_seq'::regclass);


--
-- Name: friendships id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friendships ALTER COLUMN id SET DEFAULT nextval('public.friendships_id_seq'::regclass);


--
-- Name: golf_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.golf_events ALTER COLUMN id SET DEFAULT nextval('public.golf_events_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: password_reset_otps id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_otps ALTER COLUMN id SET DEFAULT nextval('public.password_reset_otps_id_seq'::regclass);


--
-- Name: payment_methods id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_methods ALTER COLUMN id SET DEFAULT nextval('public.payment_methods_id_seq'::regclass);


--
-- Name: pending_invitations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_invitations ALTER COLUMN id SET DEFAULT nextval('public.pending_invitations_id_seq'::regclass);


--
-- Name: platform_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_settings ALTER COLUMN id SET DEFAULT nextval('public.platform_settings_id_seq'::regclass);


--
-- Name: portal_slot_bookings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.portal_slot_bookings ALTER COLUMN id SET DEFAULT nextval('public.portal_slot_bookings_id_seq'::regclass);


--
-- Name: portal_tee_slots id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.portal_tee_slots ALTER COLUMN id SET DEFAULT nextval('public.portal_tee_slots_id_seq'::regclass);


--
-- Name: reviews id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews ALTER COLUMN id SET DEFAULT nextval('public.reviews_id_seq'::regclass);


--
-- Name: tee_time_schedule_configs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tee_time_schedule_configs ALTER COLUMN id SET DEFAULT nextval('public.tee_time_schedule_configs_id_seq'::regclass);


--
-- Name: user_ad_removal id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_ad_removal ALTER COLUMN id SET DEFAULT nextval('public.user_ad_removal_id_seq'::regclass);


--
-- Name: user_blocks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_blocks ALTER COLUMN id SET DEFAULT nextval('public.user_blocks_id_seq'::regclass);


--
-- Name: user_notification_prefs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_notification_prefs ALTER COLUMN id SET DEFAULT nextval('public.user_notification_prefs_id_seq'::regclass);


--
-- Name: user_notifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_notifications ALTER COLUMN id SET DEFAULT nextval('public.user_notifications_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vouchers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers ALTER COLUMN id SET DEFAULT nextval('public.vouchers_id_seq'::regclass);


--
-- Name: wallet_topups id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_topups ALTER COLUMN id SET DEFAULT nextval('public.wallet_topups_id_seq'::regclass);


--
-- Name: wallets id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallets ALTER COLUMN id SET DEFAULT nextval('public.wallets_id_seq'::regclass);


--
-- Data for Name: ad_removal_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ad_removal_config (id, price_zar, period_days, period_label, updated_at) FROM stdin;
1	29.99	30	30 days	2026-05-25 11:43:26
\.


--
-- Data for Name: ads; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ads (id, user_id, club_id, title, subtitle, image_url, cta_text, link_url, placement, priority, active, created_at) FROM stdin;
1	8	\N	Callaway Golf Sale — Up to 40% Off	Shop the latest Callaway drivers, irons and bags. Free delivery on orders over R1500.	https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=800	Shop Now	https://callaway.co.za	home	10	1	2026-05-18 14:04:23
2	8	\N	TaylorMade Stealth 2 Driver	The most forgiving driver ever made. Try it at your nearest pro shop.	https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800	Find a Dealer	https://taylormadegolf.co.za	explore	8	1	2026-05-18 14:04:23
3	8	6	Stay & Play at Leopard Creek	Combine a luxury lodge stay with a round on one of Africa's top-10 courses.	https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=800	Book a Stay	https://leopardcreek.co.za	club	9	1	2026-05-18 14:04:23
4	8	7	Fancourt Golf Academy	Improve your game with PGA-certified coaches. Packages from R2500.	https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=800	Book a Lesson	https://fancourt.co.za	club	9	1	2026-05-18 14:04:23
5	8	\N	Golf RSA Handicap System	Register your official South African handicap index. It's free for all licensed players.	\N	Register Free	https://golfrsa.co.za	home	6	1	2026-05-18 14:04:23
\.


--
-- Data for Name: app_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.app_settings (key, value, updated_at) FROM stdin;
notify_minutes_before	120	2026-05-25 14:56:56
\.


--
-- Data for Name: booking_players; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.booking_players (id, booking_id, user_id, paid, amount, guest_name) FROM stdin;
\.


--
-- Data for Name: bookings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bookings (id, user_id, tee_time_id, players, split_bill, total_amount, my_amount, booking_ref, payment_method, status, created_at, holes, voucher_code, discount_amount, cart_fee, platform_fee, club_amount, portal_slot_id) FROM stdin;
\.


--
-- Data for Name: club_images; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.club_images (id, club_id, url, caption, display_order, created_at) FROM stdin;
2	1	https://7b439aec-36fb-4d12-837d-d53c13e586bd-00-3diy9xc08mulk.riker.replit.dev/api/storage/objects/club-photos/1/9195e8f2-ca0d-4ed8-ac54-10335bdf5efc..jpg	\N	0	2026-05-25 13:47:21
3	1	https://7b439aec-36fb-4d12-837d-d53c13e586bd-00-3diy9xc08mulk.riker.replit.dev/api/storage/objects/club-photos/1/bddb631b-a603-41d2-9c5a-352c8f98d755..jpg	\N	0	2026-05-25 13:47:33
4	1	https://7b439aec-36fb-4d12-837d-d53c13e586bd-00-3diy9xc08mulk.riker.replit.dev/api/storage/objects/club-photos/1/c69ca327-7b9b-4c67-a44c-3d9639184b86..jpg	\N	0	2026-05-25 13:47:45
5	1	https://7b439aec-36fb-4d12-837d-d53c13e586bd-00-3diy9xc08mulk.riker.replit.dev/api/storage/objects/club-photos/1/1beea996-41d5-472d-818d-4231fb8ea6f6..jpg	\N	0	2026-05-25 13:47:59
\.


--
-- Data for Name: club_members; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.club_members (id, club_id, user_id, membership_type, status, added_by, created_at, start_date, renewal_date, benefits, prepaid_rounds, prepaid_rounds_used) FROM stdin;
1	1	2	full_member	active	1	2026-05-26 16:07:00	2026-03-01	2027-03-01	\N	10	1
\.


--
-- Data for Name: club_memberships; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.club_memberships (id, user_id, club_id, plan_name, plan_details, start_date, expiry_date, status, notes, created_at) FROM stdin;
\.


--
-- Data for Name: club_notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.club_notifications (id, club_id, sent_by, type, title, body, tee_shift_minutes, affected_date, recipient_count, sent_at) FROM stdin;
\.


--
-- Data for Name: club_password_reset_otps; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.club_password_reset_otps (id, club_id, email, otp_hash, reset_token, expires_at, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: club_pricing_tiers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.club_pricing_tiers (id, club_id, tier_type, price_18h, price_9h, hidden) FROM stdin;
1	1	full_member	200.00	100.00	0
2	1	six_day_member	210.00	105.00	0
3	1	week_day_member	220.00	110.00	0
4	1	pensioner_full	180.00	90.00	0
5	1	pensioner_six_day	190.00	95.00	0
6	1	pensioner_week_day	200.00	100.00	0
7	1	student_member	180.00	90.00	0
8	1	junior_member	180.00	90.00	0
9	1	honorary	200.00	100.00	0
10	1	affiliated_visitor	350.00	175.00	0
11	1	affiliated_pensioner	300.00	150.00	0
12	1	non_affiliated_visitor	400.00	200.00	0
13	1	non_affiliated_pensioner	350.00	175.00	0
14	1	student_visitor	250.00	125.00	0
15	1	junior_visitor	250.00	125.00	0
\.


--
-- Data for Name: clubs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.clubs (id, name, location, province, image_url, holes, price_from, facilities, featured, active, created_at, latitude, longitude, cart_available, cart_compulsory, cart_price, geofence_enabled, geofence_radius_m, ninth_tee_lat, ninth_tee_lng, ninth_tee_radius_m, website, logo_url, username, password_hash, description, phone, email, address) FROM stdin;
1	Aberdeen Golf Club	Aberdeen	Eastern Cape	/api/logos/1.png	18	0.00	["Pro Shop", "Club Hire", "Restaurant", "Bar", "Wi-Fi", "Parking", "Putting Green", "Caddie Service", "Locker Rooms"]	0	1	2026-05-20 18:27:13	-32.4775480	24.0534700	1	0	200.00	1	200	\N	\N	50	https://www.aberdeengolf.com/contact/	https://7b439aec-36fb-4d12-837d-d53c13e586bd-00-3diy9xc08mulk.riker.replit.dev/api/storage/objects/club-logos/1/f98deb6c-fd7b-4008-8efa-59d71fec1219..png	aberdeen_golf_club	$2b$08$.oEchSZh6dB411ifgiSH1.V0WTF0HQU9dAoQmTHOVQKd.LzJ5OCVS	Set in the magnificent surrounds of Waterkloof, the Country Club boasts a par 72, 'parklands' golf course, designed by the Gary Player group.	\N	\N	\N
2	Adelaide Golf Course	Adelaide	Eastern Cape	/api/logos/2.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-32.6908390	26.2916580	1	1	250.00	0	200	\N	\N	50	\N	\N	adelaide_golf_course	$2b$08$w70a5ee2v/JwaNDccr72a.ONWS4MWixI/ek.AMSSKQgotFPDjZQ.O	\N	0409554688	\N	\N
3	Akasia Country Club	Theresapark	Gauteng	/api/logos/3.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-25.6604150	28.1425740	0	0	\N	0	200	\N	\N	50	\N	\N	akasia_country_club	$2b$08$J4/wrZ0ob1WVBklaVYCdT.R1DNXsjtXsKEGRZ0L5pXVbObe/gMoc2	\N	012 542 4257	\N	\N
4	Albertinia Golf Course	Albertinia	Western Cape	/api/logos/4.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-34.2018770	21.5818050	1	0	200.00	0	200	\N	\N	50	\N	\N	albertinia_golf_course	$2b$08$cWdk1sb.W1ghI8f.PvmbSOHxiLO.wYz1q6sNHRjH8uLVLFpJ16Tke	\N	028 735 1646	\N	\N
5	Alexander Bay Golf Club	Alexander Bay	Northern Cape	/api/logos/5.png	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-28.5997460	16.4889160	1	1	250.00	0	200	\N	\N	50	\N	\N	alexander_bay_golf_club	$2b$08$toYSB4tIwATME2y0TRrWJeAzblWXwFW/FRdGM5RWXY520qesqvZDC	\N	\N	\N	\N
6	Alexander Golf Club	East London	Eastern Cape	/api/logos/6.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-33.0428510	27.8565470	0	0	\N	0	200	\N	\N	50	\N	\N	alexander_golf_club	$2b$08$p/eQpyMcPm5OQdSSjHqu2u/068831jMxy6xLQPku5PoxN2lnft5tW	\N	+27437362313	\N	\N
7	Alexandria Golf Club	Alexandria	Eastern Cape	/api/logos/7.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-33.6512440	26.4021120	1	0	200.00	0	200	\N	\N	50	\N	\N	alexandria_golf_club	$2b$08$gLPCUmTW3qfkG1Lbbjuw.udjoqI8BTNGf8HTAngvzTFMcOUoZcGRC	\N	\N	\N	\N
8	Aliwal North Golf Club	Aliwal North	Eastern Cape	/api/logos/8.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-30.6983110	26.7160680	1	1	250.00	0	200	\N	\N	50	\N	\N	aliwal_north_golf_club	$2b$08$Q5IbIjgW/GrbO8cyogh17ejnD7PkvWTsm8XIhJQZPBNHLxJgM43IC	\N	+27516332391	\N	\N
9	Amandelbult Golf Club	Amandelbult	Limpopo	/api/logos/9.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-24.8134270	27.2979500	0	0	\N	0	200	\N	\N	50	\N	\N	amandelbult_golf_club	$2b$08$lZK5CnMlbR8hCuk.lrx/d.gCGHhGyjBFc1wFIZbjdJNV.8j/XH/F6	\N	014 784 1065	\N	\N
10	Amanzimtoti Country Club	Prospecton	KwaZulu-Natal	/api/logos/10.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-30.0112860	30.9317370	1	0	200.00	0	200	\N	\N	50	https://amanzimtotigolfclub.co.za/contact/	\N	amanzimtoti_country_club	$2b$08$ppfm7dHf5UgHfeOBQ5E/Je1IrXG28Zr7k1YyNGevmMXIIVas00466	\N	031 902 1166	\N	\N
11	Amatikulu Country Club	Amatikulu	KwaZulu-Natal	/api/logos/11.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-29.0474460	31.5303300	1	1	250.00	0	200	\N	\N	50	\N	\N	amatikulu_country_club	$2b$08$5TLt8HRJgyNbhVo5KUffbeNyO1fpsdgpl58JZ0INqPEejL6CluMtq	\N	\N	\N	\N
12	Amersfoort Golf Club	Amersfoort	Mpumalanga	/api/logos/12.png	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-27.0169900	29.8647450	0	0	\N	0	200	\N	\N	50	\N	\N	amersfoort_golf_club	$2b$08$bxTAkjdVaDdNNwJh6hdPgOwPWA0EscG3HwZzOjHyuFuBnEJ0o9CdW	\N	\N	\N	\N
13	Amorello Bush Golf Lodge	Hluluwe	KwaZulu-Natal	/api/logos/13.png	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-27.8980760	32.3600830	1	0	200.00	0	200	\N	\N	50	https://amorello.co.za/	\N	amorello_bush_golf_lodge	$2b$08$5u/0wXcpeZWLCSfC7Qw/y.QpChwUjhXtwIdysHrF6B1N9ubFV7nTC	\N	035 562 3182	\N	\N
14	Amphitheatre Golf Course	Bergville	KwaZulu-Natal	/api/logos/14.png	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-28.6581990	29.0338310	1	1	250.00	0	200	\N	\N	50	\N	\N	amphitheatre_golf_course	$2b$08$ZKm49RThd8kAZ4n6/UFIrOtlU1vqAPsaxdHM1vAvBxNnKASkaH2ou	\N	\N	\N	\N
15	Arabella Golf Club	Kleinmond	Western Cape	/api/logos/15.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-34.3173510	19.1350540	0	0	\N	0	200	\N	\N	50	\N	\N	arabella_golf_club	$2b$08$47ed3aauEM9bOiwCpQgHJ.yjw1bZechOk0ilJNXIKnI33o7tOGP66	\N	+27 28 284 0000	\N	\N
16	Arnot Golf Club	Rietkuil	Mpumalanga	/api/logos/16.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-25.9401370	29.8122600	1	0	200.00	0	200	\N	\N	50	\N	\N	arnot_golf_club	$2b$08$vuoC3HLC/ZOmBMKwcQriq.XBDCQikx0C.ejTiCKR3jmpnbvi3wtSy	\N	\N	\N	\N
17	Arrow Rest Mashie Course	Hartbeespoort	North West	/api/logos/17.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-25.7772300	27.8282290	1	1	250.00	0	200	\N	\N	50	https://arrowrest.co.za/	\N	arrow_rest_mashie_course	$2b$08$1lTPww8yEbXiOYfjhs0syuffwETvgjYbx1k4WTHpVSKFn613CflLK	\N	\N	\N	\N
18	Atlantic Beach Golf Club	Melkbosstrand	Western Cape	/api/logos/18.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-33.7392100	18.4532490	0	0	\N	0	200	\N	\N	50	https://golf.atlanticbeachestate.co.za/members/contacts/	\N	atlantic_beach_golf_club	$2b$08$LCoIYw7Wo1cT2ZZZMJesXOdAwCzCsk8V8X8n/6T2rMcHNzzDTXi0S	\N	+27 21 553 2223	\N	\N
19	Augusta Country Estate	Hillcrest	KwaZulu-Natal	/api/logos/19.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-29.7909740	30.7859440	1	0	200.00	0	200	\N	\N	50	https://www.augusta.co.za/	\N	augusta_country_estate	$2b$08$KzwKAJMa8oeDVPuPYvGJpOpstdwD.rccyPIrvA8FkmSbewdgdNWzW	\N	031 7671607	\N	\N
20	Avion Park Golf Club	Kempton Park	Gauteng	/api/logos/20.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-26.1007420	28.2490310	1	1	250.00	0	200	\N	\N	50	\N	\N	avion_park_golf_club	$2b$08$RYWmuApX8qHEC4fFtJQBhO4.9li.oYEYjk3hpsstmnTLqKWIdSpse	\N	\N	\N	\N
21	Badplaas Golf Course	Badplaas	Mpumalanga	/api/logos/21.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-25.9363170	30.5207710	0	0	\N	0	200	\N	\N	50	\N	\N	badplaas_golf_course	$2b$08$LMTyBGSX2kNWSystlArnTOeLNPVCqU94xR65beuvVVxsvp/vi/hP2	\N	\N	\N	\N
22	Balkfontein Golf Club	Lejweleputswa	Free State	/api/logos/22.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-27.4034120	26.5044780	1	0	200.00	0	200	\N	\N	50	\N	\N	balkfontein_golf_club	$2b$08$eDApw00/eGffcaVGYwUqIetz9RqYsc3.gyKMfHvluHCxRbuND9JC2	\N	\N	\N	\N
23	Bank Golf Club	Middelburg	Mpumalanga	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-25.9700040	29.4636580	1	1	250.00	0	200	\N	\N	50	\N	\N	bank_golf_club	$2b$08$vmjruov6nP7F3G7kmp0Qm..EaXI7t2XUEfXy23avXYv9J9WRwYQRa	\N	\N	\N	\N
24	Bankenveld Golf Club	Witbank	Mpumalanga	/api/logos/24.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-25.9050600	29.2826530	0	0	\N	0	200	\N	\N	50	https://www.bankenveldgolfclub.co.za/contact	\N	bankenveld_golf_club	$2b$08$jRBdr1cuPfaWr8v3/K69i.OjXfCal7EI0Mqaz/mWyJg.bdsDEKBxK	\N	072 076 5890	\N	\N
25	Barberton Golf Club	Barberton	Mpumalanga	/api/logos/25.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-25.7923360	31.0407540	1	0	200.00	0	200	\N	\N	50	\N	\N	barberton_golf_club	$2b$08$UsHFovkx.Qv0rFM0r0NNdehQvt.TE6BSd1Grj3RWs851hfR0JW0Su	\N	\N	\N	\N
26	Barkly East Golf Course	Barkly East	Eastern Cape	/api/logos/26.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-30.9703080	27.6050210	1	1	250.00	0	200	\N	\N	50	\N	\N	barkly_east_golf_course	$2b$08$EiOdzDLCEFUQsuorUTlxce4I9803O06pS1n6rOpuAbL7313QKk0xu	\N	079 040 6517	\N	\N
27	Beachwood Golf Club	Durban North	KwaZulu-Natal	/api/logos/27.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-29.7782530	31.0497730	0	0	\N	0	200	\N	\N	50	\N	\N	beachwood_golf_club	$2b$08$..l8HXk07bWLToCdvA485Ol0hDMpbH4nqFcMclYBSXFj3AwSX9SEG	\N	\N	\N	\N
28	Beaufort West Golf Club	Beaufort West	Western Cape	/api/logos/28.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-32.3419360	22.5772570	1	0	200.00	0	200	\N	\N	50	\N	\N	beaufort_west_golf_club	$2b$08$Cp425n3oA16iHOSKEyBPZObTKHQYcmiQHX1.I4vwh/veJphDhb5Yi	\N	023 414 3050	\N	\N
29	Bedford Golf Course	Bedford	Eastern Cape	/api/logos/29.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-32.6765580	26.0969280	1	1	250.00	0	200	\N	\N	50	\N	\N	bedford_golf_course	$2b$08$2sQUz0dFwnk/UNiFCcxMjuXwxW0zDzAL/o06iG7n6Q1986sN3suny	\N	0721111430	\N	\N
30	Belfast Golf Club	Belfast	Mpumalanga	/api/logos/30.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-25.6986310	30.0482730	0	0	\N	0	200	\N	\N	50	\N	\N	belfast_golf_club	$2b$08$Ip3dF8nwsKsTjxlULPdMY.AcSUrfYvyhtzuxochq/j2UMT7aovA0e	\N	\N	\N	\N
31	Bellville Golf Club	Welgemoed	Western Cape	/api/logos/31.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-33.8706140	18.6175990	1	0	200.00	0	200	\N	\N	50	https://bellvillegolfclub.co.za/contact-us/	\N	bellville_golf_club	$2b$08$vOgiJ/5oFvC0/PLTpKTWd.oa1RVWbVRYjhEzmJYVz3Hbp405.S/yq	\N	\N	\N	\N
32	Benoni Country Club	Benoni	Gauteng	/api/logos/32.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-26.1722300	28.3425340	1	1	250.00	0	200	\N	\N	50	http://www.benonicc.co.za	\N	benoni_country_club	$2b$08$YY9wNEAprWwOzW7IQzSzS.Wyn/aNDZkWtWmjNmeiuhKrXTW6W/Hnu	\N	+27118495255	\N	\N
33	Berg River Golf Club	Velddrif	Western Cape	/api/logos/33.png	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-32.7788340	18.1620240	0	0	\N	0	200	\N	\N	50	\N	\N	berg_river_golf_club	$2b$08$2XfG24Q3pAYQFavk2jUZ6.29jPr.xoH3aV3Jjx0M.pXwA0uReUEz.	\N	\N	\N	\N
34	Bethal Golf Club	Bethal	Mpumalanga	/api/logos/34.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-26.4641980	29.4754170	1	0	200.00	0	200	\N	\N	50	\N	\N	bethal_golf_club	$2b$08$WxaTYj2OsM/DjEPWhPy5ZuRr4kFlJGefyfkejLMisc.2CI4G4RqUu	\N	0236355601	\N	\N
35	Bethlehem Golf Club	Bethlehem	Free State	/api/logos/35.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-28.2257890	28.3065020	1	1	250.00	0	200	\N	\N	50	\N	\N	bethlehem_golf_club	$2b$08$lfIsXSuA.8NqgpIhxSZ6XuEusBrNx5H0gqHdFL2KHe3NNYDOCFLQq	\N	\N	\N	\N
36	Bethulie Golf Course	Bethulie	Free State	/api/logos/36.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-30.4961370	25.9673880	0	0	\N	0	200	\N	\N	50	\N	\N	bethulie_golf_course	$2b$08$.wfbhoQrIZfk3cXCZDhiq.nyYAcX9ZQeOPRdlqNj7EgURM154Dg4W	\N	\N	\N	\N
37	Black Mountain Golf Course	Aggeneys	Northern Cape	/api/logos/37.webp	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-29.2614120	18.8238010	1	0	200.00	0	200	\N	\N	50	https://www.blackmountaingolf.org/contact	\N	black_mountain_golf_course	$2b$08$6UXERorJhTu8q7HKpmrDZOcIEluUPvIPsK4hHv/keynBCFjRLEUDO	\N	\N	\N	\N
38	Blair Atholl Golf Club	Fourways	Gauteng	/api/logos/38.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-25.9069340	27.9193170	1	1	250.00	0	200	\N	\N	50	https://www.blairatholl.co.za/	\N	blair_atholl_golf_club	$2b$08$Z8T0MD1M8DWlb4qUVSJmfuAHeamOMn.cn3VGEudXM/4xdrp4RuKKm	\N	\N	\N	\N
39	Bloemfontein Golf Club	Bloemfontein	Free State	/api/logos/39.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-29.1162160	26.2573670	0	0	\N	0	200	\N	\N	50	\N	\N	bloemfontein_golf_club	$2b$08$562xhbMemkxTGJSZdkkHBeNtQhlnci6d7fdpCGQU/n8kO4lqxz6DK	\N	\N	\N	\N
40	Bloemhof Golf Course	Bloemhof	North West	/api/logos/40.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-27.6522450	25.5955050	1	0	200.00	0	200	\N	\N	50	\N	\N	bloemhof_golf_course	$2b$08$EbkUOUZjRlfgTiwx2eLCYuBRuHthU1Yusx1vL1KCS3XPeYuXgWWmy	\N	\N	\N	\N
41	Blue Valley Golf & Country Estate	Centurion	Gauteng	/api/logos/41.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-25.9347550	28.1236970	1	1	250.00	0	200	\N	\N	50	https://www.bluevalley.co.za/	\N	blue_valley_golf_country_estat	$2b$08$Ez5UOgt3VA34q8ru18SaEud3UborXD3ADmSPNI2aJSs6MJZz7.sSO	\N	082 964 3267	\N	\N
42	Bluff National Park Golf Club	Durban	KwaZulu-Natal	/api/logos/42.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-29.9231560	31.0131660	0	0	\N	0	200	\N	\N	50	\N	\N	bluff_national_park_golf_club	$2b$08$2xI3IWrzysDtOIsdf.Xbm.OoVKrG1Uol2LFpX8/m/7fg.2KPQKmUq	\N	076 018 5289	\N	\N
43	Blyvooruitzicht Golf Course	Blyvooruitzicht	Gauteng	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-26.4062040	27.3921010	1	0	200.00	0	200	\N	\N	50	\N	\N	blyvooruitzicht_golf_course	$2b$08$Nm/fcB99OcZjwLR.QNuhlegKQ4A9NdhH..xQJ4UM7xrj.suN0zmum	\N	0888233248	\N	\N
44	Boggomsbaai Golf Club	Mossel Bay	Western Cape	/api/logos/44.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-34.2594710	21.9054030	1	1	250.00	0	200	\N	\N	50	\N	\N	boggomsbaai_golf_club	$2b$08$Jdu5mN060B9FGMfUr61dhu92WUWPBe/rozrLANWEf3j/dzCtBGhZS	\N	\N	\N	\N
45	Bonnievale Golf Course	Bonnievale	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-33.9287490	20.1006850	0	0	\N	0	200	\N	\N	50	\N	\N	bonnievale_golf_course	$2b$08$LCbEHzsexzdD9cCkFvGejuOPyicg/Il6soPNFfTgXfrwThh4SLLPG	\N	023 616 3939	\N	\N
46	Bosch Hoek Golf Club	Balgowan	KwaZulu-Natal	/api/logos/46.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-29.3521710	30.0966220	1	0	200.00	0	200	\N	\N	50	https://boschhoek.co.za/golf-1/	\N	bosch_hoek_golf_club	$2b$08$O8LmUcA.YC7LOKBHZdVh.OEpy9LE0PkSXxAOpLJF/E0GYloWaKCGS	\N	076 164 9009	\N	\N
47	Bothaville Golf Course	Bothaville	Free State	/api/logos/47.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-27.3946670	26.6243360	1	1	250.00	0	200	\N	\N	50	\N	\N	bothaville_golf_course	$2b$08$WgeqO3XSDxfx5iWV4YO6quiv3mMt4INd2i10yLLLAC8DMac.jA2zC	\N	\N	\N	\N
48	Brand Mashie Golf Club	Welkom	Free State	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-28.0227260	26.7703870	0	0	\N	0	200	\N	\N	50	\N	\N	brand_mashie_golf_club	$2b$08$/mzsdtE0bpVIZa4NC0eMxePr9j0C9XwgxnOHRrToCjFH3smeUn9Ey	\N	\N	\N	\N
49	Brandfort Golf Club	Brandfort	Free State	/api/logos/49.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-28.6967180	26.4694550	1	0	200.00	0	200	\N	\N	50	\N	\N	brandfort_golf_club	$2b$08$rKX/y4943To54c801gPRlOPi2hGTUh.WXJnkL5wyrQWa891Sl0fW.	\N	0635773290	\N	\N
50	Bredasdorp Golf Club	Bredasdorp	Western Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:13	-34.5434620	20.0480100	1	1	250.00	0	200	\N	\N	50	\N	\N	bredasdorp_golf_club	$2b$08$jtMxW3K7iO0u7pBT4mF20.Bmlw4qNPlZGXNMIxlO2Tg73KhFx3piu	\N	\N	\N	\N
51	Bronkhorstspruit Golf Club	Bronkhorstspruit	Gauteng	/api/logos/51.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.8079570	28.7246430	0	0	\N	0	200	\N	\N	50	\N	\N	bronkhorstspruit_golf_club	$2b$08$7ahjkg1lHXZC.0djudUR4eEa3IDPfAIDwcFhCzZCF1eHYSfF.V6Ry	\N	\N	\N	\N
52	Bryanston Country Club	Bryanston	Gauteng	/api/logos/52.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.0619740	28.0125830	1	0	200.00	0	200	\N	\N	50	https://www.bryanstoncc.co.za/golf/	\N	bryanston_country_club	$2b$08$uLYndMAg221hKWtkMnRfY.a.nAprV8kaj7X9e7wTjxcfe85bJyY8O	\N	+27 11 021-1992	\N	\N
53	Bultfontein Golf Course	Bultfontein	Free State	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.2801110	26.1335060	1	1	250.00	0	200	\N	\N	50	\N	\N	bultfontein_golf_course	$2b$08$NbbnhnYFTf0ot8f7b6J4y.g1iyRBZWFYOa/qkju2FVHQV3y1mEkqu	\N	\N	\N	\N
54	Burgersdorp Golf Club	Burgersdorp	Eastern Cape	/api/logos/54.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-30.9900710	26.3285850	0	0	\N	0	200	\N	\N	50	\N	\N	burgersdorp_golf_club	$2b$08$SbF0/V32nAJFIl82j5Bq/OqzobbokT5njG3YwR7gXJqzQblPOY5pO	\N	\N	\N	\N
55	Bushman Sands Golf Course	Alicedale	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.3156710	26.0821560	1	0	200.00	0	200	\N	\N	50	\N	\N	bushman_sands_golf_course	$2b$08$XShOzBRBQTQjdB94J51tbOupt1ZmkgSajVYBKtrQL4sPmMMppa.3u	\N	042 231 8001	\N	\N
56	Butterworth Country Club	Butterworth	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.3238800	28.1444620	1	1	250.00	0	200	\N	\N	50	\N	\N	butterworth_country_club	$2b$08$h99Awvneaz635itcWMyVn.Kzg7XuzeBtiuMm/jOAxulhohE/7Bdry	\N	0637029655	\N	\N
57	C.M.R. Golf Course	Roodepoort	Gauteng	/api/logos/57.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.1888100	27.9372670	0	0	\N	0	200	\N	\N	50	\N	\N	c_m_r_golf_course	$2b$08$AUluC0L3U52MM5.pfTU21.gJU21uhw1rHNBoiL5Jphxg3mKhVK9bG	\N	011 472 8060	\N	\N
58	Caledon Golf Club	Caledon	Western Cape	/api/logos/58.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.2352870	19.4336990	1	0	200.00	0	200	\N	\N	50	\N	\N	caledon_golf_club	$2b$08$1wy7YirsV9XmfpxE6B31cOoSG0qU4IJy9T1WrHuhCKH5IDTe4gxWS	\N	\N	\N	\N
59	Calvinia Golf Course	Calvinia	Northern Cape	/api/logos/59.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-31.4815580	19.7584300	1	1	250.00	0	200	\N	\N	50	\N	\N	calvinia_golf_course	$2b$08$M5OuzOvHlEISoFI8QXBiMOggbUdhgVkW7pHAaWtzOPZpwtk3jrdr2	\N	\N	\N	\N
60	Camelot Country Club	Durban	KwaZulu-Natal	/api/logos/60.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.7612130	30.7711300	0	0	\N	0	200	\N	\N	50	\N	\N	camelot_country_club	$2b$08$GVPitzhL/L4/EyoRwCF./.fNIa/SYb5LHEhDHSC5qWGHDvWdW2hIS	\N	\N	\N	\N
61	Carnarvon Golf Club	Carnarvon	Northern Cape	/api/logos/61.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-30.9729060	22.1243160	1	0	200.00	0	200	\N	\N	50	\N	\N	carnarvon_golf_club	$2b$08$sEsrrfvbXLbmUmfwPtwAeeq8nFvESqrFgcl1NH5mFN2J478snW56.	\N	053 382 3349	\N	\N
62	Carolina Golf Course	Carolina	Mpumalanga	/api/logos/62.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.0676650	30.1043970	1	1	250.00	0	200	\N	\N	50	\N	\N	carolina_golf_course	$2b$08$8y4PBhu6J0FzJZfkKeybQOI2O1v4sDayVIF/pmzEXPZD3hvQTa35W	\N	\N	\N	\N
63	Cathcart Country Club	Cathcart	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.2914580	27.1426460	0	0	\N	0	200	\N	\N	50	\N	\N	cathcart_country_club	$2b$08$wdnAQSK2rH/GA7L5quplfuwBHMBVpNLQxXvaFzwZ3p4s23R/FDVkq	\N	0345951132	\N	\N
64	Cathedral Peak Hotel Golf Club	Drakensberg	KwaZulu-Natal	/api/logos/64.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.9438300	29.2094790	1	0	200.00	0	200	\N	\N	50	https://www.cathedralpeak.co.za/discover-more/golf-club/	\N	cathedral_peak_hotel_golf_club	$2b$08$0bYTRIDaWv8QRPbFjhP.E./O5hhpA3/VJdlNklpr7328ww0y4WTHa	\N	\N	\N	\N
65	Cato Ridge Country Club	Cato Ridge	KwaZulu-Natal	/api/logos/65.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.7384670	30.5911950	1	1	250.00	0	200	\N	\N	50	\N	\N	cato_ridge_country_club	$2b$08$Yob36Nq.s0j1zo/ujC1gLek20.4So0HVHXRR5Z0Zhd.5AcgeZiPo2	\N	\N	\N	\N
66	Centurion Golf Club	Centurion	Gauteng	/api/logos/66.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.8731480	28.2047890	0	0	\N	0	200	\N	\N	50	https://centuriongolfestate.online/contact-us/	\N	centurion_golf_club	$2b$08$1jCq.ZAntlBK5th.ik4QKuOyr0v3owoGSIpoZb4p6Pf92eW9eNwnu	\N	+27 12 665-9602	\N	\N
67	Centurion Lake Golf Course	Centurion	Gauteng	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.8500230	28.1811020	1	0	200.00	0	200	\N	\N	50	https://centuriongolfestate.online/contact-us/	\N	centurion_lake_golf_course	$2b$08$3kmfoIHoCqTnGMPEqSaS.ujoIOu0VSVUG4tAyW1qrSLV.Jzb7SKp6	\N	+27126650279	\N	\N
68	Ceres Golf Club	Ceres	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.3757480	19.3035930	1	1	250.00	0	200	\N	\N	50	https://ceresgolfclub.com/contact-us/	\N	ceres_golf_club	$2b$08$r9edBs4h9lQrODcncx/0su.QvUNOz6OZeTABFEQfzhgoHaCn7VW9S	\N	0958928439	\N	\N
69	Champagne Sports Resort	Winterton	KwaZulu-Natal	/api/logos/69.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.0016320	29.4676920	0	0	\N	0	200	\N	\N	50	\N	\N	champagne_sports_resort	$2b$08$oy528Lz4rlfYcCP0IBKYKeG8EMu/BlWzG1SoNKdlW6/A69odcyUm2	\N	\N	\N	\N
70	Chelsea Mashie Golf Club	Port Elizabeth	Eastern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.9767740	25.4669450	1	0	200.00	0	200	\N	\N	50	\N	\N	chelsea_mashie_golf_club	$2b$08$2AaFLTJSFEFDGRydz8DMK.XqCkT2B1wr1sr4K1uOV.IB0kjaduqRK	\N	\N	\N	\N
71	Christiana Golf Club	Christiana	North West	/api/logos/71.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-27.9003170	25.1507520	1	1	250.00	0	200	\N	\N	50	\N	\N	christiana_golf_club	$2b$08$bZUpkoadmZvYLSfYVDJieeE7Y9520Uusc0vqMij2f2NbQW8y.gV6u	\N	\N	\N	\N
72	Chrome Golf Club	Steelport	Mpumalanga	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-24.7953180	30.1660370	0	0	\N	0	200	\N	\N	50	\N	\N	chrome_golf_club	$2b$08$9Jv1013xOcSNTANiN5BzZO8gEYbvGPswmZrQt0wempsf6wxWQh0LS	\N	\N	\N	\N
73	Citrusdal Golf Club	Citrusdal	Western Cape	/api/logos/73.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.5935380	19.0091280	1	0	200.00	0	200	\N	\N	50	https://citrusdalgolfclub.co.za/	\N	citrusdal_golf_club	$2b$08$ePGC0gmVldUb904R8/chfeVTHUsV.PKoEt4HwaRlibFcZRIdlkeQu	\N	063 119 3631	\N	\N
74	Clanwilliam Golf Course	Clanwilliam	Western Cape	/api/logos/74.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.1920360	18.9013100	1	1	250.00	0	200	\N	\N	50	\N	\N	clanwilliam_golf_course	$2b$08$uYdVPscsgLkLFF4SOOosAeV64RfoxvcK/iUzqXg9klTNL4tqd6YZi	\N	027 482 2918	\N	\N
75	Clocolan Golf Club	Clocolan	Free State	/api/logos/75.png	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.9172390	27.5713760	0	0	\N	0	200	\N	\N	50	\N	\N	clocolan_golf_club	$2b$08$X6x5ePS/NVAZ.56tRgJ0M.a0NQTJeNyHlwkUCA47k/FwZFnEmK00.	\N	\N	\N	\N
76	Clovelly Country Club	Cape Town	Western Cape	/api/logos/76.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.1226650	18.4281800	1	0	200.00	0	200	\N	\N	50	https://clovellygolfclub.co.za/	\N	clovelly_country_club	$2b$08$1l2bOulnTWK4cg90rXI.mut1XguVGPvCLGMGZKMVx1.yveIfiAaWq	\N	+27 21 784 2111	\N	\N
77	Colesberg Golf Club	Colesberg	Northern Cape	/api/logos/77.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-30.7351410	25.0837900	1	1	250.00	0	200	\N	\N	50	\N	\N	colesberg_golf_club	$2b$08$4UCAq0y69vuMA.PizfsBbu88tQ8FUhGTkqBm.MZrgxydY8fqs4PB.	\N	\N	\N	\N
78	Correctional Services Golf Course	Kimberley	Northern Cape	\N	6	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.7415220	24.7186800	0	0	\N	0	200	\N	\N	50	\N	\N	correctional_services_golf_cou	$2b$08$lYw9pfpXgVIjqYTmxYDZguVFshdnF.BTWmqcvFN3GUm66ZOYMPJUq	\N	012 307 2998	\N	\N
79	Cotswold Downs Golf Course	Hillcrest	KwaZulu-Natal	/api/logos/79.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.7564320	30.7831340	1	0	200.00	0	200	\N	\N	50	https://cotswolddowns.co.za/	\N	cotswold_downs_golf_course	$2b$08$jVqneJLQQA4aoD1SpD.Wbe0BWHhkEF/lfj4aMgDkdr463I840QqGK	\N	031 762 3660	\N	\N
80	Cradock Golf Club	Cradock	Eastern Cape	/api/logos/80.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.1493860	25.6220700	1	1	250.00	0	200	\N	\N	50	\N	\N	cradock_golf_club	$2b$08$6uMq22uOzN40XHVj.VJxW.xpg7JdJErM9Gq3SSq.0yAyuPI4.qAsa	\N	0647473382	\N	\N
81	Creek 9 Golf Course	Roosevelt Park	Gauteng	/api/logos/81.png	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.1502440	27.9906450	0	0	\N	0	200	\N	\N	50	\N	\N	creek_9_golf_course	$2b$08$.fR9rs8RL6B3RM92BIGu4OnBSpsj3ZbTWaH1o1kTV2xgiGXkmJFLq	\N	\N	\N	\N
82	Creighton Golf Club	Creighton	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-30.0252480	29.8390570	1	0	200.00	0	200	\N	\N	50	\N	\N	creighton_golf_club	$2b$08$eC87ldFR/3h6Rdxdxv5pjeoFuH.1qFkui0imFPGpyaQf7OkXlal/O	\N	\N	\N	\N
83	Crown Mines Golf Course	Crown Mines	Gauteng	/api/logos/83.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.2341760	27.9915070	1	1	250.00	0	200	\N	\N	50	\N	\N	crown_mines_golf_course	$2b$08$k7MUnOed5dTCplr2Qgr1ZOxuxcLxlaFAtCZkoRIbf6r2eqOJMovRa	\N	\N	\N	\N
84	Cullinan Golf Club	Cullinan	Gauteng	/api/logos/84.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.6703840	28.5246690	0	0	\N	0	200	\N	\N	50	https://www.cullinangolfclub.com/	\N	cullinan_golf_club	$2b$08$dcra00Mgq3icG1LCZOgtheezPqsRc/QE4MljLDtVZJvNZpjLBrzyq	\N	012 734 0090	\N	\N
85	Dainfern Golf and Country Estate	Bryanston	Gauteng	/api/logos/85.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.9889320	27.9974340	1	0	200.00	0	200	\N	\N	50	https://dainfern.co.za/contact-us/	\N	dainfern_golf_and_country_esta	$2b$08$EShGT8bupOPJnXIeD92i4Om67QVhb/bRr1xY5ZEf1YtFyrx7MYViW	\N	+27118750401	\N	\N
86	Darling Golf Course	Darling	Western Cape	/api/logos/86.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.3772680	18.3883310	1	1	250.00	0	200	\N	\N	50	\N	\N	darling_golf_course	$2b$08$IHS4LCbsjgnzXh6JKVlqR.p1j2WmGJXNtqk9/xVCl5UYqnPfcpz4i	\N	022 492 3013	\N	\N
87	Darnall Country Club	Darnall	KwaZulu-Natal	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.2661630	31.3693570	0	0	\N	0	200	\N	\N	50	\N	\N	darnall_country_club	$2b$08$/p9F4GX7Z5t4vlNi7SJZJer9WcVTKl.8aPVTxrOWPEGRv2DoX.O1i	\N	078 579 6635	\N	\N
88	Daveyton Golf Course	Daveyton	Gauteng	/api/logos/88.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.1278490	28.4428520	1	0	200.00	0	200	\N	\N	50	\N	\N	daveyton_golf_course	$2b$08$ziWy87Ks.o5dFiRhDtetheJEaPIy4JfZXmVqvEUWcKf1d5DxkdSJe	\N	\N	\N	\N
89	De Aar Golf Club	De Aar	Northern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-30.6684820	23.9948520	1	1	250.00	0	200	\N	\N	50	\N	\N	de_aar_golf_club	$2b$08$gT.7ZSZIcVXhkP95Qp/LyedVJJs0ssOVY3OH1OA9eI.aoVxhe.yui	\N	053 631 3213	\N	\N
90	De Hoek Golf Club	De Hoek	Western Cape	/api/logos/90.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.9434630	18.7609460	0	0	\N	0	200	\N	\N	50	https://dehoek.com/contact-us/	\N	de_hoek_golf_club	$2b$08$U6c7841ngz4fTNtOy0Pc4emRonlOZMZYDaTNavosm1ub9RB.LSwFy	\N	022 913 8271	\N	\N
91	De Zalze Golf Course	Stellenbosch	Western Cape	/api/logos/91.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.9713370	18.8354790	1	0	200.00	0	200	\N	\N	50	https://dezalzegolf.com/contact-us/	\N	de_zalze_golf_course	$2b$08$.BZ0JK3ZqLbo1thC5b905.pwtU88cMRSLKLOX09w9N7tEl8NgBEEe	\N	\N	\N	\N
92	Delareyville Golf Course	Delareyville	North West	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.6968420	25.4773380	1	1	250.00	0	200	\N	\N	50	\N	\N	delareyville_golf_course	$2b$08$MoqHixAagJpEjreRV0OhUOPWBxhOa07ogxqpQEFGbwZF.AnSyRCWO	\N	\N	\N	\N
93	Delmas Golf Club	Delmas	Mpumalanga	/api/logos/93.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.1422570	28.6814640	0	0	\N	0	200	\N	\N	50	\N	\N	delmas_golf_club	$2b$08$/k22p4O1E6JPV591QJ9omOh9EnjonfGSrfwHVPVreOTR5SP4/5kY.	\N	\N	\N	\N
94	Devonvale Golf & Wine Estate	Stellenbosch	Western Cape	/api/logos/94.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.8825820	18.8044820	1	0	200.00	0	200	\N	\N	50	https://devonvaleestate.co.za/	\N	devonvale_golf_wine_estate	$2b$08$zI/bGzY9/Yo1Kp8qzZ9Uoe4KmGLMx5hXJm4dJ7D/zwqMmWl5dl53m	\N	+27218652080	\N	\N
95	Dewetsdorp Golf Club	Dewetsdorp	Free State	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.5760320	26.6643120	1	1	250.00	0	200	\N	\N	50	\N	\N	dewetsdorp_golf_club	$2b$08$SqNkKYBUruN46OyAw0/9y.zva2KeKfVxFWhaAxXWBBz0F5Af6nOjC	\N	+27823775822	\N	\N
96	Diepgezet Golf Course	Ekulindeni	Mpumalanga	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.0031800	31.0723400	0	0	\N	0	200	\N	\N	50	\N	\N	diepgezet_golf_course	$2b$08$wo29yceCwpdjDQp3ULUBaeWDEtUTYq5en6Czew4ykl.sx.cyTeadq	\N	\N	\N	\N
97	Dimension Data Mashie Golf Course	Bryanston	Gauteng	/api/logos/97.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.0421780	28.0213820	1	0	200.00	0	200	\N	\N	50	\N	\N	dimension_data_mashie_golf_cou	$2b$08$C8smNd/9JiMmFeJXMysfbeRpiVbws6ci4swUhYUUN9UAk8CIgirte	\N	\N	\N	\N
98	Dolphin Creek Golf Estate	Mossel Bay	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.0493990	22.2386880	1	1	250.00	0	200	\N	\N	50	\N	\N	dolphin_creek_golf_estate	$2b$08$c7KPingSORZlmBaBFcCFUeUJJ45Uq3I3fWYbHh.OeBj61v.lXCBku	\N	\N	\N	\N
99	Dordrecht Country Club	Dordrecht	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-31.3680480	27.0377400	0	0	\N	0	200	\N	\N	50	\N	\N	dordrecht_country_club	$2b$08$kG7S3VNwz1ki2Tncbv/0KORhiExNpo09X5SeXSN0cQQB1Db4Yd9Le	\N	082 596 5822	\N	\N
100	Douglas Golf Club	Douglas	Northern Cape	/api/logos/100.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.0562710	23.7601410	1	0	200.00	0	200	\N	\N	50	\N	\N	douglas_golf_club	$2b$08$R7v7XhnmF1em0IeTcXXsP.WedHj8ssofedZ5WDgL3VWamzANOj4Ju	\N	053 298 1692	\N	\N
101	Drakensberg Gardens Golf Club	Underberg	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.7575010	29.2265760	1	1	250.00	0	200	\N	\N	50	\N	\N	drakensberg_gardens_golf_club	$2b$08$zEFB7YFN2A/XAc32wSU9fOYNL.CC/FJyu4VBqwO1rHBHmDLlwY2sq	\N	079 367 1555	\N	\N
102	Drakensig Golf Course	Hoedspruit	Limpopo	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-24.3465170	30.9322400	0	0	\N	0	200	\N	\N	50	\N	\N	drakensig_golf_course	$2b$08$xkc5QCiiLX9EtJkeu9Y7Y.BVw.ayLu1A383ICPmWmAKB/dycqX6pG	\N	063 847 7691	\N	\N
103	Dundee Country Club	Dundee	KwaZulu-Natal	/api/logos/103.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.1700610	30.2219510	1	0	200.00	0	200	\N	\N	50	https://dundeecountryclub.co.za/	\N	dundee_country_club	$2b$08$4haUl0MsMS/u47SaZUcsMeVO8qCW13Leng.RdpHaXrISXV35U3zfC	\N	\N	\N	\N
104	Durban Country Club	Durban	KwaZulu-Natal	/api/logos/104.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.8278670	31.0341130	1	1	250.00	0	200	\N	\N	50	https://durbancountryclub.co.za/	\N	durban_country_club	$2b$08$uoEHrw.QC/mhVRvnaFKRPuyjQpw.QVhyqJFxcBvQWelh5UHObazvq	Set beside the warm Indian Ocean, the Durban Country Club offers a unique coastal golf experience. The prevailing sea breeze and undulating fairways create one of South Africa's most memorable and challenging rounds.	+27 31 313 1777	\N	\N
105	Durban Deep Golf Club	Roodepoort	Gauteng	/api/logos/105.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.1735960	27.8675940	0	0	\N	0	200	\N	\N	50	\N	\N	durban_deep_golf_club	$2b$08$sbMjT1H1ac.lvqlmGkJon.K488DRQA1Ejfa53zfZLc8WawP7Xcagy	\N	+27110220824	\N	\N
106	Durbanville Golf Club	Cape Town	Western Cape	/api/logos/106.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.8338780	18.6591200	1	0	200.00	0	200	\N	\N	50	https://durbanvillegolfclub.co.za/	\N	durbanville_golf_club	$2b$08$7oFSw0Vv7Q89.s8kwSfZFuuXueoiFqfW/cgQLm/aG2heFFrLGq5aW	\N	021 976 8120	\N	\N
107	Eagle Canyon Country Club	Honeydew	Gauteng	/api/logos/107.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.0866360	27.9235920	1	1	250.00	0	200	\N	\N	50	https://www.eaglecanyongolfestate.co.za/	\N	eagle_canyon_country_club	$2b$08$.Qq9Et36hyRG7WCX3gXGY.ckX.YtanI2dczfaM5JM0.JXihybCTQm	\N	+27117952799	\N	\N
108	East London Golf Club	East London	Eastern Cape	/api/logos/108.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.9958610	27.9317610	0	0	\N	0	200	\N	\N	50	\N	\N	east_london_golf_club	$2b$08$YlwpKZYc6zqkOXITsTKdRO1So8xa/Okek8yAlZ.aBBcFs0XViOcVy	\N	\N	\N	\N
109	Ebotse Golf & Country Estate	Benoni	Gauteng	/api/logos/109.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.1557440	28.3513780	1	0	200.00	0	200	\N	\N	50	https://ebotselinks.com/contact	\N	ebotse_golf_country_estate	$2b$08$DuaoCeWdz9XAVpBjalk7Kert2V9.rF1KnEzCg0KhhcYYNCRI53ePy	\N	+27 87 285 3543	\N	\N
110	Edenburg Golf Club	Edenburg	Free State	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.7362140	25.9287000	1	1	250.00	0	200	\N	\N	50	\N	\N	edenburg_golf_club	$2b$08$PZyJpfnU/niCcw2k1/pARe7Rms1pf/RAUBytMi6OCG3xvEFeSJLFG	\N	0609882845	\N	\N
111	Elements Private Golf Reserve	Bela Bela	Limpopo	/api/logos/111.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-24.7993930	28.1308090	0	0	\N	0	200	\N	\N	50	https://elementspgr.co.za/	\N	elements_private_golf_reserve	$2b$08$LC3vOZ0TAYLTNiQDwfi1sO2cMBJcawv6iVLvs2jWfE/L0YTpMsA5e	\N	\N	\N	\N
112	Elliot Golf Club	Elliot	Eastern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-31.3262410	27.8384110	1	0	200.00	0	200	\N	\N	50	\N	\N	elliot_golf_club	$2b$08$zMLvzoXJsrn21MafR98zmulIwpaOlbPBIuNJk.F6tuN9KpQOJmIBa	\N	\N	\N	\N
113	Emfuleni Country Club	Vanderbijlpark	Gauteng	/api/logos/113.png	18	\N	["Pro Shop", "Club Hire"]	1	1	2026-05-20 18:27:14	-26.7440490	27.8414370	1	1	250.00	0	200	\N	\N	50	\N	\N	emfuleni_country_club	$2b$08$AgmHkEkIKkTKzDHZItHXROT9SFA.jQUXd7TzqUpvRJPp9jiV0EBe2	\N	\N	\N	\N
114	Empangeni Country Club	Empangeni	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.7464570	31.8958850	0	0	\N	0	200	\N	\N	50	\N	\N	empangeni_country_club	$2b$08$ZIDJjfB2IlHn/ipSGjk54uP6CuZe2.zTS5SUkaYtrV/pO./cbe3tW	\N	\N	\N	\N
115	Engineers Golf Club	Marievale	Gauteng	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.3453190	28.4913270	1	0	200.00	0	200	\N	\N	50	\N	\N	engineers_golf_club	$2b$08$bU.neDZMuGQQeoHYRJ8sOuFuhm0K/GdC2.VhAtztJX9/KfRnjHMaO	\N	0341613851	\N	\N
116	Erinvale Golf Club	Somerset West	Western Cape	/api/logos/116.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.0652480	18.8839490	1	1	250.00	0	200	\N	\N	50	https://www.erinvale.com/golf	\N	erinvale_golf_club	$2b$08$NKlBcc1VWE5u9YSJMTR2U./drV/a/fq5DuL3oKFWlcGZdvAeliIfG	\N	+27218471144	\N	\N
117	Ermelo Country Club	Ermelo	Mpumalanga	/api/logos/117.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.4697530	29.9611380	0	0	\N	0	200	\N	\N	50	\N	\N	ermelo_country_club	$2b$08$FFnl2N0vxtiVviARqsr4V.ZBAioELBpyeImsUQfbe2wq0X/jUwfZ2	\N	082 375 1335	\N	\N
118	ERPM Golf Course	Boksburg West	Gauteng	/api/logos/118.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.1977560	28.2279600	1	0	200.00	0	200	\N	\N	50	\N	\N	erpm_golf_course	$2b$08$HGLZqZA1qo9uSH5Yar.0aO5YgCf5EOV1tC8EEG1jb6pIUIWmLCuLC	\N	0699413922	\N	\N
119	Eshowe Country Club	Eshowe	KwaZulu-Natal	/api/logos/119.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.8943980	31.4752080	1	1	250.00	0	200	\N	\N	50	https://eshowehills.co.za/	\N	eshowe_country_club	$2b$08$NAa3p28waDDgwHOoZh1k0O1Ddn6Pdn7klDEteqTDODNqaFXN.JMTa	\N	0648057061	\N	\N
120	Estcourt Golf Club	Estcourt	KwaZulu-Natal	/api/logos/120.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.0166090	29.8802380	0	0	\N	0	200	\N	\N	50	\N	\N	estcourt_golf_club	$2b$08$.28S1u9DfncmkpEBhpk9outY7uPSSe2cd2T2Z/Kn62OE3u1q50sZO	\N	\N	\N	\N
121	Euphoria Golf Estate	Naboomspruit	Limpopo	/api/logos/121.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-24.5471810	28.6441000	1	0	200.00	0	200	\N	\N	50	https://euphoriaestate.co.za/contact/	\N	euphoria_golf_estate	$2b$08$Za3z8XFfqv9zrT8W6cx9JuhkwDXGZtNlu0uAHo8YuaLV.Y0vxIR8a	\N	+2782 076 6275	\N	\N
122	Excelsior Golf Club	Excelsior	Free State	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.9324520	27.0578890	1	1	250.00	0	200	\N	\N	50	\N	\N	excelsior_golf_club	$2b$08$PcCcAE9FTMvLL66moxrIle6i7zsuZyZn/x0k88GXrsslXLIfyLhK2	\N	\N	\N	\N
123	Eye of Africa Golf Estate	Eikenhof	Gauteng	/api/logos/123.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.3623000	28.0214600	0	0	\N	0	200	\N	\N	50	https://eyeofafrica.co.za/contact-us/	\N	eye_of_africa_golf_estate	$2b$08$6iyc3Q9zl1TlKxP8ywggL.qhIBjt.OHHXgqBzoYkVDyCznhQ99U8q	\N	079 555 1090	\N	\N
124	Fairview Golf Estate	Gordon's Bay	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.1388750	18.8652710	1	0	200.00	0	200	\N	\N	50	\N	\N	fairview_golf_estate	$2b$08$fAEJZlDGgr2cLca5fg5nxe.bLekuQvhRnQXBRj8.GbE6uTaXFTFgC	\N	021 856 4997	\N	\N
125	Fairview Par 3 Golf Course	Tzaneen	Limpopo	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-23.8213210	30.1715210	1	1	250.00	0	200	\N	\N	50	\N	\N	fairview_par_3_golf_course	$2b$08$qUQz9OzvPKC2/9QGoq84HOg0zZXy2z4k2NFkJrFxkAGn8CztCdU0K	\N	015 307 2679	\N	\N
126	Fancourt Hotel & Country Club ~ Links	George	Western Cape	/api/logos/126.svg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.9693310	22.4091190	0	0	\N	0	200	\N	\N	50	https://fancourt.co.za/contact/	\N	fancourt_hotel_country_club_li	$2b$08$NxQMrOXJgGSHBu5KpZ2zt.u6W.F3tSQsWMzZcImE0gcaMDIZg7HBu	\N	+27 44 804 0000	\N	\N
127	Fancourt Hotel & Country Club ~ Montagu	George	Western Cape	/api/logos/127.svg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.9526650	22.4061230	1	0	200.00	0	200	\N	\N	50	https://fancourt.co.za/contact/	\N	fancourt_hotel_country_club_mo	$2b$08$zlf/bCVhYhIx3JNpaGNn3uiK8/ekJsf4EErB96RjM8g6J0Imhc7ny	\N	+27 44 804 0000	\N	\N
128	Fancourt Hotel & Country Club ~ Outeniqua	George	Western Cape	/api/logos/128.svg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.9512520	22.4066590	1	1	250.00	0	200	\N	\N	50	https://fancourt.co.za/	\N	fancourt_hotel_country_club_ou	$2b$08$03IonZRIBHC/IQHB9aI43.UWtqU67oXePtjsmlvkbgXDTtZrbXXry	\N	+27 44 804 0000	\N	\N
129	Fancourt Hotel & Country Club ~ The Links Experience	George	Western Cape	/api/logos/129.svg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.9629610	22.4005960	0	0	\N	0	200	\N	\N	50	https://fancourt.co.za/contact/	\N	fancourt_hotel_country_club_th	$2b$08$pr7jqg9zVspsnFRYKfE25.s9fP0WPu3CyuePMuzIMMXZvPRTVLDU2	\N	+27 44 804 0000	\N	\N
131	Ficksburg Golf Course	Ficksburg	Free State	/api/logos/131.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.8594810	27.8888560	1	1	250.00	0	200	\N	\N	50	\N	\N	ficksburg_golf_course_131	$2b$08$cF9At1jRsOTFqnSzkv9/bu./37f4mIQzBTy1HtIU3xkV7MKqHKnce	\N	0922693460	\N	\N
133	Fish River Sun Country Club	Port Alfred	Eastern Cape	/api/logos/133.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.4836110	27.1332270	1	0	200.00	0	200	\N	\N	50	\N	\N	fish_river_sun_country_cl_133	$2b$08$PViXhEHXd/i1D/uFEs8uDe16a3R03Izjm8XmAWjh1q50XQ9lM1KuK	\N	+27406761101	\N	\N
134	Fort Beaufort Golf Course	Fort Beaufort	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.7628370	26.6240620	1	1	250.00	0	200	\N	\N	50	\N	\N	fort_beaufort_golf_course_134	$2b$08$uGXu3iECTelnb/FVaJGVIOulgQImNRS9H6OOAwORD0qEOcOOYNxja	\N	\N	\N	\N
135	Frankfort Golf Course	Frankfort	Free State	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-27.2880860	28.4957670	0	0	\N	0	200	\N	\N	50	\N	\N	frankfort_golf_course_135	$2b$08$9VI0Z51lbanFtvfuU1OhxeRlmTdBQWq2yOXIZv4Ru/v/MUOhaMpAC	\N	\N	\N	\N
137	Gansbaai Golf Club	Gansbaai	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.6184130	19.3490270	1	1	250.00	0	200	\N	\N	50	https://gansbaaigolfclub.com/home/	\N	gansbaai_golf_club_137	$2b$08$z.x3UVfIhmXhL/k6WndfzuRDVlzUFNGIyVcW8zFWVww65hlX5VZ/O	\N	028 384 1441	\N	\N
138	Gary Player Country Club	Sun City	North West	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.3457590	27.0985940	0	0	\N	0	200	\N	\N	50	\N	\N	gary_player_country_club_138	$2b$08$FnxOyEQFy7B0AMQ/0Bg.YuhactSJqPb9Ks/EoTXGaRcewEvxPogMu	\N	+27 14 557 3700	\N	\N
143	Glengarry Kamberg	Kamberg	KwaZulu-Natal	/api/logos/143.png	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.3241480	29.7138520	1	1	250.00	0	200	\N	\N	50	\N	\N	glengarry_kamberg_143	$2b$08$CgR/Q2QmnpWR9JA0.xIa3uhMX4YZuCpheQsQsGIm9Nbcb.hT7DXsC	\N	082 867 7620	\N	\N
144	Glenvista Country Club	Glenvista	Gauteng	/api/logos/144.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.2814080	28.0560840	0	0	\N	0	200	\N	\N	50	https://glenvistacountryclub.co.za/contact-us/	\N	glenvista_country_club_144	$2b$08$d8MDiidaWxnSnph9dE9I2.pBsuQx4o5kXLHqjNMrXZb9VoY6N1.GC	\N	011 432 3150	\N	\N
145	Glenwood Golf Club	George	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.9730290	22.4916440	1	0	200.00	0	200	\N	\N	50	https://glenwoodiegolf.com/contact/	\N	glenwood_golf_club_145	$2b$08$YJ.raRPPYlVWXynHN249BuI5ToTLikVNmBE6ILMmQdMxSfDghARKG	\N	\N	\N	\N
146	Goldfields West Golf Club	Carletonville	Gauteng	/api/logos/146.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.3911890	27.4739490	1	1	250.00	0	200	\N	\N	50	\N	\N	goldfields_west_golf_club_146	$2b$08$REGK7NCq2JOLPvyFDJr.7uM9AMkGUabBTg/zZOaLH3CGX3HkvBuF2	\N	\N	\N	\N
147	Golf at Midfields Estates	Midfields Estate	Gauteng	/api/logos/147.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.9211080	28.1959610	0	0	\N	0	200	\N	\N	50	\N	\N	golf_at_midfields_estates_147	$2b$08$CJ4S5hQDhVHCnJQtEhk.k.GBctjuORcB2z/S2zMga1TZVZ9q6RATG	\N	\N	\N	\N
148	Gonubie Golf Club	East London	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.9509380	28.0061670	1	0	200.00	0	200	\N	\N	50	\N	\N	gonubie_golf_club_148	$2b$08$32nABt5cMfyVlunJnt/1uePo/u/HBEpxjZp6X9J4TOnjLnN9DcWPa	\N	0319028038	\N	\N
149	Goose Valley Golf Club	Plettenberg Bay	Western Cape	/api/logos/149.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.0263750	23.3818770	1	1	250.00	0	200	\N	\N	50	https://www.goosevalleygolfclub.com/	\N	goose_valley_golf_club_149	$2b$08$2HAK6rZq12vNSOSAr4UtOec6Y52duaHVseYlRltckwqs3gZRQ30wu	\N	+27 11 512 0204	\N	\N
151	Graaff Reinet Golf Club	Graaff-Reinet	Eastern Cape	/api/logos/151.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.2951460	24.5451400	1	0	200.00	0	200	\N	\N	50	https://graaffreinet.co.za/the-graaff-reinet-golf-club/	\N	graaff_reinet_golf_club_151	$2b$08$ROna6LV2fD1vDUfa35igaOmdrauaL42Yplxx8yaOQEvfcIq8Zbc9q	\N	049 893 0286	\N	\N
152	Grabouw Mashie Golf Club	Grabouw	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.1515800	19.0186130	1	1	250.00	0	200	\N	\N	50	\N	\N	grabouw_mashie_golf_club_152	$2b$08$cJcYU4tewYc3Nn6P7cFAkOWO7Qmu4OAonJIDFv7RLigZNyu8BonYq	\N	+27836792615	\N	\N
153	Graceland Country Club	Secunda	Mpumalanga	/api/logos/153.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.5129710	29.1620490	0	0	\N	0	200	\N	\N	50	https://graceland.co.za/contact-us/	\N	graceland_country_club_153	$2b$08$JtdoqEnTffBk77H3ru3u0exAyH30VkdO02Ao84jipugUG/TcZjYoi	\N	\N	\N	\N
155	Greenside Colliery Golf Club	Witbank	Mpumalanga	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.9616370	29.1749670	1	1	250.00	0	200	\N	\N	50	\N	\N	greenside_colliery_golf_c_155	$2b$08$s373fTH/nmK/zKo8wM5xwu45fY/STwajU.6Ol1xGJ/R2ouC5OKfyu	\N	\N	\N	\N
156	Greenways Golf Estate	Strand	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.1299570	18.8419070	0	0	\N	0	200	\N	\N	50	\N	\N	greenways_golf_estate_156	$2b$08$mtEnym95vDol0GomOwaiNO.ky1m6Wzm5SopgvpnkpBX5kYBAFR8OG	\N	069 971 6173	\N	\N
158	Groblersdal Golf Club	Groblersdal	Mpumalanga	/api/logos/158.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.1777670	29.4046930	1	1	250.00	0	200	\N	\N	50	\N	\N	groblersdal_golf_club_158	$2b$08$HGasnqXBidUlNQs73.TINOMzGLRFGhbm68R4TPOKQqHnakjZdvMjC	\N	\N	\N	\N
159	Hankey Golf Club	Hankey	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.8269030	24.8828840	0	0	\N	0	200	\N	\N	50	\N	\N	hankey_golf_club_159	$2b$08$9.pTkwfsBLbU6ox4EZ.3BO2MJ1VCv96TY7CgDF2XHZcRUOQdgUQf.	\N	\N	\N	\N
161	Harding Municipal Golf Club	Harding	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-30.5809800	29.8869830	1	1	250.00	0	200	\N	\N	50	\N	\N	harding_municipal_golf_cl_161	$2b$08$snWyIEghfvTeRC7OyncFQOdjXHvuZb/37tJKRUwT8l.go1Lbcyq3S	\N	\N	\N	\N
162	Harrismith Country Club	Harrismith	Free State	/api/logos/162.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.2659550	29.1351630	0	0	\N	0	200	\N	\N	50	\N	\N	harrismith_country_club_162	$2b$08$/9kEbR9zWqwI5IT5HrK10uCrUZIJ6yNGisHa4Wl7yuUHcTmSumy2K	\N	058 623 0468	\N	\N
164	Hazendal Golf	Stellenbosch	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.8975680	18.7191640	1	1	250.00	0	200	\N	\N	50	\N	\N	hazendal_golf_164	$2b$08$OXTCO00TD93Xhrsj3xFc8O7YADd9EwSR67C.HPONW5TR3sL7taomK	\N	021 903 5034	\N	\N
165	Heidelberg Golf Club	Heidelberg	Western Cape	/api/logos/165.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.0872770	20.9655670	0	0	\N	0	200	\N	\N	50	https://heidelberggolfclub.co.za/	\N	heidelberg_golf_club_165	$2b$08$heLaFrYgiODKvzldPjjW5e55KqAhu79Kx5azo3eVsumhYMP46ItEa	\N	\N	\N	\N
167	Heilbron Golf Course	Heilbron	Free State	/api/logos/167.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-27.2930910	27.9600720	1	1	250.00	0	200	\N	\N	50	\N	\N	heilbron_golf_course_167	$2b$08$G.CVzhwfIxVe7C7w7JD3R.j1TpMxD4bkKswiwtJd9Yrf3hW5FYGMW	\N	0909447960	\N	\N
168	Helderberg Village Golf Club	Somerset West	Western Cape	/api/logos/168.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.0453750	18.8190660	0	0	\N	0	200	\N	\N	50	https://www.helderbergvillage.org.za/	\N	helderberg_village_golf_c_168	$2b$08$BJVApddJrxFsNNV4kdrCyOHUXkNalNgD4qTK61rJuNTDa/eFo.Lm6	\N	021 855 8334	\N	\N
170	Hermanus Golf Club ~ North	Hermanus	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.4105400	19.2564260	1	1	250.00	0	200	\N	\N	50	\N	\N	hermanus_golf_club_north_170	$2b$08$xpYCgJuzDehOlvpKcFumh.XwhoqFP0F3lpxKKyj3SrR72llBqyrFu	\N	\N	\N	\N
171	Hermanus Golf Club ~ South	Hermanus	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.4105400	19.2564260	0	0	\N	0	200	\N	\N	50	\N	\N	hermanus_golf_club_south_171	$2b$08$BX075gcyExDXeOiDe0vamOKxjtUob3xL/SYjXb84IIaCWygOT26.e	\N	\N	\N	\N
173	Hex Vallei Golf Club	De Doorns	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.4838720	19.6584700	1	1	250.00	0	200	\N	\N	50	\N	\N	hex_vallei_golf_club_173	$2b$08$/pTyTvEDnEwgRrWfbV3tf.jOPVossbVnMS6UWRaEL8rndO/ZO/Su6	\N	\N	\N	\N
174	Highland Gate Golf & Trout Estate	Dullstroom	Mpumalanga	/api/logos/174.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.4440000	30.2042820	0	0	\N	0	200	\N	\N	50	https://highlandgate.co.za/	\N	highland_gate_golf_trout__174	$2b$08$fR7a9PSx3jagYdo0sT8OFur72uJ/0SBOtNWg/w2D64gG.Kixgy.Y.	\N	087 287 4652	\N	\N
176	Holly Country Club	Heilbron	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.9345540	27.9141130	1	1	250.00	0	200	\N	\N	50	\N	\N	holly_country_club_176	$2b$08$GiGiFivu28THFPmG1b74yOX8DntcFCqPIiowOW.rl3e6HU9.2rAIi	\N	0909447960	\N	\N
177	Hoopstad Golf Club	Hoopstad	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-27.8214290	25.9051820	0	0	\N	0	200	\N	\N	50	\N	\N	hoopstad_golf_club_177	$2b$08$xMfY4afvLqWG4Lxv5OSsge0VyJGs0de75vli8E6ZqYJh7ooLtzAQq	\N	\N	\N	\N
178	Hopetown Golf Club	Hopetown	Northern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.6270310	24.1219800	1	0	200.00	0	200	\N	\N	50	\N	\N	hopetown_golf_club_178	$2b$08$yIQeCfxiuoX/Bu5LlMJwt.PVS5XsrSKuluPBJ8.p.tcDN.DuzcYLW	\N	\N	\N	\N
181	Howick Golf Club	Howick	KwaZulu-Natal	/api/logos/181.ico	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.4980760	30.2327230	1	0	200.00	0	200	\N	\N	50	https://www.howickgolfclub.co.za	\N	howick_golf_club_181	$2b$08$f/wO.xTB24PvO/cmIY8mZeaZVkMqaY0zMG5dpj9B7j7TV3SSl/b/2	\N	033 330 3422	\N	\N
183	Huddle Park Golf Club ~ Mashie Course	Linksfield	Gauteng	/api/logos/183.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.1558690	28.1195740	0	0	\N	0	200	\N	\N	50	\N	\N	huddle_park_golf_club_mas_183	$2b$08$4v06Irg9mAcOfGufVATGGOZDvfEvjI/7BJ/MhQ7Anktf2iMI8KKni	\N	061 536 0895	\N	\N
184	Humewood Golf Club	Port Elizabeth	Eastern Cape	/api/logos/184.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.9984900	25.6828330	1	0	200.00	0	200	\N	\N	50	\N	\N	humewood_golf_club_184	$2b$08$AFV1YTUQswtEoVQ2acYnbeTM6bT56YWLwnnzsrlxz32hENc9/uVPq	\N	+27 41 583-3011	\N	\N
185	Hunters Rest Golf Course	Rustenburg	North West	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.7789470	27.2611780	1	1	250.00	0	200	\N	\N	50	\N	\N	hunters_rest_golf_course_185	$2b$08$UKCTUg3kiMgAuj4rbTiKieyv4Zj9eSKsBmUAI8G30m830H/wFUfmy	\N	\N	\N	\N
186	Inanda Greens Golf Course	Sandton	Gauteng	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.1148030	28.0552240	0	0	\N	0	200	\N	\N	50	\N	\N	inanda_greens_golf_course_186	$2b$08$tugpiDveZ2Pyw2OsufQOruTy7HKOpwpWWscCyBwN62DvoIs0HGzYi	\N	011 884 1414	\N	\N
188	Irene Country Club	Irene	Gauteng	/api/logos/188.jpg	18	\N	["Pro Shop", "Club Hire"]	1	1	2026-05-20 18:27:14	-25.8840780	28.2228050	1	1	250.00	0	200	\N	\N	50	\N	\N	irene_country_club_188	$2b$08$Pc5nL33F0t/jc66ctOhz3ufzw3NJTQ4kmhWM9C8hGwNXOPvMjXMxe	\N	+27 12 667 1081	\N	\N
189	Ixopo Golf Club	Ixopo	KwaZulu-Natal	/api/logos/189.jpeg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-30.1497240	30.0600740	0	0	\N	0	200	\N	\N	50	\N	\N	ixopo_golf_club_189	$2b$08$DdoLumoKOZOmdm1sRCIy3OYPyf08oHfY07gHj.VDhRuml1rUGFuea	\N	\N	\N	\N
191	Jacobsdal Golf Club	Jacobsdal	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.1317730	24.7783540	1	1	250.00	0	200	\N	\N	50	\N	\N	jacobsdal_golf_club_191	$2b$08$vQLD8fXuKzYdXhv.DTkIPOEkmW21f40iv3VsnGI5nAtymmHl6zCSi	\N	\N	\N	\N
192	Jagersfontein Golf Club	Jagersfontein	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.7526080	25.4315310	0	0	\N	0	200	\N	\N	50	\N	\N	jagersfontein_golf_club_192	$2b$08$5u2d6asKZJW58v9mTqHDH.tURsbawbp51dtaRtMmtDG.qJwizIWdO	\N	\N	\N	\N
194	Jan Kriel Mashie Course	Kuils River	Western Cape	/api/logos/194.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.9194260	18.6834960	1	1	250.00	0	200	\N	\N	50	https://jankriel.co.za/contact-us/	\N	jan_kriel_mashie_course_194	$2b$08$gZuZSXY3LQQA1yWsgkQNfuyKRzEp2KH694Gjnu046LCNTGzC/8.ee	\N	021 903 1108	\N	\N
195	Jeffreys Bay Golf Club	Jeffreys Bay	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.0394370	24.9145930	0	0	\N	0	200	\N	\N	50	\N	\N	jeffreys_bay_golf_club_195	$2b$08$2uldT/OBKVcqhi9XkqHoRuyBEREvNKZMogapVncUJeS/rOSocSTyW	\N	\N	\N	\N
197	Jim and Jerry's Driving Range and Mashie Course	Roodepoort	Gauteng	/api/logos/197.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.0740760	27.8574870	1	1	250.00	0	200	\N	\N	50	\N	\N	jim_and_jerry_s_driving_r_197	$2b$08$Fn1E7tFTIGg/u3T.01uqCO9YAgmCFrayWXCA60gMDExEwMdC59Ci.	\N	+27116621603	\N	\N
198	Johannesburg Country Club ~ Mashie	Auckland Park	Gauteng	/api/logos/198.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.0501640	28.0806910	0	0	\N	0	200	\N	\N	50	\N	\N	johannesburg_country_club_198	$2b$08$cP0ALxogPjWKSYobMue4Tuqa.6uEGKrZL7selqRAECAbRB.nTQDBe	\N	+27 11 202 1600	\N	\N
200	Johannesburg Country Club ~ Woodmead	Auckland Park	Gauteng	/api/logos/200.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.0501640	28.0806910	1	1	250.00	0	200	\N	\N	50	\N	\N	johannesburg_country_club_200	$2b$08$VCUC14VUlbwO/P14XZVQLOHyPPmRQeuPsNjfQKJ.vz5Cly4nBwCYW	\N	011 202 1600	\N	\N
201	Kakamas Golf Club	Kakamas	Northern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.7955950	20.6517860	0	0	\N	0	200	\N	\N	50	\N	\N	kakamas_golf_club_201	$2b$08$A6YK5u1CeMLMUTCaN2I25.X3lC9eAfRmqS/o70RHfOeAnOU8jkrNG	\N	\N	\N	\N
202	Kambaku Golf Club	Komatipoort	Mpumalanga	/api/logos/202.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.4375220	31.9723280	1	0	200.00	0	200	\N	\N	50	\N	\N	kambaku_golf_club_202	$2b$08$TOyAarcAlz3LeHKRApoUuejINDifMXbNA7NWkobKav.6Y6RHKmzkS	\N	\N	\N	\N
204	Katberg Eco Estate	Katberg	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.4974660	26.6817140	0	0	\N	0	200	\N	\N	50	\N	\N	katberg_eco_estate_204	$2b$08$9dNz28.fE.BV3j51QICIGec9MdknWvlzgWyRqHPwCRbCiEnRyBEl6	\N	040 864 1010	\N	\N
205	Kei Mouth Country Club	Kei Mouth	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.6961530	28.3642070	1	0	200.00	0	200	\N	\N	50	\N	\N	kei_mouth_country_club_205	$2b$08$lL7PLRq5Hb1fYjD0AUyU9evw24zQ0cOht85sCsYHCRjz5AHCya606	\N	+27438411083	\N	\N
207	Kempton Park Golf Club	Spartan	Gauteng	/api/logos/207.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.1063270	28.2109590	0	0	\N	0	200	\N	\N	50	\N	\N	kempton_park_golf_club_207	$2b$08$temzgKn1WRLbRVGBREIaXuvb8DxXaPJSo7GCfk/86a4Z.j6xVKnGe	\N	071 687 1592	\N	\N
208	Kestell Golf Club	Kestell	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.3018970	28.7016750	1	0	200.00	0	200	\N	\N	50	\N	\N	kestell_golf_club_208	$2b$08$5.1dAtvvHBQ8/MGO1neexOL7jJT4FfXTPScy07aBW9WkQ/vSFIcEm	\N	0576020131	\N	\N
210	Killarney Country Club	Lower Houghton	Gauteng	/api/logos/210.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.1517670	28.0541650	0	0	\N	0	200	\N	\N	50	https://www.killarneycountryclub.co.za/general-information-enquiry/	\N	killarney_country_club_210	$2b$08$jJOlGzybS00AJPkfLvMoJOaZyZP3iorgbafUz5Is.NoPX5MT0CXmC	\N	011 442 3880	\N	\N
212	Kimiad Golf	Moreletapark	Gauteng	/api/logos/212.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.8177740	28.2965760	1	1	250.00	0	200	\N	\N	50	\N	\N	kimiad_golf_212	$2b$08$hWfJGwk.dsAGXzACxmYZu.//7mz1IycXNqBkLtfH5QOEm3.yunlJK	\N	012 997 2240	\N	\N
213	King David Mowbray Golf Club	Cape Town	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.9459510	18.4922220	0	0	\N	0	200	\N	\N	50	\N	\N	king_david_mowbray_golf_c_213	$2b$08$mhj0Ip5nIM/fUdfTdDgNRu0vLKacB9If7YYcYHlCVms5IOpAYVq9i	\N	+27 21 685 3018	\N	\N
214	King William's Town Golf Course	King Williams Town	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.8921440	27.4092150	1	0	200.00	0	200	\N	\N	50	\N	\N	king_william_s_town_golf__214	$2b$08$CLcS7qArsPMsdkSPKP.DB.dxvQMl6hssfHBq5TcR8VfXdtw.6ouNa	\N	\N	\N	\N
216	Kinross Golf Club	Kinross	Mpumalanga	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.4156900	29.1082890	0	0	\N	0	200	\N	\N	50	\N	\N	kinross_golf_club_216	$2b$08$/w.jrwFLIKn/i9u4yJZXFeIPxTIA9xi5PF3M24XiF9RQfRleB49su	\N	\N	\N	\N
217	Kirkwood Golf Club	Kirkwood	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.3928200	25.4502320	1	0	200.00	0	200	\N	\N	50	\N	\N	kirkwood_golf_club_217	$2b$08$JOo.bXESwEC73eEuVaSvJ.hvcsk4ofVcyWU/JzRJXcGMYdt2cbr5S	\N	\N	\N	\N
218	Kleinmond Golf Club	Kleinmond	Western Cape	/api/logos/218.ico	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.3308160	19.0339640	1	1	250.00	0	200	\N	\N	50	https://www.kleinmondgolfclub.co.za/	\N	kleinmond_golf_club_218	$2b$08$8k/057udNPTKrENFgnhXt.rBtoKwFGcbvtEBoQGfRxnbYASWg6J2C	\N	\N	\N	\N
220	Klerksdorp Golf Club	Klerksdorp	North West	/api/logos/220.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.8782230	26.6583900	1	0	200.00	0	200	\N	\N	50	\N	\N	klerksdorp_golf_club_220	$2b$08$fXh8zfK73AGQSkm1laClt.FtB2O8ZxFCTdGEOUmgAN3L3ZBELJ6Zi	\N	\N	\N	\N
222	Knysna Golf Club	Knysna	Western Cape	/api/logos/222.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.0584260	23.0789830	0	0	\N	0	200	\N	\N	50	https://knysnagolfclub.com/	\N	knysna_golf_club_222	$2b$08$7KdTjbgNXkly6NWycGBBquPPvMyrGICvBjPZjaUpMQPXA76lfDpLS	\N	\N	\N	\N
223	Koffiefontein Golf Course	Koffiefontein	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.4109580	25.0010850	1	0	200.00	0	200	\N	\N	50	\N	\N	koffiefontein_golf_course_223	$2b$08$PEZZiKBsoMqwF5lP517rsuFj3GsZ.P1BaU2pEErYjUIwxqN.IIthi	\N	+27532050681	\N	\N
225	Komga Golf Course	Komga	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.5766950	27.8862820	0	0	\N	0	200	\N	\N	50	\N	\N	komga_golf_course_225	$2b$08$Twf9DvtllLwAhveJCccDdOeKAi7WX3ss.pWR92HBqdH9eaarK26FW	\N	+27438311069	\N	\N
226	Koro Creek Golf Estate	Modimolle	Limpopo	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-24.6975020	28.3857320	1	0	200.00	0	200	\N	\N	50	https://www.koro-creek.co.za/contact.html	\N	koro_creek_golf_estate_226	$2b$08$J3z9GRgVPR.ONGpZx09kqO9Xsc9V/GfKTOveMDisZW/cD8ZXM0xVq	\N	\N	\N	\N
228	Kragga Kamma Golf Course	Port Elizabeth	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.9768590	25.4536870	0	0	\N	0	200	\N	\N	50	\N	\N	kragga_kamma_golf_course_228	$2b$08$4pQPdo0c7AE7Edh2XQodj.7DmBP3johPmTqfgSx1eTY2VGfNQiUAW	\N	063 474 1766	\N	\N
229	Kranspoort Golf Club	Loskop Valley	Mpumalanga	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.4380920	29.4208070	1	0	200.00	0	200	\N	\N	50	\N	\N	kranspoort_golf_club_229	$2b$08$AHJij/Wyvnu/Jybk2dnYreykjkwUvqt.sGM5gA4TIBaLjWJDu.u6W	\N	\N	\N	\N
230	Kriel Golf Club	Kriel	Mpumalanga	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.2551570	29.1996000	1	1	250.00	0	200	\N	\N	50	\N	\N	kriel_golf_club_230	$2b$08$dbvrMFSBGdlc5gEwjRAGneYhsMJVSroVMlYDUTCdAORRyZ3ziyOfi	\N	\N	\N	\N
232	Kroonstad Country Club	Kroonstad	Free State	/api/logos/232.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-27.6652690	27.2442910	1	0	200.00	0	200	\N	\N	50	\N	\N	kroonstad_country_club_232	$2b$08$FArPg6ye4xrm9NbV7g.kkujoMSQ2Qb47TUloU9PVVoQAHb023u3Wi	\N	056 212 5169	\N	\N
234	Krugersdorp Golf Club	Krugersdorp	Gauteng	/api/logos/234.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.0813500	27.7843590	0	0	\N	0	200	\N	\N	50	\N	\N	krugersdorp_golf_club_234	$2b$08$DKKaEyR5S5M0YriOUoDvPOlwMW9zGLK/sgw2Gjw0wdQYxWBxdFiKG	\N	\N	\N	\N
236	Kuruman Country Club	Kuruman	Northern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-27.4713560	23.4579990	1	1	250.00	0	200	\N	\N	50	\N	\N	kuruman_country_club_236	$2b$08$t5oRCy5hBwRZK/w2EiJ/DuZdHo3zVjM834v7SdF0HTLmFhjJfu21u	\N	053 712 1242	\N	\N
237	Kwambonambi Golf Club	Kwambonambi	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.6003730	32.0791340	0	0	\N	0	200	\N	\N	50	\N	\N	kwambonambi_golf_club_237	$2b$08$4ouydLG4PHTrmlZgpbx5yeTqxIEHM.iIU0m5jNrOe.dlSfQ5m.X7u	\N	\N	\N	\N
238	Kyalami Country Club	Kyalami	Gauteng	/api/logos/238.jpg	18	\N	["Pro Shop", "Club Hire"]	1	1	2026-05-20 18:27:14	-25.9779460	28.0582860	1	0	200.00	0	200	\N	\N	50	\N	\N	kyalami_country_club_238	$2b$08$PT/7jJ4y1oY4tUHlCM/ZfuuNNd3ivEqrlb3YjIXcv7y4LTioctkv.	\N	+27 10 594 0034	\N	\N
239	Ladismith Golf Club	Ladismith	Western Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.4925110	21.2636040	1	1	250.00	0	200	\N	\N	50	\N	\N	ladismith_golf_club_239	$2b$08$/ir0n/ydPHcAF2vNV17Dwufq/cTiKHxWobslaXcUHVsCIvRAXOjK.	\N	\N	\N	\N
241	Ladybrand Sports Club	Ladybrand	Free State	/api/logos/241.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.2044930	27.4561430	1	0	200.00	0	200	\N	\N	50	\N	\N	ladybrand_sports_club_241	$2b$08$GYboHvuvGx3irD4j4ElpOeC0PPdE4d5bg8kP5b3AYWe1H.dbQyUtO	\N	051 924 3146	\N	\N
242	Ladysmith Country Club	Ladysmith	KwaZulu-Natal	/api/logos/242.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.5471150	29.7709970	1	1	250.00	0	200	\N	\N	50	\N	\N	ladysmith_country_club_242	$2b$08$/lMZImXoVsyFKVkHdVbeUODVWgZj19qmNgzvWg8MQsiugKkxbxkDe	\N	\N	\N	\N
244	Landau Colliery Golf Club	Witbank	Mpumalanga	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.9482050	29.2098140	1	0	200.00	0	200	\N	\N	50	\N	\N	landau_colliery_golf_club_244	$2b$08$6b1WbdIJfeB2YZQYxh/Zu.2ZWV1s8..jj1S2RY4LkXMBQxV9d0ZUe	\N	\N	\N	\N
245	Landbou Golf Club	Potchefstroom	North West	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.7313870	27.0705610	1	1	250.00	0	200	\N	\N	50	\N	\N	landbou_golf_club_245	$2b$08$feaEXpg8CzDdD8yUu.xbbOmCgMKyu2tOhZs7v4JVf7xO9PxTgaFzG	\N	\N	\N	\N
247	Langebaan Country Estate Golf ~ Mashie Course	Langebaan	Western Cape	/api/logos/247.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.0744400	18.0542260	1	0	200.00	0	200	\N	\N	50	https://langebaanestate.co.za/golf/	\N	langebaan_country_estate__247	$2b$08$8aOJQxtu0iiw2S7TNBuTYOcoXehfUOt2UpO6hYLbTfWKViXn/6ob2	\N	021 430 6011	\N	\N
248	Langkloof Golf Club	Joubertina	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.8382940	23.8375390	1	1	250.00	0	200	\N	\N	50	\N	\N	langkloof_golf_club_248	$2b$08$rpv5BtUQd/riqDknB54yi.fM7vnuHGZjNGUoBZjRRoFzucj2dZDHC	\N	\N	\N	\N
250	Leeuwkop Golf Club	Sandton	Gauteng	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.0087450	28.0647720	1	0	200.00	0	200	\N	\N	50	\N	\N	leeuwkop_golf_club_250	$2b$08$C5HnfHVAq9bphHFsjdKXBO.CKuVaCGVD9vHeli7en.ZvZIqSO9x9K	\N	\N	\N	\N
251	Legend Golf & Safari Resort	Mokopane	Limpopo	/api/logos/251.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-24.1952270	28.7208530	1	1	250.00	0	200	\N	\N	50	\N	\N	legend_golf_safari_resort_251	$2b$08$jd6yfGfIYv3VMqbVRy7GB.BmTCWtvK61WPiVe9wPTm3UM1O9RkjC2	\N	\N	\N	\N
253	Leopard Creek Country Club ~ Par 3	Malelane	Mpumalanga	/api/logos/253.png	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.4417480	31.5344590	1	0	200.00	0	200	\N	\N	50	https://leopardcreek.co.za/	\N	leopard_creek_country_clu_253	$2b$08$nKfjHIVLNSdu0zQhbaZj4eQku0Fp5WmsLg3GoSoIYMDLc0kpuwiMu	\N	+27 13 791 2000	\N	\N
254	Leopard Park Golf Club	Mmabatho	North West	/api/logos/254.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.8124420	25.6372620	1	1	250.00	0	200	\N	\N	50	\N	\N	leopard_park_golf_club_254	$2b$08$oI5msOYuygGgWSyI3JtEkOiEzsCs4Of/seyevD658cWhAzp0hqZJC	\N	\N	\N	\N
255	Lichtenburg Golf Club	Lichtenburg	North West	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.1845350	26.1773920	0	0	\N	0	200	\N	\N	50	\N	\N	lichtenburg_golf_club_255	$2b$08$IvJ9mCl/dBjnhd7fVDq/ueJ/mx3BRpTXvoceOtvSLMbxX1AqTrsqW	\N	0849432920	\N	\N
257	Lions Rock Golf Course	Hazyview	Mpumalanga	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.0358250	31.0637570	1	1	250.00	0	200	\N	\N	50	\N	\N	lions_rock_golf_course_257	$2b$08$Uidxc/s/yWwVnFtAURtrQ.Nkk8kfGO4RoIK9v1E6NaJbCapeTBdMW	\N	\N	\N	\N
258	Loeriesfontein Golf Club	Loeriesfontein	Northern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-30.9738820	19.4500820	0	0	\N	0	200	\N	\N	50	\N	\N	loeriesfontein_golf_club_258	$2b$08$evLX0.LLmkZWTrNCZ7j03O7gcWeSG8kCpamdTKISp20CM14RPtVxW	\N	\N	\N	\N
261	Lydenburg Golf Club	Lydenburg	Mpumalanga	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.0924520	30.4617830	0	0	\N	0	200	\N	\N	50	\N	\N	lydenburg_golf_club_261	$2b$08$EhvpDM7XlswhVVVC7rNkWOgFyBo3LYlMvcdO8Uu0qD5562UXntRTS	\N	086 647 1572	\N	\N
263	Maclear Golf Course	Maclear	Eastern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-31.0666660	28.3356340	1	1	250.00	0	200	\N	\N	50	\N	\N	maclear_golf_course_263	$2b$08$ZDlh2JxrWEWHOaNjOCgOxeIm/Vg3dun2UgNPcBjM2KeIX7n1P3k6G	\N	082 752 8242	\N	\N
264	Magalies Park Golf Club	Skeerpoort	North West	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.7509860	27.7811560	0	0	\N	0	200	\N	\N	50	\N	\N	magalies_park_golf_club_264	$2b$08$v6A7aEwzQNUV4AE7geFbNubUxlqRtK.git9UdVqzQU9Fjmte0PuN6	\N	\N	\N	\N
266	Maidstone Golf Club	Tongaat	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.5483730	31.1309410	1	1	250.00	0	200	\N	\N	50	\N	\N	maidstone_golf_club_266	$2b$08$keWqfDg1y7hfUSbXM9xvbO8M3vMrN7HxZ1geJovzAOvFM.Mtgn0c2	\N	\N	\N	\N
267	Malelane Golf Club	Malelane	Mpumalanga	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.4657940	31.5419200	0	0	\N	0	200	\N	\N	50	\N	\N	malelane_golf_club_267	$2b$08$ujXnvXh.2ZqVHfTlKRK6H.uQdocVaobAoTyCYopIZ8d0NtsaMDHWa	\N	+27137900283	\N	\N
268	Malmesbury Golf Club	Malmesbury	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.4460720	18.7188120	1	0	200.00	0	200	\N	\N	50	\N	\N	malmesbury_golf_club_268	$2b$08$AEqC4dlomhbs0wjLO5RUm.HJs36LWNPvz6nihMDhjdey4E7rmONjq	\N	\N	\N	\N
270	Marble Hall Golf Club	Marble Hall	Limpopo	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.0002770	29.2743850	0	0	\N	0	200	\N	\N	50	\N	\N	marble_hall_golf_club_270	$2b$08$KsV8zrlSO2lh09DCmc5gpeSEws8nrjyBJzkqrPFXp9nXfvKcR2duu	\N	013 591 3987	\N	\N
272	Maritzburg Golf Club	Pietermaritzburg	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.6130480	30.4140060	1	1	250.00	0	200	\N	\N	50	https://www.maritzburggolf.co.za/	\N	maritzburg_golf_club_272	$2b$08$Uw8FYuonFFqVlrsvkbDD2OIGNu4WzrvVrs6OGjMTtrx0trMd34xa6	\N	+27 33 396 2356	\N	\N
273	Marquard Golf Club	Marquard	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-28.6586310	27.4341920	0	0	\N	0	200	\N	\N	50	\N	\N	marquard_golf_club_273	$2b$08$dO4OjNTMc40wjpwzl6UaBeUWQF6JvSV1jQJRPhI0.seFKZ9xUpzH2	\N	\N	\N	\N
274	Matatiele Golf Club	Matatiele	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-30.3399900	28.7983630	1	0	200.00	0	200	\N	\N	50	\N	\N	matatiele_golf_club_274	$2b$08$uqNpvpki6wNNxMNEkvz96.W3LUYk1Rpe3V2dBxIQXMOyOyjVWdWC.	\N	0638130328	\N	\N
276	Messina Golf Club	Musina	Limpopo	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-22.3422000	30.0454620	0	0	\N	0	200	\N	\N	50	\N	\N	messina_golf_club_276	$2b$08$Y05YNNMIjK4sVycpiQg4.utgSm97Db28R4l/3X.ueBkLtzXMzw4Ci	\N	\N	\N	\N
278	Meyerton Golf Club	Meyerton	Gauteng	/api/logos/278.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.5556070	28.0257150	1	1	250.00	0	200	\N	\N	50	\N	\N	meyerton_golf_club_278	$2b$08$NJz3V1BO0arQlWxDp9hIteA617sE/P/kh2ghWvNkTunV2.JFr2.gy	\N	\N	\N	\N
279	Middelburg Country Club	Middelburg	Mpumalanga	/api/logos/279.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.7755780	29.4441320	0	0	\N	0	200	\N	\N	50	\N	\N	middelburg_country_club_279	$2b$08$gSgRweVLGIJyvtyLopIIm.fVDW3HFu29MO4Rhdwtva5AYIqSqgj0e	\N	\N	\N	\N
280	Middelburg Golf and Country Club	Middelburg	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-31.5265990	25.0313390	1	0	200.00	0	200	\N	\N	50	\N	\N	middelburg_golf_and_count_280	$2b$08$neGic1wxOagMS/FSllfU/uGA6W6mJ1WowmQ51/OK27HDxrpm7S84.	\N	013 282 6176	\N	\N
282	Milnerton Golf Club	Milnerton	Western Cape	/api/logos/282.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.8815320	18.4880740	0	0	\N	0	200	\N	\N	50	\N	\N	milnerton_golf_club_282	$2b$08$CO/r4BVqmbIYd0sMLUkIruHwg/rq2lNKtfKfHRa757r2wOanrHVx.	\N	081 032 1710	\N	\N
283	Milnerton Golf Club ~ Competition	Milnerton	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.8815320	18.4880740	1	0	200.00	0	200	\N	\N	50	\N	\N	milnerton_golf_club_compe_283	$2b$08$l5oI5s9Qja3WbHe.xdk5hOVHw.DX4e5NZBgk5gvFCKK.WMwKsquum	\N	081 032 1710	\N	\N
284	Modderfontein Golf Club	Modderfontein	Gauteng	/api/logos/284.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.1015200	28.1626150	1	1	250.00	0	200	\N	\N	50	\N	\N	modderfontein_golf_club_284	$2b$08$aizGYyGaE1qly2BcjgBkNuCi414yInRzavnTp2QB24.v15De4Symu	\N	\N	\N	\N
285	Mogol Golf Club	Lephalale	Limpopo	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-23.6862230	27.6953100	0	0	\N	0	200	\N	\N	50	https://mogolclub.co.za/about-us/	\N	mogol_golf_club_285	$2b$08$RbLvnKSRiELjWpG.f8D9c.mhANaCteBXKofhBheFk2kXV2V/bP2yS	\N	014 763 2427	\N	\N
287	Monks Cowl Country Club	Winterton	KwaZulu-Natal	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.0108240	29.4704510	1	1	250.00	0	200	\N	\N	50	https://monkscowlgolfclub.co.za/pages/36/contact-us	\N	monks_cowl_country_club_287	$2b$08$1s.ptvGoCtznw7hkSKMxl.4jaH58Fe2QAHB4MnBZOeANo2XRrasS2	\N	036 468 1300	\N	\N
289	Monzi Golf Club	Mtubatuba	KwaZulu-Natal	/api/logos/289.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-28.4327670	32.2984310	1	0	200.00	0	200	\N	\N	50	https://monzigolfclub.co.za/	\N	monzi_golf_club_289	$2b$08$kzu.gCsxvuRhIPcjuEpwl.SQ9egvIemNJiCXc18G1B7XaJVhFuteu	\N	\N	\N	\N
290	Mooi Nooi Golf Club	Mooi Nooi	North West	/api/logos/290.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.7522960	27.5639250	1	1	250.00	0	200	\N	\N	50	\N	\N	mooi_nooi_golf_club_290	$2b$08$cGrzzPT4nTJqwTLhGGZuHeYUYmKNVIiB6RrcAmIADR/C3.z2beQS.	\N	014 574 4111	\N	\N
291	Mooi River Country Club	Mooi River	KwaZulu-Natal	/api/logos/291.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.2026810	30.0099640	0	0	\N	0	200	\N	\N	50	\N	\N	mooi_river_country_club_291	$2b$08$aZYlMMCVAXuBcV4gi9nrLOgsOZ7EA60ZwnRcPb2UI96ImEeU8trUW	\N	\N	\N	\N
293	Moorreesburg Golf Club	Moorreesburg	Western Cape	/api/logos/293.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.1601500	18.6657090	1	1	250.00	0	200	\N	\N	50	\N	\N	moorreesburg_golf_club_293	$2b$08$p1NPLHoFqM2xLTyumsQk/OOwcaPEAmJwY91tgRVk88Pp9SMdUlhGW	\N	\N	\N	\N
294	Morgenzon Golf Club	Morgenzon	Mpumalanga	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.7322900	29.6131750	0	0	\N	0	200	\N	\N	50	\N	\N	morgenzon_golf_club_294	$2b$08$bzzloJ.0jOlPw5Twa5lgcOqIUTT6lmMTkhzblscBxNOfrACGWdMeq	\N	\N	\N	\N
295	Mossel Bay Golf Club	Mossel Bay	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.1895130	22.1312980	1	0	200.00	0	200	\N	\N	50	\N	\N	mossel_bay_golf_club_295	$2b$08$gt/Kk3WOEINLjBthLz/rKOCgcMkH4KvLWAhitrbMK3gnUXee/3C8.	\N	\N	\N	\N
297	Mount Edgecombe Country Club ~ The Woods (Course One)	Mount Edgecombe	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.7154820	31.0455700	0	0	\N	0	200	\N	\N	50	\N	\N	mount_edgecombe_country_c_297	$2b$08$7gwd0tK1iZlS1KqZdOrsQOF6g0GOrTp2ciGhFkNlw1PNGr8Y7l9e.	\N	\N	\N	\N
298	Mthatha Country Club	Mthatha	Eastern Cape	/api/logos/298.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-31.5876890	28.7758760	1	0	200.00	0	200	\N	\N	50	\N	\N	mthatha_country_club_298	$2b$08$D8q402P04FrN6Ab8XgKOtuadVsSj7IIt9NFKYR976t.JdWIYnWguu	\N	047 532 2770	\N	\N
301	Naboomspruit Golf Club	Naboomspruit	Limpopo	/api/logos/301.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-24.5098110	28.7051300	1	0	200.00	0	200	\N	\N	50	\N	\N	naboomspruit_golf_club_301	$2b$08$r9WRx62wgHT09rZB8lL6XOjRAiIlN3MJVWBCVRPMyCUUymGtmjsjG	\N	0212776523	\N	\N
303	Newcastle Golf Course	Newcastle	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-27.7414010	29.9503830	0	0	\N	0	200	\N	\N	50	\N	\N	newcastle_golf_course_303	$2b$08$qnTBCcmbVe99J1uEhW8F6.6SlnCJr2sbCJqCgkL9qnyphmcAoTS1a	\N	\N	\N	\N
304	Nigel Golf Club	Nigel	Gauteng	/api/logos/304.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.3956700	28.4552860	1	0	200.00	0	200	\N	\N	50	\N	\N	nigel_golf_club_304	$2b$08$2g2xQRRqH4bosi3PNySPxO/GfeyrfG8uWqmsRu.5D0DRBP1AMeq3i	\N	\N	\N	\N
306	Observatory Golf Club	Observatory	Gauteng	/api/logos/306.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.1785460	28.0787060	0	0	\N	0	200	\N	\N	50	https://observatorygolfclub.co.za/contacts/	\N	observatory_golf_club_306	$2b$08$O.EvbZttBl4PhjBcNxK/b.X4G7HSXOz14A.ZI2SZa7VAd8RFyuWe2	\N	010 476 0964	\N	\N
307	Ohenimuri Country Club	Walkerville	Gauteng	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.4449720	27.9486610	1	0	200.00	0	200	\N	\N	50	\N	\N	ohenimuri_country_club_307	$2b$08$1DjxqatO.Nh0JqqatouGdOnKeEpWq.V0YQKFLbMW0RTOJo5DwJfte	\N	\N	\N	\N
309	Oppenheimer Park Golf Club	Welkom	Free State	/api/logos/309.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-28.0192920	26.7803860	0	0	\N	0	200	\N	\N	50	\N	\N	oppenheimer_park_golf_clu_309	$2b$08$5wG6IrEODhq.eCfTZDFFdekpXe/8HzycTXFVEn/pL5BWQkvLPp0sq	\N	\N	\N	\N
310	Orangedene Golf Course	Letaba	Limpopo	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-23.8741380	30.2991210	1	0	200.00	0	200	\N	\N	50	\N	\N	orangedene_golf_course_310	$2b$08$OkfEkA30CJVd/Ra4BW4QsOiqywzeUbc4bEM3vv63VVafLd6tX.imG	\N	\N	\N	\N
311	Orkney Golf Course	Orkney	North West	/api/logos/311.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.9947600	26.6763070	1	1	250.00	0	200	\N	\N	50	\N	\N	orkney_golf_course_311	$2b$08$n/7DtghyAkg5/m7lVkdAXun6pxEWVh3BpbfQmK1RNd5FocY7aG5Fu	\N	\N	\N	\N
312	Ottosdal Country Club	Ottosdal	North West	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.8157750	26.0149620	0	0	\N	0	200	\N	\N	50	\N	\N	ottosdal_country_club_312	$2b$08$Ia6odpPSbNjFUQaeUrm4rObqwuouYTTbxKiqI24oNc80Ewr.d74pO	\N	\N	\N	\N
314	Oudtshoorn Golf Club	Oudtshoorn	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.5881730	22.2198310	1	1	250.00	0	200	\N	\N	50	\N	\N	oudtshoorn_golf_club_314	$2b$08$j3VWTgB1CP5T7egzUJb82ORlPUR/V91CdbG.0jILSgXiKp0pnJ/NO	\N	0665188944	\N	\N
316	Paarl Golf Club ~ Old Course	Paarl	Western Cape	/api/logos/316.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.7615850	18.9810430	1	0	200.00	0	200	\N	\N	50	https://paarlgolfclub.co.za/the-course/	\N	paarl_golf_club_old_cours_316	$2b$08$mIo8ImKlXedtp87TEBTrMOfmpXL7gxKUwMdTmbG.1I36o5Bie58Fq	\N	+27218631140	\N	\N
317	Paarl Golf Club ~ Winelands	Paarl	Western Cape	/api/logos/317.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.7615850	18.9810430	1	1	250.00	0	200	\N	\N	50	https://paarlgolfclub.co.za/	\N	paarl_golf_club_winelands_317	$2b$08$fsUDuno0L/8S3MbfqLK4UegLRHTChQNiWdPaT1.RLb0w2mMZvhIYK	\N	+27218631140	\N	\N
318	Papwa Sewgolum Golf Club	Durban	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.8008640	30.9666090	0	0	\N	0	200	\N	\N	50	\N	\N	papwa_sewgolum_golf_club_318	$2b$08$cQgLyC4qi/o0KEx7vU7yLeenRVfXm1z1pPoK9Mfdz5xOIlgo00n8S	\N	\N	\N	\N
320	Parow Golf Club	Parow	Western Cape	/api/logos/320.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.8967470	18.5736720	1	1	250.00	0	200	\N	\N	50	https://www.parowgolfclub.co.za/	\N	parow_golf_club_320	$2b$08$GbtNDCa0aJCkHkCxXTnUluM.9q5mlWExrHmuNAlLbe4/C0b1btS9m	\N	021 939 7756	\N	\N
321	Parys Golf & Country Estate	Parys	Free State	/api/logos/321.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.8899950	27.4665480	0	0	\N	0	200	\N	\N	50	\N	\N	parys_golf_country_estate_321	$2b$08$1tRpKR0c1RfSUm92f3Zo7.HWzs8nhUbE8QbmooyMStYC0x/7DLEEm	\N	056 818 1567	\N	\N
323	Pearl Valley Golf Estates	Franschhoek	Western Cape	/api/logos/323.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.8198960	18.9819540	1	1	250.00	0	200	\N	\N	50	https://www.pearlvalley.co.za/contact/	\N	pearl_valley_golf_estates_323	$2b$08$N4Ft.MkYC53SXDW5M8So5ubTu2ylQcN8WvXv8W3kgTqaa79k/43Ee	\N	+27218678045	\N	\N
324	Pebble Rock Country Club	Pretoria	Gauteng	/api/logos/324.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.6136070	28.3892540	0	0	\N	0	200	\N	\N	50	https://pebblerock.co.za/contact/	\N	pebble_rock_country_club_324	$2b$08$/2eFNWZ6tZuoe0.VVaU.0e21BmUcTQ1yg8HwQwU.FmZxrQqU7Cf/.	\N	012 808 5000	\N	\N
326	Petrus Steyn Golf Course	Petrus Steyn	Free State	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-27.6518580	28.1374030	1	1	250.00	0	200	\N	\N	50	\N	\N	petrus_steyn_golf_course_326	$2b$08$QWkwvgYnnSBnS6toViPJvu0Q8zvOUpYvlSzNju4fnkDmkyyWSyEBW	\N	+27 10 597 1030	\N	\N
327	Pezula Championship Golf Course	Knysna	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.0701680	23.0896940	0	0	\N	0	200	\N	\N	50	\N	\N	pezula_championship_golf__327	$2b$08$daqZDGFvzMUzl4p6T1lWM.6NVl8RYTTz96QohMO6x2mTbj5HWTQQu	\N	044 302 5310	\N	\N
328	Pezula Championship Golf Course ~ Par 3	Knysna	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.0701680	23.0896940	1	0	200.00	0	200	\N	\N	50	\N	\N	pezula_championship_golf__328	$2b$08$DVXmbwTf3SleLCBKS2ZGteu6dIaaGwszogiFgvELx7uWD2IvQtGJ2	\N	+27 44 302 5310	\N	\N
330	Piketberg Golf Club	Piketberg	Western Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-32.9029800	18.7673090	0	0	\N	0	200	\N	\N	50	\N	\N	piketberg_golf_club_330	$2b$08$ZbSUWFNV4IMID2MWzSMEheJeNBrj6ej.WQpiQPuHhpcNWiVF80qX2	\N	\N	\N	\N
331	Pilgrims Rest Golf Club	Pilgrimsrest	Mpumalanga	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-24.8852870	30.7409910	1	0	200.00	0	200	\N	\N	50	\N	\N	pilgrims_rest_golf_club_331	$2b$08$MVcZJQSp.hWYQfmUBcvqu.6CzDhhvX3Z5dBSchY9pcVFxrkQcE8/C	\N	\N	\N	\N
333	Plettenberg Bay Country Club	Plettenberg Bay	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.0620280	23.3484960	0	0	\N	0	200	\N	\N	50	\N	\N	plettenberg_bay_country_c_333	$2b$08$wPj3pLaKsVQggNca7m2XRuR.8D0ezFQha8Ce5RmV9q7UWUxF8viGG	\N	\N	\N	\N
334	Pollak Park Golf Course	Springs	Gauteng	/api/logos/334.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.2688470	28.4276600	1	0	200.00	0	200	\N	\N	50	\N	\N	pollak_park_golf_course_334	$2b$08$F9p.qDlVUmE2rKHH17w4QO3PRuGRTPYtXw84O5vXJS/2Bgg8cGXyy	\N	011 815 3123	\N	\N
335	Polokwane Golf Club	Polokwane	Limpopo	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-23.9228580	29.4602250	1	1	250.00	0	200	\N	\N	50	\N	\N	polokwane_golf_club_335	$2b$08$Wy22gy/sHmwiK4HUmBEc9u.0mzNMUEskvdRPr127pfGrBmJkbtrcO	\N	+27152954118	\N	\N
337	Port Edward Country Club	Port Edward	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-31.0535830	30.2199110	1	0	200.00	0	200	\N	\N	50	https://portedwardcountryclub.co.za/contact.html	\N	port_edward_country_club_337	$2b$08$yRJebDRi7EQjEGMhkg/WbeW50WsYw/rHVxRPCjJ5dulcNWibpxS7S	\N	039 492 0508	\N	\N
340	Port Shepstone Country Club	Port Shepstone	KwaZulu-Natal	/api/logos/340.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-30.7306140	30.4563110	1	0	200.00	0	200	\N	\N	50	\N	\N	port_shepstone_country_cl_340	$2b$08$3WnE54acfZwMUZOt9lGvB.qRyr70Hi7IHlh90YwE7ynvzzSBHQzRu	\N	\N	\N	\N
342	Potchefstroom Country Club	Potchefstroom	North West	/api/logos/342.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.7200560	27.1059840	0	0	\N	0	200	\N	\N	50	https://www.potchcc.co.za/	\N	potchefstroom_country_clu_342	$2b$08$EKlAEDtiOyCUa7v6Wbb2v.Evr1ABNkY3rqkBRqTAgUEoakp/0e1ta	\N	018 293 0677	\N	\N
343	Pretoria Country Club	Pretoria	Gauteng	/api/logos/343.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.7828830	28.2512220	1	0	200.00	0	200	\N	\N	50	\N	\N	pretoria_country_club_343	$2b$08$2.T418c0vnAcJbhKC2rltehB.SkA8uPcN/qFb85gfvtklNAvvHJPW	\N	012 460 6241	\N	241 Sidney Avenue, Waterkloof, Pretoria, 0181
345	Prieska Golf Club	Prieska	Northern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.6648020	22.7544030	0	0	\N	0	200	\N	\N	50	\N	\N	prieska_golf_club_345	$2b$08$8ywZ.N.aeXTt39XdgLKS.ObrgPs/Vyj46hIghMSj4jgyxIlJ3pbbi	\N	053 353 3448	\N	\N
346	Prince Albert Golf Club	Prince Albert	Western Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.2085130	22.0282020	1	0	200.00	0	200	\N	\N	50	\N	\N	prince_albert_golf_club_346	$2b$08$BbudlLKVCCoIjYnB.ecjK.O7IktbKUjg..r.eunQIqkVHuJEBAjIy	\N	\N	\N	\N
348	Queenstown Golf Club	Queenstown	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-31.9004950	26.8893450	0	0	\N	0	200	\N	\N	50	\N	\N	queenstown_golf_club_348	$2b$08$o5mRzjK0dHrZoDpW61CzTeILiUsWWT48MTavsCPpfChuKr3wwLLki	\N	\N	\N	\N
349	Randfontein Golf and Country Club	Randfontein	Gauteng	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.1550360	27.7142570	1	0	200.00	0	200	\N	\N	50	\N	\N	randfontein_golf_and_coun_349	$2b$08$HtxvvAd38Waem4eq0cl4.OkFUsM4b4elAcXu/MjnO01Rho7y7MSNS	\N	\N	\N	\N
350	Randpark Golf Club ~ Bushwillow Course	Randburg	Gauteng	/api/logos/350.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.1147380	27.9658250	1	1	250.00	0	200	\N	\N	50	https://randpark.co.za/	\N	randpark_golf_club_bushwi_350	$2b$08$bI3JlPIHbI4BJtvfjBvwzuEp06mhHrZy34ne/O5v6eIJuRoECvksC	\N	011 215 8600	\N	\N
352	Reading Country Club	Alberton	Gauteng	/api/logos/352.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.2650240	28.1073630	1	0	200.00	0	200	\N	\N	50	https://www.readingcc.co.za/	\N	reading_country_club_352	$2b$08$8dNcvjyQhWs3eL9NCC/6CenfwE8Gk.cRiJTHj5JVcb06sKokGohEy	\N	011 907 8906	\N	\N
353	Reitz Golf Club	Reitz	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-27.7885010	28.4410720	1	1	250.00	0	200	\N	\N	50	\N	\N	reitz_golf_club_353	$2b$08$0YZnqCYMwhyDCLh0ospCdesVTsGfz7ZzHS7gih5PovjbRGTFNCjAm	\N	\N	\N	\N
354	Reivilo Golf Club	Reivilo	North West	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-27.5542040	24.1830110	0	0	\N	0	200	\N	\N	50	\N	\N	reivilo_golf_club_354	$2b$08$MpuufLpkNDS1w.C2Hw9mVe4SuRMbibPPojzosjLeADg00oPH9MIfy	\N	\N	\N	\N
356	Richmond Country Club	Richmond	KwaZulu-Natal	/api/logos/356.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.8908160	30.2798010	1	1	250.00	0	200	\N	\N	50	\N	\N	richmond_country_club_356	$2b$08$HO6oYTZZzJoYCzCqr57BiOzJNrLyMTGwI3Ep84g/D/K/iU3WQBsCW	\N	\N	\N	\N
357	Richmond Golf Club	Richmond	Northern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-31.4195060	23.9394180	0	0	\N	0	200	\N	\N	50	\N	\N	richmond_golf_club_357	$2b$08$DPk3M8yhBaRqmAeUEZFepOgoZu0vq6G8DuL6IK74jxaPCoskcKWMq	\N	\N	\N	\N
359	Riverside Golf Course	Worcester	Western Cape	/api/logos/359.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.6655210	19.4575380	1	1	250.00	0	200	\N	\N	50	https://golftheriverside.com/	\N	riverside_golf_course_359	$2b$08$2kTy91YFG67Jt8aOWxrbhuGr4jZyd3lUmwVPGxsH5kYuK/eC8sMti	\N	\N	\N	\N
360	Riviera on Vaal Country Club	Vereeniging	Gauteng	/api/logos/360.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.6727380	27.9391300	0	0	\N	0	200	\N	\N	50	\N	\N	riviera_on_vaal_country_c_360	$2b$08$0qqJu6AIlX4lliFRVfkd4uvylfXOj0wrba7UQcbz35y5MflOxNyZ6	\N	016 100 5027	\N	\N
362	Robertson Golf Club	Robertson	Western Cape	/api/logos/362.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.8102620	19.8511740	1	1	250.00	0	200	\N	\N	50	\N	\N	robertson_golf_club_362	$2b$08$iESWemQ/v38GfetocGi9T.EWhKiZU1yecSj2ysjUXZPHqgmCH8R8q	\N	\N	\N	\N
364	Rooiberg Golf Club	Rooiberg	Limpopo	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-24.7768740	27.7459290	1	0	200.00	0	200	\N	\N	50	\N	\N	rooiberg_golf_club_364	$2b$08$BRcSwF.Xt4P.XdrooajofeVcpSvoMu0n0jkOtkrB55KbryQjS9D3S	\N	\N	\N	\N
365	Royal Burgundy Mashie Golf Course	Cape Town	Western Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.8424440	18.5531610	1	1	250.00	0	200	\N	\N	50	\N	\N	royal_burgundy_mashie_gol_365	$2b$08$jXXxijnokFR6ZG2VFKkGtO2FHuJiBHBO6.GKT4DY7KC7YCOZ6b.4q	\N	064 552 1059	\N	\N
367	Royal Durban Golf Club	Greyville	KwaZulu-Natal	/api/logos/367.webp	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.8403630	31.0165880	1	0	200.00	0	200	\N	\N	50	https://www.royaldurban.co.za/	\N	royal_durban_golf_club_367	$2b$08$5irGCccG0zieHDBLrfl5h.DPDX3k/C6WUp208VyqY5Aoh67zq1UPO	\N	0446854983	\N	\N
368	Royal Johannesburg & Kensington Golf Club ~ East Course	Johannesburg	Gauteng	/api/logos/368.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.1556690	28.1080310	1	1	250.00	0	200	\N	\N	50	https://royaljk.co.za/	\N	royal_johannesburg_kensin_368	$2b$08$uvK4YW0/soo0/X7gN2reA.LcPmsHeCECf4BiyZpVsj71XY5fzVw52	\N	011 640 3021	\N	\N
369	Royal Johannesburg & Kensington Golf Club ~ West Course	Johannesburg	Gauteng	/api/logos/369.jpg	18	\N	["Pro Shop", "Club Hire"]	1	1	2026-05-20 18:27:15	-26.1556690	28.1080310	0	0	\N	0	200	\N	\N	50	https://royaljk.co.za/	\N	royal_johannesburg_kensin_369	$2b$08$lUkHpLVwJVL7Ncszx3lF0utcygZY9Hb5eBCVNC46AtictW0I.AeOi	\N	011 640 3021	\N	\N
370	Royal Oak Country Club	Brakpan	Gauteng	/api/logos/370.ico	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.2264740	28.3591010	1	0	200.00	0	200	\N	\N	50	https://www.royaloakcountryclub.co.za/	\N	royal_oak_country_club_370	$2b$08$qZCHIIM86PbpuRi9A7U6o.OkTehaX/V2z0/0/ALLXhgpawJrsAJze	\N	+27117400016	\N	\N
371	Royal Port Alfred Golf Club	Port Alfred	Eastern Cape	/api/logos/371.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.6034990	26.8845770	1	1	250.00	0	200	\N	\N	50	\N	\N	royal_port_alfred_golf_cl_371	$2b$08$xuTYLdKwb6Ec6yBc2qPtuOvMmwMAXHR7SkIuy.CaQ8IbvzV4Q36R6	\N	046 624 4796	\N	\N
372	Ruimsig Country Club	Roodepoort	Gauteng	/api/logos/372.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.0827660	27.8654910	0	0	\N	0	200	\N	\N	50	https://ruimsigcc.co.za/contact-us/	\N	ruimsig_country_club_372	$2b$08$gWqT8blwJrEbkf.7GSvM9.YDeCYBFPhuk4eD3NCkt9MY2daipEBMm	\N	083 413 3441	\N	\N
374	Sabie Country Club	Sabie	Mpumalanga	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.1039530	30.7779620	1	1	250.00	0	200	\N	\N	50	\N	\N	sabie_country_club_374	$2b$08$6vPPOmws1Suri.rLlN/in.x/xbEfQsq05h02nsC1dVGkOgq.hRcbC	\N	\N	\N	\N
375	Sabie River Sun Golf Course	Hazyview	Mpumalanga	/api/logos/375.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.0348340	31.1131600	0	0	\N	0	200	\N	\N	50	\N	\N	sabie_river_sun_golf_cour_375	$2b$08$kMJyQDWUWqCyzzDDqb9RC.JSVJSdYZAm1KSfBTOmx/6tQ2qaaq1AO	\N	\N	\N	\N
378	San Lameer Country Club	Southbroom	KwaZulu-Natal	/api/logos/378.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-30.9402680	30.2920960	0	0	\N	0	200	\N	\N	50	https://sanlameer.co.za/contact	\N	san_lameer_country_club_378	$2b$08$SokdUBUUmWDLQ0l5aNvlN.WCTTP8QojhtEZPtM2eznNjkPg1FTS.S	\N	\N	\N	\N
379	Sand River Golf Course	Virginia	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-28.0947880	26.8745970	1	0	200.00	0	200	\N	\N	50	\N	\N	sand_river_golf_course_379	$2b$08$kLU3wrQOcUT9OCyGSIaia.bV..nksl/3IABME9NjjtDUrfJFP/jV.	\N	\N	\N	\N
381	Sandy Lane Golf Club	Hartebeespoort	North West	/api/logos/381.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.7490350	27.8285190	0	0	\N	0	200	\N	\N	50	https://sandylane.co.za/	\N	sandy_lane_golf_club_381	$2b$08$M8read6MzyjraCJTPlloS.H6l0D9iaDrly3BaL7nllHR9HdDd4MoO	\N	\N	\N	\N
382	Sani Pass Golf Club	Himeville	KwaZulu-Natal	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.6548030	29.4406560	1	0	200.00	0	200	\N	\N	50	\N	\N	sani_pass_golf_club_382	$2b$08$6loaL4q9VVi.WLhrcKcEXO1Goanea34clrAv4Xu7.HvzYut8YPQ3S	\N	\N	\N	\N
384	Saps Mechanics Golf Course	Benoni	Gauteng	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.1606550	28.3091010	0	0	\N	0	200	\N	\N	50	\N	\N	saps_mechanics_golf_cours_384	$2b$08$3/k1HKV7yCz.KBFwjUT8ReCxxDqtVfEDVezfcAV3c.GcDusehc6iC	\N	\N	\N	\N
385	Sardinia Bay Golf Club	Port Elizabeth	Eastern Cape	/api/logos/385.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.0166490	25.4968930	1	0	200.00	0	200	\N	\N	50	\N	\N	sardinia_bay_golf_club_385	$2b$08$BS8dOSRAU.c15Tw/BCiBdevIr3vN6ZsyN1NXMOHCi7rq30vYuxkrO	\N	+27833042476	\N	\N
386	Schoeman Park Golf Course	Bloemfontein	Free State	/api/logos/386.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.1165380	26.2497930	1	1	250.00	0	200	\N	\N	50	\N	\N	schoeman_park_golf_course_386	$2b$08$0CLd9UHbpD6mFQkJa58NV.K0RsqQ5uPgbk8CTCPEycqWg0fhDtYRm	\N	051 101 0619	\N	\N
388	Scottburgh Golf Course	Scottburgh	KwaZulu-Natal	/api/logos/388.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-30.2905970	30.7510620	1	0	200.00	0	200	\N	\N	50	\N	\N	scottburgh_golf_course_388	$2b$08$utFixhGYTYru7B8zv9HfP.jYuijUYxJLRlgxn10Roe7/glbncc/Fy	\N	087 150 1312	\N	\N
390	Sedge Links Golf Club	Sedgefield	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.0101740	22.7557190	0	0	\N	0	200	\N	\N	50	\N	\N	sedge_links_golf_club_390	$2b$08$zLiBlslkb.232mjxTnUw..CgJNQBSEwFXNoh8H67d5M2vtgJNZQRi	\N	\N	\N	\N
391	Selborne Country Club	Pennington	KwaZulu-Natal	/api/logos/391.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-30.3761850	30.6782160	1	0	200.00	0	200	\N	\N	50	\N	\N	selborne_country_club_391	$2b$08$FRP3W6vYNsCH4MbwHOXRX.DP0A089.Xinx5gdlcxv1QgDYvcNrTym	\N	087 135 0559	\N	\N
392	Senekal Golf Club	Senekal	Free State	/api/logos/392.png	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-28.3193420	27.6186630	1	1	250.00	0	200	\N	\N	50	\N	\N	senekal_golf_club_392	$2b$08$kBumjHZmkAFSi5IEeG/aKu0.MzT6YqbMEo4RTn1d/5CHWJGgD9PYe	\N	\N	\N	\N
394	Serengeti Golf & Wildlife Estate ~ Whistling Thorn	Ekurhuleni	Gauteng	/api/logos/394.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.0415570	28.2898850	1	0	200.00	0	200	\N	\N	50	https://serengeti-estates.co.za/whistling-thorns/	\N	serengeti_golf_wildlife_e_394	$2b$08$Vrba.raeJVG52ERDzCuR0O6ah8fKTT4rlnqc.p/G56VBn6mybw81u	\N	0115527200	\N	\N
395	Services Golf Club	Pretoria	Gauteng	/api/logos/395.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.7844400	28.1597830	1	1	250.00	0	200	\N	\N	50	https://servicesgc.co.za/	\N	services_golf_club_395	$2b$08$El8qQ0OAaKkwOYMJp3KNLeK9Z220zirBY0hIK1HfYhFJ9FBW24J2y	\N	012 651 4411	\N	\N
396	Sesambos Golf Course	Swartwater	Limpopo	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-22.7912920	28.1200970	0	0	\N	0	200	\N	\N	50	\N	\N	sesambos_golf_course_396	$2b$08$FELFYsd4kHppmLPJwafwZ.EyxXE7Otw0NYV9pi9O.t63Z8SkQ3Q52	\N	\N	\N	\N
398	Shelley Point Golf Club	St Helena Bay	Western Cape	/api/logos/398.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-32.7091000	17.9725930	1	1	250.00	0	200	\N	\N	50	https://shelleypointcountryclub.co.za/	\N	shelley_point_golf_club_398	$2b$08$WAVdpRzEc3OJf0t52N7wWeHkxQCb/W/1y1Fnz70MGDhVU/WUtn/uq	\N	\N	\N	\N
399	Silver Lakes Golf Estate	Pretoria	Gauteng	/api/logos/399.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.7727030	28.3705620	0	0	\N	0	200	\N	\N	50	https://silverlakes.co.za/contact-us/	\N	silver_lakes_golf_estate_399	$2b$08$SHXWQOY8JjSivznYkpksSu0qbM6/q524JiSXkYbQ6rmcB89L6rqK2	\N	\N	\N	\N
401	Simola Golf & Country Estate	Knysna	Western Cape	/api/logos/401.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.0029060	23.0309870	1	1	250.00	0	200	\N	\N	50	https://www.simola.co.za/	\N	simola_golf_country_estat_401	$2b$08$YT73lNH0RWaRsyqGizaIJu8zh.3JWMJLplcKKaN/uS7Q0wGuoZFMS	\N	+27443029600	\N	\N
402	Simon's Town Country Club	Cape Town	Western Cape	/api/logos/402.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.2011480	18.4534260	0	0	\N	0	200	\N	\N	50	\N	\N	simon_s_town_country_club_402	$2b$08$k6cdXIA22ATze52FOH4zH.sa3PIBBxJbbck7WAGN3chxWnsM3s87.	\N	\N	\N	\N
403	Sishen Golf Club	Kathu	Northern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-27.6889590	23.0597230	1	0	200.00	0	200	\N	\N	50	\N	\N	sishen_golf_club_403	$2b$08$.ikeq6FFWkbEAYlxRGknBewEIsdmduoQdsyNr4RACqJHT5Zle6vfq	\N	053 050 5727	\N	\N
405	Skukuza Golf Club	Skukuza	Mpumalanga	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-24.9837900	31.5766810	0	0	\N	0	200	\N	\N	50	\N	\N	skukuza_golf_club_405	$2b$08$vYjqVJZBminaVRQyBiCqnObLRkyl5wjMzwIgnA/OesE/nKAPpa6TG	\N	+27 13 735 5543	\N	\N
406	Smithfield Golf Club	Smithfield	Free State	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-30.1967280	26.5371010	1	0	200.00	0	200	\N	\N	50	\N	\N	smithfield_golf_club_406	$2b$08$p4qb28RcDt8nAplvBqXXAuZt0KxCTZ1jxoMNqAKsI9cQCAwisaR2i	\N	\N	\N	\N
408	Somerset West Golf Club	Somerset West	Western Cape	/api/logos/408.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.0793710	18.8404440	0	0	\N	0	200	\N	\N	50	https://www.somersetwestgolfclub.co.za/	\N	somerset_west_golf_club_408	$2b$08$j5uhpkH2X1AHaI/F3//XSeV1bdYsUmLQt/FoCQ4PE2/TLAUyWGDBO	\N	021 852 2925	\N	\N
410	Southbroom Golf Club	Southbroom	KwaZulu-Natal	/api/logos/410.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-30.9179090	30.3221800	1	1	250.00	0	200	\N	\N	50	https://www.southbroomgolfclub.co.za/contact-us/	\N	southbroom_golf_club_410	$2b$08$NoyeVRgU8d9vvX74REE2VOV.s5WDULHekXsLC8qUbVDhMeVOrSXBW	\N	0393166051	\N	\N
411	Soutpansberg Golf Club	Makhado	Limpopo	/api/logos/411.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-23.0316140	29.9050860	0	0	\N	0	200	\N	\N	50	\N	\N	soutpansberg_golf_club_411	$2b$08$iwWtPX2swcK3.aoAMJt/7OTaZJAjyhs6hmnc0.N9gpaqk7UOHpBrW	\N	\N	\N	\N
412	Soweto Country Club	Soweto	Gauteng	/api/logos/412.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.2764620	27.9037110	1	0	200.00	0	200	\N	\N	50	\N	\N	soweto_country_club_412	$2b$08$JpY0ubqJfz3uc7cmUlQQsODcls1vmIIF.exD8zQJ05Uz3btVDedJG	\N	060 743 6682	\N	\N
414	Springs Country Club	Springs	Gauteng	/api/logos/414.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.2645700	28.4425060	0	0	\N	0	200	\N	\N	50	\N	\N	springs_country_club_414	$2b$08$BxRkf6g1VSehiiyq0EmTYevPUutYl6nwmEZwhDgX.xbvFE.1aJoAO	\N	011 362 5031	\N	\N
417	Standerton Country Club	Standerton	Mpumalanga	/api/logos/417.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.9470530	29.2543510	0	0	\N	0	200	\N	\N	50	\N	\N	standerton_country_club_417	$2b$08$wQrUUqZT9hZC5rjsuf1Sse.97MZfq.REK82n9YrQfZOgDiYGNoCaW	\N	017 712 1049	\N	\N
418	State Mines Country Club	Brakpan	Gauteng	/api/logos/418.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.2087740	28.3742590	1	0	200.00	0	200	\N	\N	50	\N	\N	state_mines_country_club_418	$2b$08$QB0wi89RJW2HViM/8jhDveKArQyKVaiXxChWRSEWiFpDr2skZ4e/u	\N	\N	\N	\N
420	Stella Golf Club	Stella	North West	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.5453980	24.8597950	0	0	\N	0	200	\N	\N	50	\N	\N	stella_golf_club_420	$2b$08$OdB2DzB56TxN0bEhUPj/bOWiNlH/SGu4rnmg/XrqJv0r5q2laDHxy	\N	\N	\N	\N
421	Stellenbosch Golf Club	Stellenbosch	Western Cape	/api/logos/421.gif	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.9582470	18.8502660	1	0	200.00	0	200	\N	\N	50	https://stellenboschgolfclub.com/management-and-staff/	\N	stellenbosch_golf_club_421	$2b$08$.zCNWPCOCcYcfkHxc6H7v.Estdg71DK1XKnjBjps7bkvmTQTWRny2	\N	\N	\N	\N
422	Steyn City Golf Course	Midrand	Gauteng	/api/logos/422.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.9710810	27.9962920	1	1	250.00	0	200	\N	\N	50	https://www.steyncity.co.za/experience/jack-nicklaus-golf-course	\N	steyn_city_golf_course_422	$2b$08$DSf7UkFU/YrTuFZCYc2LoOYw.plyB7SsBrYK4KZc3GOGaxr3pKr1q	\N	010 597 1030	\N	\N
423	Stilbaai Golf Club	Still Bay	Western Cape	/api/logos/423.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.3870980	21.4114510	0	0	\N	0	200	\N	\N	50	\N	\N	stilbaai_golf_club_423	$2b$08$2I07/1AEBZ9OSZ3m8QuQ4.hMdMH8Uv4JoNXGxzDkSU3C/nA9okDs6	\N	\N	\N	\N
425	Strand Golf Club	Strand	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.0980740	18.8174070	1	1	250.00	0	200	\N	\N	50	https://www.strandgolfclub.co.za/	\N	strand_golf_club_425	$2b$08$hk27Im8sVuccOpm6Yj2meu3sX/zfUsF3C0jfN5nTbd4uiaI/sxiCy	\N	+27218543309	\N	\N
426	Stutterheim Golf Club	Stutterheim	Eastern Cape	/api/logos/426.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-32.5664750	27.4122970	0	0	\N	0	200	\N	\N	50	\N	\N	stutterheim_golf_club_426	$2b$08$7utS6yudLDdWJhjWppLjyu.wipyvnvnHfUs5IF2Sk3mRWJbhZYBXy	\N	043 683 1508	\N	\N
428	Sutherland Golf Club	Sutherland	Northern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-32.4043250	20.6588460	1	1	250.00	0	200	\N	\N	50	\N	\N	sutherland_golf_club_428	$2b$08$gJ5dea/wPP7ij0BcqLjAzumA.4qefiySwRoAIg15fbpZKtTxxa/k.	\N	023 571 1033	\N	\N
429	Swartklip Golf Club	Swartklip	Limpopo	/api/logos/429.jpg	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-24.9075120	27.1399760	0	0	\N	0	200	\N	\N	50	\N	\N	swartklip_golf_club_429	$2b$08$bdVK4k5Qo3DsMt10vM1EsOGNtHJZ8PDNE.KTMut7B5dmBHjI8qUxm	\N	0631902121	\N	\N
431	Tempe Golf Club	Bloemfontein	Free State	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.0945010	26.1959340	1	1	250.00	0	200	\N	\N	50	\N	\N	tempe_golf_club_431	$2b$08$O471iYXK7MGBVghv.PI0XeNiXyvwhCmQN4oNACmkHkFFXJYIL.vzq	\N	\N	\N	\N
432	Thabazimbi Golf Course	Thabazimbi	Limpopo	/api/logos/432.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-24.6332860	27.3719450	0	0	\N	0	200	\N	\N	50	\N	\N	thabazimbi_golf_course_432	$2b$08$ivcHPeHrmpW2lQ68Z6N8dOv4czcktZSd1N.jZA3FsxfF1qR4YanpW	\N	\N	\N	\N
434	The Belmont Golf Club	Grahamstown	Eastern Cape	/api/logos/434.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.3251360	26.6110230	1	1	250.00	0	200	\N	\N	50	\N	\N	the_belmont_golf_club_434	$2b$08$L07pi.K5H1nHfobH4q/n8.InDti0pwIyTjhW.CdG45RfmVVOtX1ci	\N	\N	\N	\N
435	The Clarens Golf Estate	Clarens	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-28.5161220	28.4291030	0	0	\N	0	200	\N	\N	50	https://www.theclarens.co.za/	\N	the_clarens_golf_estate_435	$2b$08$41GaLsb6MGBdAS4LbUtol.1WxcwQbDuRXUOPbLPYk7pyM85BD03p2	\N	+27582561270	\N	\N
437	The Islands Estate Mashie Course	Hartbeespoort	North West	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.7649900	27.8476280	1	1	250.00	0	200	\N	\N	50	\N	\N	the_islands_estate_mashie_437	$2b$08$aEM0ajO/Je9Ncqe1KBoiGORcf7jQ23nBibbqNJ..Lzy8FQrSZl6li	\N	012 244 0777	\N	\N
438	The Lake Golf Club - Benoni	Benoni	Gauteng	/api/logos/438.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.1828100	28.2969140	0	0	\N	0	200	\N	\N	50	https://www.lakeclub.co.za/	\N	the_lake_golf_club_benoni_438	$2b$08$7QPxvryGuA95Dur5kvN7pujRGOZlpL/ahPJJAsLsyNp.aAL7W7oHG	\N	0703508936	\N	\N
440	The River Club Golf Course	Sandton	Gauteng	/api/logos/440.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.0778080	28.0386240	1	1	250.00	0	200	\N	\N	50	\N	\N	the_river_club_golf_cours_440	$2b$08$AH/FBDIhuH1OG8b292SXe.295vJRu3ApJph5hWuFTUaB6cj.7k9HK	\N	\N	\N	\N
441	The Wanderers Golf Club	Sandton	Gauteng	/api/logos/441.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.1334060	28.0518720	0	0	\N	0	200	\N	\N	50	\N	\N	the_wanderers_golf_club_441	$2b$08$DYwNrepJMcVknBBGzARP7Och2A9dEM8PI5z.hXsdEIHRZRvsB0RXW	\N	\N	\N	\N
443	Theunissen Golf Club	Theunissen	Free State	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-28.3892510	26.7179130	1	1	250.00	0	200	\N	\N	50	\N	\N	theunissen_golf_club_443	$2b$08$6PyI2oMIECbT9q8wIVxzTOMvptD9MNCYnfNN1.2v3UR7I.uccu3yy	\N	\N	\N	\N
444	Three Chameleons Short Golf Course	Blanco	Western Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.9764400	22.3873710	0	0	\N	0	200	\N	\N	50	\N	\N	three_chameleons_short_go_444	$2b$08$eRVJkFrEN96XS0fdkg5qduOOVSqXxoCaBPdvrfHk2FXVyTIXzi/i.	\N	\N	\N	\N
445	Tsitsikamma Coastal Golf Estate	Storms River	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.0061630	23.8961990	1	0	200.00	0	200	\N	\N	50	\N	\N	tsitsikamma_coastal_golf__445	$2b$08$vaR5zbyQXtCe.VQNJhMNM.tDUaLl1CA13Ot/erEs4LKPHUFo4aL9.	\N	0543384180	\N	\N
447	Tzaneen Country Club	Tzaneen	Limpopo	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-23.7472700	30.1101140	0	0	\N	0	200	\N	\N	50	https://www.tzaneencountryclub.co.za/tcccontacts.html	\N	tzaneen_country_club_447	$2b$08$DMVpiLLkABoUNtXuBvLm7egC1drw1NQZBph7T/XmL9n4DLIXuc8Z6	\N	083 414 4002	\N	\N
448	Uitenhage Golf Club	Uitenhage	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.7426280	25.4129170	1	0	200.00	0	200	\N	\N	50	\N	\N	uitenhage_golf_club_448	$2b$08$lCSJ4pZ/Q1VRBGD0MFiNwOA1XHOpJpclpztApr28iQY3/RK.eKs8m	\N	+27419661868	\N	\N
450	Umdoni Park Golf Course	Pennington	KwaZulu-Natal	/api/logos/450.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-30.3923250	30.6894710	0	0	\N	0	200	\N	\N	50	https://umdonipark.com/	\N	umdoni_park_golf_course_450	$2b$08$cI2s2vBfqhl3JD1cv9j/A.DOnfVZC./TtE72m5Qp/t2.wLi4eW5mm	\N	\N	\N	\N
452	Umhlali Golf Estate & Country Club	Umhlali	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-29.5112090	31.1971160	1	1	250.00	0	200	\N	\N	50	https://umhlaliclub.co.za/	\N	umhlali_golf_estate_count_452	$2b$08$aQlX1OnEN/Z87Ck4szGhqeirLKCtKXzFl/wdb0sek2/tz.VqnqC66	\N	0189369987	\N	\N
453	Umkomaas Golf Club	Umkomaas	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-30.2087880	30.7956220	0	0	\N	0	200	\N	\N	50	\N	\N	umkomaas_golf_club_453	$2b$08$WvjJ1mXmeuEi7huPinaSZeI./tOqFi4a13ZylwfC8iLk1mPqQi.Ju	\N	079 299 8099	\N	\N
457	Upington Golf Club	Upington	Northern Cape	/api/logos/457.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-28.4269740	21.2996580	1	0	200.00	0	200	\N	\N	50	\N	\N	upington_golf_club_457	$2b$08$wS7kpHus7oKGqAn0CRdKrOTXzsNoru.jPJ4VcH1704BijyQN4Ud/O	\N	\N	\N	\N
458	Utrecht Golf Course	Utrecht	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-27.6411850	30.3376130	1	1	250.00	0	200	\N	\N	50	\N	\N	utrecht_golf_course_458	$2b$08$qjLaTCM7bq5DmHLXlwDEqut4EzRgudhrvlTYNCDoLM2rfKPGTpA4.	\N	\N	\N	\N
460	Ventersdorp Golf Club	Ventersdorp	North West	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-26.3243610	26.8277770	1	0	200.00	0	200	\N	\N	50	\N	\N	ventersdorp_golf_club_460	$2b$08$Ie0fEy57.Xkf2Fs1bqqKteSUxILOhHgq.bgbvFOX1MMQY4kNu6jsK	\N	\N	\N	\N
462	Victoria West Golf Club	Victoria West	Northern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-31.4022400	23.1299180	0	0	\N	0	200	\N	\N	50	\N	\N	victoria_west_golf_club_462	$2b$08$Yi55fXpsrfGjwhW02i95aeJMNzUQnMV92hAbAzPm6WmBeg0vi3dYu	\N	\N	\N	\N
463	Viljoenskroon Golf Club	Viljoenskroon	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-27.2152430	26.9605710	1	0	200.00	0	200	\N	\N	50	\N	\N	viljoenskroon_golf_club_463	$2b$08$XLmIbz6NVPnOl2hOmmsJ4.5vSo8WbDq85nE.xucK.wnQOiLcrWtoG	\N	\N	\N	\N
464	Village Mashie Club	Vaal Reef	North West	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-26.9302720	26.7424780	1	1	250.00	0	200	\N	\N	50	\N	\N	village_mashie_club_464	$2b$08$DUwX2IMVtWuFDJGPgKVEwuwBh.SEolwdeo.OCyqJd6t8qH2tWnkvW	\N	073 334 5393	\N	\N
465	Volksrust Golf Club	Volksrust	Mpumalanga	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-27.3735740	29.8739720	0	0	\N	0	200	\N	\N	50	\N	\N	volksrust_golf_club_465	$2b$08$51j5L0pBwbUGWPceMZFpfOCOIE1b0TADHuc01uz51.IP8IPzcIc16	\N	0762144629	\N	\N
467	Vredenburg Golf Club	Vredenburg	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-32.9215000	18.0555240	1	1	250.00	0	200	\N	\N	50	\N	\N	vredenburg_golf_club_467	$2b$08$0ZXnq2kJ5fsSd4GOuGR4Z.JGNEo6b7MlozsNG2SyBBC/zRdNFWt9.	\N	022 715 3003	\N	\N
468	Vredendal Golf Club	Vredendal	Western Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-31.6617270	18.5501830	0	0	\N	0	200	\N	\N	50	\N	\N	vredendal_golf_club_468	$2b$08$g0NmSeq0.kA5nrdBxOwB0ulWVMkYcBpiM/WMPDtgv4xxXlYDGtAx2	\N	+27272133740	\N	\N
470	Vryheid Golf Club	Vryheid	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-27.7800250	30.7950210	1	1	250.00	0	200	\N	\N	50	\N	\N	vryheid_golf_club_470	$2b$08$2ahVtXucaRx1fI7.KUj72u5qZCz4TDHQBu/fOhUKKENivZcF9azxe	\N	\N	\N	\N
472	Wagner's Golf Academy	Cape Town	Western Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-33.8571840	18.6692050	1	0	200.00	0	200	\N	\N	50	\N	\N	wagner_s_golf_academy_472	$2b$08$PbDs0noYqUrB9SqSSPzELuiMXf317b7cAtUhTur.TCAjTXNBTFUa6	\N	021 981 6042	\N	\N
473	Walker Park Golf Club	Evander	Mpumalanga	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-26.4874360	29.1012600	1	1	250.00	0	200	\N	\N	50	\N	\N	walker_park_golf_club_473	$2b$08$WNoPRx2snO/zLhUkSJo8AO.dDNWP7ad94MM7rCRr8mAkqiWPUdlZK	\N	\N	\N	\N
474	Walmer Country Club	Walmer	Eastern Cape	/api/logos/474.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-33.9916070	25.5771050	0	0	\N	0	200	\N	\N	50	https://walmergolfestate.co.za/	\N	walmer_country_club_474	$2b$08$n.T8s8fKjibytWki4DNSQuDjgiw0Gk2JHE0sNYfKVHPKVB3KYloa6	\N	+27 41 581 1613	\N	\N
476	Waterford Golf Course	Loch Vaal	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-26.7699820	27.6961830	1	1	250.00	0	200	\N	\N	50	\N	\N	waterford_golf_course_476	$2b$08$5VBFGUUs2RpIl5gvqa/Vp.p9FEs.hkPj/Ta.HdEFH2axR6TYEvMWu	\N	\N	\N	\N
477	Waterkloof Golf Club	Pretoria	Gauteng	/api/logos/477.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-25.7892890	28.2220960	0	0	\N	0	200	\N	\N	50	\N	\N	waterkloof_golf_club_477	$2b$08$RDfAP.0iSsAUXGEUBH5FN.zkMRlKh6IQvs2xYQJ7ojQB/DORIHuAy	\N	012 007 1147	\N	\N
478	Waterpan Golf Course	Westonaria	Gauteng	/api/logos/478.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-26.3556850	27.7022650	1	0	200.00	0	200	\N	\N	50	\N	\N	waterpan_golf_course_478	$2b$08$GCjbVCVqOY.rfA9cAF43Lubq81Nsw1vWiAVP2nzQrBNFPnPyGyNx2	\N	074 367 2929	\N	\N
480	Wellington Golf Club	Wellington	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-33.6419260	18.9891600	0	0	\N	0	200	\N	\N	50	\N	\N	wellington_golf_club_480	$2b$08$mr9bJghvUPOsjyO1GCpEmO5UtqWjsKE2/GaFUh/cXei8BcUxizo7a	\N	\N	\N	\N
481	Wesselsbron Golf Club	Wesselsbron	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-27.8599120	26.3671230	1	0	200.00	0	200	\N	\N	50	\N	\N	wesselsbron_golf_club_481	$2b$08$X6LPuTVPPqCGMfqnBEcr7uS61vPW2vIbbmhiLZcVqGpBWAMzLjqT2	\N	+27578992612	\N	\N
483	Western Deep Levels Mashie Golf Club	Carletonville	North West	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-26.4237710	27.4298570	0	0	\N	0	200	\N	\N	50	\N	\N	western_deep_levels_mashi_483	$2b$08$Cij8CVvSk2PQWgCPwwKmYeY1TzMJ54MF/1G0yB7RTjYp91Vit.6YG	\N	\N	\N	\N
485	Westminster Golf Club	Westminster	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-29.1592800	27.1579150	1	1	250.00	0	200	\N	\N	50	\N	\N	westminster_golf_club_485	$2b$08$d9cBJbEXp7M4Zab79dzGc.qb4z7BkzpShWjVX9mLkmgJ6pYFRtWs.	\N	\N	\N	\N
486	White River Country Club	White River	Mpumalanga	/api/logos/486.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-25.2849270	31.0101770	0	0	\N	0	200	\N	\N	50	\N	\N	white_river_country_club_486	$2b$08$ifqfkHf72M1/ZneUZ4hrVeENoa/V/uinjQZMhEEfDO6De3tQcBBo.	\N	\N	\N	\N
487	Whites Golf Club	Hennenman	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-28.0089780	26.9920110	1	0	200.00	0	200	\N	\N	50	\N	\N	whites_golf_club_487	$2b$08$5tRLlHKGML8R9ES/m7k8X.wvufIGxtKQXwWen9MO1cS9E1jZsUf8W	\N	0543364984	\N	\N
488	Wild Coast Sun Country Club	Port Edward	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-31.0883080	30.1840440	1	1	250.00	0	200	\N	\N	50	\N	\N	wild_coast_sun_country_cl_488	$2b$08$JTTsV.QhXDfsW/Dx8IrHSOsmn37NRYiqVfm.ju8Ein8x.Qkl5v0Tu	\N	039 316 6051	\N	\N
489	Williston Golf Club	Williston	Northern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-31.3366290	20.9065310	0	0	\N	0	200	\N	\N	50	\N	\N	williston_golf_club_489	$2b$08$P9Zw1hzySwgPj9rlaam8D.Ou4h5LlyzglmYz32jwb5oidNjftdcy.	\N	\N	\N	\N
491	Windsor Park Municipal Golf Course	Durban	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-29.8160760	31.0296330	1	1	250.00	0	200	\N	\N	50	\N	\N	windsor_park_municipal_go_491	$2b$08$UQdszXrM4LCJc1htICquJOBZks5N.D/g1CC5c3l0w4i8vcfjAi64K	\N	031 312 2245	\N	\N
492	Wingate Park Country Club	Pretoria	Gauteng	/api/logos/492.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-25.8261790	28.2774920	0	0	\N	0	200	\N	\N	50	https://wingateparkcountryclub.co.za/	\N	wingate_park_country_club_492	$2b$08$69sZtLvL.dqqLfZZ/BuzfOpMQK5U/CL2kbSGe0WrA18z1/kNIJ3aK	\N	065 532 1590	\N	\N
493	Witbank Golf Club	Witbank	Mpumalanga	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-25.8821150	29.2167880	1	0	200.00	0	200	\N	\N	50	\N	\N	witbank_golf_club_493	$2b$08$ZQdEYWSMTOleIQb7eGBncuSMI5IkbCosCq5xine1rH.b0K6tNcg8G	\N	\N	\N	\N
495	Woodhill Country Club	Pretoria	Gauteng	/api/logos/495.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-25.8210130	28.3122920	0	0	\N	0	200	\N	\N	50	\N	\N	woodhill_country_club_495	$2b$08$g7sLK9PgB4k/f.TAKBW.OOZtiUvwT.Zv1vXMqaqk6BM7ytiPvBcOG	\N	+27 12 998 0021	\N	\N
130	Fancourt Hotel & Country Club ~ The Links Experience Par 3	George	Western Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.9629610	22.4005960	1	0	200.00	0	200	\N	\N	50	\N	\N	fancourt_hotel_country_cl_130	$2b$08$VS8bUAeDooXTZzaWyKBPXetb.4b2dFRjbvklLQXBMscsGK3.wLEnq	\N	+27 44 804 0000	\N	\N
132	Fig Tree Golf Course	East London	Eastern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.9423400	27.9718810	0	0	\N	0	200	\N	\N	50	\N	\N	fig_tree_golf_course_132	$2b$08$77e/x8evtDIRURMlDluDb.RkGNMk9LOfg0yHGfgrVY0iaPYs2LNv.	\N	076 808 1455	\N	\N
136	Fynbos Golf and Country Estate	Oubosrand	Eastern Cape	/api/logos/136.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.0702670	24.2331310	1	0	200.00	0	200	\N	\N	50	https://www.fynbosgolf.co.za/	\N	fynbos_golf_and_country_e_136	$2b$08$ClA87dgBsLwXcygHgLwWyu3uZiIjfMhCcvXv3b5X3VPj.sPwfiQk.	\N	+27 72 751 6162	\N	\N
139	George Golf Club	George	Western Cape	/api/logos/139.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.9535340	22.4459550	1	0	200.00	0	200	\N	\N	50	\N	\N	george_golf_club_139	$2b$08$B7dYpvJj6B2H.UhPUMSE0./YjvcbzxSWtE6FCh4W6Z//LrgAQ7Pmq	\N	+27 44 873 6116	\N	\N
140	Germiston Country Club	Germiston	Gauteng	/api/logos/140.jpg	18	\N	["Pro Shop", "Club Hire"]	1	1	2026-05-20 18:27:14	-26.2331250	28.1530280	1	1	250.00	0	200	\N	\N	50	\N	\N	germiston_country_club_140	$2b$08$0fAuC7wGyela1wgiBVWnae9f8Cj7og7LKaAztpFzRMctgTQ67UBNG	\N	\N	\N	\N
141	Glencoe Correctional Services Golf Club	Glencoe	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.1568650	30.1348330	0	0	\N	0	200	\N	\N	50	\N	\N	glencoe_correctional_serv_141	$2b$08$b9vFRhTCX5cc8aw.FKcPNuqYBpTpkG/QSyjrohxjK8Ok5LlBgPda.	\N	034 393 2107	\N	\N
142	Glendower Golf Club	Bedfordview	Gauteng	/api/logos/142.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.1598730	28.1417710	1	0	200.00	0	200	\N	\N	50	https://glendower.co.za/	\N	glendower_golf_club_142	$2b$08$mCRzQ3fKxOryIlCuxPKFqumGwB0m3uqGdukzPezGgvzeqoek8b3xG	One of Gauteng's premier parkland courses, Glendower offers a challenging 18-hole layout with tree-lined fairways and immaculate greens. Having hosted the SA Open multiple times, it is a bucket-list club for every South African golfer.	+27 11 453-1013	\N	\N
150	Gowrie Farm Golf Course	Nottingham Road	KwaZulu-Natal	/api/logos/150.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.3626060	30.0030230	0	0	\N	0	200	\N	\N	50	https://www.gowrie.co.za/	\N	gowrie_farm_golf_course_150	$2b$08$WXvq2hbhUiQdsNdcOwopBemhpSprGsOzzIKmBHLhoesYN2jrt3Lxi	\N	+27733460847	\N	\N
154	Grahamstown Golf Club	Grahamstown	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.2963740	26.4993270	1	0	200.00	0	200	\N	\N	50	\N	\N	grahamstown_golf_club_154	$2b$08$6CjWu6Q.LUuuc09XmoxCeeNzRP9qSp1LFIbS6ImBLSO5AALhm631C	\N	\N	\N	\N
157	Greytown Country Club	Greytown	KwaZulu-Natal	/api/logos/157.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.0760470	30.5927820	1	0	200.00	0	200	\N	\N	50	\N	\N	greytown_country_club_157	$2b$08$Yzk4hPrCEGoxzChLa6jjp.bNCVMu69P075xUkHsODFOSp9jaC8huO	\N	033 417 2441	\N	\N
160	Hans Merensky Golf Course	Phalaborwa	Limpopo	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-23.9631270	31.1665250	1	0	200.00	0	200	\N	\N	50	\N	\N	hans_merensky_golf_course_160	$2b$08$Zwwe1xIOqESE.gLcZKjmruqbL/19DLx9y3nngQ7do4OGllZP005z.	\N	+27 15 781 3931	\N	\N
163	Hartswater Golf Club	Hartswater	Northern Cape	/api/logos/163.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-27.7541260	24.8212270	1	0	200.00	0	200	\N	\N	50	\N	\N	hartswater_golf_club_163	$2b$08$SqegtcBuOGUS1/dUk8K0Iuuu95iqxJ8HVgdtaFy07jnkg0pcSg67K	\N	\N	\N	\N
166	Heidelberg Golf Course	Heidelberg	Gauteng	/api/logos/166.png	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.5059970	28.3742950	1	0	200.00	0	200	\N	\N	50	\N	\N	heidelberg_golf_course_166	$2b$08$WxgSBvVvItv4aOJLVl6Z1uPzDjKrsSXPiq/U8GeeNW4CmGh2xzJZK	\N	\N	\N	\N
169	Hermanus Golf Club ~ East	Hermanus	Western Cape	/api/logos/169.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.4105400	19.2564260	1	0	200.00	0	200	\N	\N	50	\N	\N	hermanus_golf_club_east_169	$2b$08$uOs8ED5viRl8RcslbxJsFeeRXeG8NxgPtLsNUmacaf9WIwqNbiAC6	\N	\N	\N	\N
497	World of Golf Wedge & Putt Course	Johannesburg	Gauteng	/api/logos/497.png	9	\N	["Pro Shop", "Club Hire"]	1	1	2026-05-20 18:27:16	-26.0429430	28.0932390	1	1	250.00	0	200	\N	\N	50	\N	\N	world_of_golf_wedge_putt__497	$2b$08$HXxriFW/eH2DVpZwB7gWaOvJTIrBQi0mAatMvTG1fwSgav2x2EXwm	\N	011 545 8600	\N	\N
498	Xamarin Golf and Country Club	Lamberts Bay	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-32.0865730	18.3670160	0	0	\N	0	200	\N	\N	50	https://www.xamarin.co.za/	\N	xamarin_golf_and_country__498	$2b$08$I71jDzJFcJ8FV.6AG14DxO9sdAF6CinAv2YZQY95Ln4qcZ8ieCT6m	\N	\N	\N	\N
499	Zastron Golf Club	Zastron	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-30.3078030	27.1030350	1	0	200.00	0	200	\N	\N	50	\N	\N	zastron_golf_club_499	$2b$08$9u78prvdvML3OvuRAvFLAe.rDTsTAI.i1MMZNGNBmq.XbHeutyOhq	\N	082 564 3405	\N	\N
500	Zebediela Country Club	Zebediela	Limpopo	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-24.2887540	29.3016100	1	1	250.00	0	200	\N	\N	50	\N	\N	zebediela_country_club_500	$2b$08$EBj9rCKC7YQqwNnZOeMdvOwUc74DhUAAzn5xIq7LBR4khgCBg/Khu	\N	\N	\N	\N
501	Zebula Golf Estate & Spa	Mabula	Limpopo	/api/logos/501.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-24.7491230	27.9601550	0	0	\N	0	200	\N	\N	50	https://zebulagolfestate.co.za/	\N	zebula_golf_estate_spa_501	$2b$08$Ylh.u45LyJyjjb63Q93H3Oel/5YQSKqOoxSKpqaHRaduta9LR8enS	\N	014 734 7708	\N	\N
502	Zeerust Country Club	Zeerust	North West	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-25.5499290	26.0698910	1	0	200.00	0	200	\N	\N	50	\N	\N	zeerust_country_club_502	$2b$08$39fRRa.e6unbE33wX9KuqutPGywlHwB.DTkK/aVLTLzUPN7t0j1ui	\N	\N	\N	\N
503	Zimbali Country Club	Ballito	KwaZulu-Natal	/api/logos/503.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-29.5476440	31.1976430	1	1	250.00	0	200	\N	\N	50	https://zimbali.com/contact/	\N	zimbali_country_club_503	$2b$08$9MvHdKdyE1DSStJI8RMKHOzWF04vDsVNQuVA5iFqFaKb/ac8F/qu.	\N	032 538 1041	\N	\N
504	Zimbali Lakes Resort	Ballito	KwaZulu-Natal	/api/logos/504.svg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-29.5502100	31.1845260	0	0	\N	0	200	\N	\N	50	https://zimbalilakes.co.za/contact-us/	\N	zimbali_lakes_resort_504	$2b$08$RoBndbUZki8ojdZoFhIh8.I4GFzBx5Dq7cB6Zrp1jDd7qlTbIbVSm	\N	087 095 2742	\N	\N
505	Zwartenbosch Golf & Lifestyle Estate	Humansdorp	Eastern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-33.9902010	24.7514160	1	0	200.00	0	200	\N	\N	50	\N	\N	zwartenbosch_golf_lifesty_505	$2b$08$Yg6FwpmY23fLXmHLZqni8e8lNe0zTNRGMqq.ZkXxNSQ8z9VRNfgSO	\N	042 291 0569	\N	\N
506	Zwartkop Country Club	Pretoria	Gauteng	/api/logos/506.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-25.8301900	28.1605880	1	1	250.00	0	200	\N	\N	50	https://www.zwartkopcountryclub.co.za/	\N	zwartkop_country_club_506	$2b$08$L9G.FhC68faE.et4p/1PIexhW.pyK6wKzRAoL76fv4XGfu31gC2e6	\N	012 654 1144	\N	\N
172	Heron Banks Golf Course	Sasolburg	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.7513470	27.8452970	1	0	200.00	0	200	\N	\N	50	\N	\N	heron_banks_golf_course_172	$2b$08$w3B3qzgueHHyWPym.QLxPudwxPxwXnllS839kl8Ts.T2Y8K5swrNq	\N	\N	\N	\N
175	Hillside Golf Club	Pretoria	Gauteng	/api/logos/175.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.6785040	28.1526800	1	0	200.00	0	200	\N	\N	50	\N	\N	hillside_golf_club_175	$2b$08$DO6YSNRR5ks.Z8XrNPWSYezVjYkZRM0WHf2T54UQt28uT81Ujeu0K	\N	\N	\N	\N
179	Hotazel Golf Club	Hotazel	Northern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-27.2005530	22.9533860	1	1	250.00	0	200	\N	\N	50	\N	\N	hotazel_golf_club_179	$2b$08$FOtZaZ9ffCLZlV1HiXPbjOazJzXhit0rh9XPs3MJwuYhK0thVHIcq	\N	053 830 6247	\N	\N
180	Houghton Golf Club	Houghton	Gauteng	/api/logos/180.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.1642950	28.0697870	0	0	\N	0	200	\N	\N	50	https://www.houghton.co.za/	\N	houghton_golf_club_180	$2b$08$fmRldJ4Veb3Hn/rC3QbnJ.Gkms1K/kAvJQvFd3C7Mi6.L19w5I3FC	\N	+27114833072	\N	\N
182	Huddle Park Golf Club ~ Championship Blue Course	Linksfield	Gauteng	/api/logos/182.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.1558690	28.1195740	1	1	250.00	0	200	\N	\N	50	http://huddlepark.com/	\N	huddle_park_golf_club_cha_182	$2b$08$7DDAZyWvBSAqDWInGkSROeH6/KYRY3Mpen0RVoHgVwlSrV2PvfQ7u	\N	061 536 0895	\N	\N
187	Indiwe Golf Club	Indiwe	Eastern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-31.4724610	27.3372030	1	0	200.00	0	200	\N	\N	50	\N	\N	indiwe_golf_club_187	$2b$08$olMnm7EZhIjCaAdarpaW3u30bImNrjKH/zfRZjMtfxsBwFSNSXXDO	\N	\N	\N	\N
190	Jackal Creek Golf Estate	Northriding	Gauteng	/api/logos/190.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.0572250	27.9263360	1	0	200.00	0	200	\N	\N	50	https://jackalcreek.co.za/contact-us/	\N	jackal_creek_golf_estate_190	$2b$08$tr71DCsCmQmJxr9EQ5SQKO4iIc5FiNLKGHXXIAYGK.zNttHFCLlsK	\N	010 880 3999	\N	\N
193	Jan Kempdorp Golf Club	Jan Kempdorp	Northern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-27.9125920	24.8523950	1	0	200.00	0	200	\N	\N	50	\N	\N	jan_kempdorp_golf_club_193	$2b$08$YVWtwHNhQhGkMFSHKgUcKex7lf9mjbJ1qwH3YYDlfMZ0exMYDMKFm	\N	\N	\N	\N
196	Jeffreys Bay Golf Club ~ Par 3	Jeffreys Bay	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-34.0394370	24.9145930	1	0	200.00	0	200	\N	\N	50	\N	\N	jeffreys_bay_golf_club_pa_196	$2b$08$gpaPWt4Uu/X8uV5KwWu5aupFQzNCEv61aRIG15mPIXxA9SA1.BnV2	\N	+27422932532	\N	\N
199	Johannesburg Country Club ~ Rocklands	Auckland Park	Gauteng	/api/logos/199.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-26.0501640	28.0806910	1	0	200.00	0	200	\N	\N	50	\N	\N	johannesburg_country_club_199	$2b$08$of4LY./SO1qVlJ4pNywe6evn461TQHTOtw7e5.5z.Wmxkjl195cyi	\N	+27 11 202 1600	\N	\N
203	Kameeldoring Country Club	Mokopane	Limpopo	/api/logos/203.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-24.2110560	28.9893790	1	1	250.00	0	200	\N	\N	50	\N	\N	kameeldoring_country_club_203	$2b$08$j6HkzNsFiPdKdsc93ZnXXOrjy5AvhRe2b09glonAw06qqktQ7jE42	\N	066 287 2250	\N	\N
206	Keimoes Golf Club	Keimoes	Northern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.6925270	20.9702260	1	1	250.00	0	200	\N	\N	50	\N	\N	keimoes_golf_club_206	$2b$08$VpVOWZflysJrPl4.o5s4YuD1MJ.bvqOnp3kSjy2YzjkBzbPTBXAcq	\N	\N	\N	\N
209	Kilbarchan Golf Course	Newcastle	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-27.8412020	29.9695000	1	1	250.00	0	200	\N	\N	50	\N	\N	kilbarchan_golf_course_209	$2b$08$i9SHmPyHRZ4nmA3FjwN0IumC3FAVTl7boeSc68a9FF0Uya3vyo27a	\N	034 310 6690	\N	\N
211	Kimberley Golf Club	Kimberley	Northern Cape	/api/logos/211.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-28.6937900	24.7756140	1	0	200.00	0	200	\N	\N	50	https://www.kimberleygc.co.za/contact-6	\N	kimberley_golf_club_211	$2b$08$/GzSaJP/v2iLbIUt6nCkyuXwNAjnro/NRfHaVFPTUW5B87PUUsMZK	\N	053 841 0179	\N	\N
215	Kingswood Golf Estate	George	Western Cape	/api/logos/215.webp	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.9706530	22.4335630	1	1	250.00	0	200	\N	\N	50	https://www.kingswood.co.za/directory/	\N	kingswood_golf_estate_215	$2b$08$OxhCJXcNvDA3qZHXejTBDOcVMFcxMUHH.DFkZbS0R5MypDxWtI3hu	\N	+27 44 861 7271	\N	\N
219	Kleinzee Golf Course	Kleinzee	Northern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.6779530	17.0594690	0	0	\N	0	200	\N	\N	50	\N	\N	kleinzee_golf_course_219	$2b$08$JnD9Kl1Sr2TVHL4dQw7O9OKLKrJ/mGs3VAqDWX/qU0dI9bIENkgFe	\N	027 877 0530	\N	\N
221	Kloof Country Club	Kloof	KwaZulu-Natal	/api/logos/221.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-29.7958870	30.8243750	1	1	250.00	0	200	\N	\N	50	https://kloofcc.co.za/	\N	kloof_country_club_221	$2b$08$v4FVd8yDX5QbLDVFU1zD0ORPTyto88CWgoC6Xq08Q6CGAfuDkwCoC	\N	0463496522	\N	\N
224	Kokstad Golf Club	Kokstad	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-30.5421340	29.4079580	1	1	250.00	0	200	\N	\N	50	\N	\N	kokstad_golf_club_224	$2b$08$xCQ58hZ.WKH3HiSzTP1hdO9QxMRDrETnFepD99MiHKceXczVrqCZG	\N	\N	\N	\N
227	Koster Golf Course	Koster	North West	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.8724810	26.8952820	1	1	250.00	0	200	\N	\N	50	\N	\N	koster_golf_course_227	$2b$08$5X1IJHtxaAtPdaJmqN6/lOYyfbQVku5A9uwnJNJMHDrx0IQYaJDCC	\N	082 340 3300	\N	\N
231	Kroonstad Correctional Services Golf Course	Kroonstad	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-27.6243930	27.2330470	0	0	\N	0	200	\N	\N	50	\N	\N	kroonstad_correctional_se_231	$2b$08$qnBkx4fgWdg8a3uW.3kqQ.h751OQT.4fLaQLO9xmXKg13rwZrKB0m	\N	\N	\N	\N
233	Kruger Park Lodge Golf Course	Hazyview	Mpumalanga	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-25.0339530	31.1413070	1	1	250.00	0	200	\N	\N	50	\N	\N	kruger_park_lodge_golf_co_233	$2b$08$GxO7Q5AKdA133wbIZt3rdelLl8kFdVK1ZTLfg1c2PtE7/6xqz9Gu2	\N	\N	\N	\N
235	Kuils River Golf Club	Kuils River	Western Cape	/api/logos/235.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.9023920	18.7097380	1	0	200.00	0	200	\N	\N	50	https://www.kuilsriviergolfclub.co.za/contact-us/	\N	kuils_river_golf_club_235	$2b$08$NYHE035upO7qcJRI8CzLO.pt5yp3BofDyQrFxD5czjk8tAXLYUKk2	\N	0219030222	\N	\N
240	Lady Grey Golf Club	Lady Grey	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-30.7078810	27.2097020	0	0	\N	0	200	\N	\N	50	\N	\N	lady_grey_golf_club_240	$2b$08$qYU1CPR80To/edx9T1Mzhe1cVUB6fyBnNgR2V1raVKf7WL7jKCdRq	\N	+27516030421	\N	\N
243	Lamberts Bay Golf Club	Lamberts Bay	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-32.0990860	18.3260250	0	0	\N	0	200	\N	\N	50	\N	\N	lamberts_bay_golf_club_243	$2b$08$Jal5oVkhRVq/w/cjrijV9.z7bWSVJktiwMnDm8QuQ3nBOEGJef6UC	\N	027 432 1000	\N	\N
246	Langebaan Country Estate Golf	Langebaan	Western Cape	/api/logos/246.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-33.0744400	18.0542260	0	0	\N	0	200	\N	\N	50	https://langebaanestate.co.za/contact-us/	\N	langebaan_country_estate__246	$2b$08$ayDXd5dAB2F.qAFRMxppaO4TUpyHQ86chCuAsvUFBjBw3/jeH/4BG	\N	\N	\N	\N
249	Leeudoringstad Golf Course	Leeudoringstad	North West	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:14	-27.2359230	26.2405440	0	0	\N	0	200	\N	\N	50	\N	\N	leeudoringstad_golf_cours_249	$2b$08$wAjfKY.yDKTt.cZolc/UvOmfrIwhJJwGWZz75/8nyNR8uX1Pwh0d6	\N	0539554111	\N	\N
252	Leopard Creek Country Club	Malelane	Mpumalanga	/api/logos/252.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.4417480	31.5344590	0	0	\N	0	200	\N	\N	50	https://leopardcreek.co.za/	\N	leopard_creek_country_clu_252	$2b$08$oiWZLXdP.qUfn55WKV6JY.gW1CqbALXspL7T/R.BfqrCzM1MIkp6O	\N	+27 13 791 2000	\N	\N
256	Lime Acres Golf Course	Lime Acres	Northern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-28.3737500	23.4581280	1	0	200.00	0	200	\N	\N	50	\N	\N	lime_acres_golf_course_256	$2b$08$UZmqaYL7spc5JOXNUmPvtuDVSZOWQhtPgcEsRz1HvZOCSWDUb2OD2	\N	0545039785	\N	\N
259	Lost City Golf Course	Pilansberg	North West	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.3393220	27.0903750	1	0	200.00	0	200	\N	\N	50	\N	\N	lost_city_golf_course_259	$2b$08$78tI4orCtdisixpQ5b03bO7E1VgviJ918hRAIlWmtfMF42PvgjJQq	\N	\N	\N	\N
260	Lutzville Golf Club	Lutzville	Western Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-31.5615350	18.3458480	1	1	250.00	0	200	\N	\N	50	\N	\N	lutzville_golf_club_260	$2b$08$l1vPyiVliVhbk6oZAYNoY.j1RU0H14tCOjfneCzIPXAdSDeMq4U82	\N	\N	\N	\N
262	Maccauvlei Golf Club	Vereeniging	Free State	/api/logos/262.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.6842920	27.9396980	1	0	200.00	0	200	\N	\N	50	https://maccauvleigolfclub.co.za/contact/	\N	maccauvlei_golf_club_262	$2b$08$ACRTcTUXzjpz9mrb40kkzOmHbH6Iqr1erqmy33Q0CdEY1iDZ1Nh6.	\N	+27164213196	\N	\N
265	Magersfontein Memorial Golf Course	Modder River	Northern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.0235640	24.6511360	1	0	200.00	0	200	\N	\N	50	\N	\N	magersfontein_memorial_go_265	$2b$08$KaBoj5e0ain58J0liSWov.YFBk8zoSOEpGpTuHbsLN/9RqLjTMgfe	\N	\N	\N	\N
269	Mandini Golf Club	Mandini	KwaZulu-Natal	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.1617270	31.4111140	1	1	250.00	0	200	\N	\N	50	\N	\N	mandini_golf_club_269	$2b$08$Mxix3U2cLQzhghkAYBNcv.DvRayTO6Y2JzrqGe7eIIsAboBwwlM7m	\N	\N	\N	\N
271	Margate Country Club	Margate	KwaZulu-Natal	/api/logos/271.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-30.8383870	30.3643660	1	0	200.00	0	200	\N	\N	50	https://www.margatecountryclub.co.za/	\N	margate_country_club_271	$2b$08$miI3x10.OdLZ1B8qLopJ5.BmiqO5xti8HKUnBN9TvWvPnrXeyDo06	\N	039 312 0571	\N	\N
275	Melmoth Golf Club	Melmoth	KwaZulu-Natal	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-28.5883570	31.3904290	1	1	250.00	0	200	\N	\N	50	\N	\N	melmoth_golf_club_275	$2b$08$dC2ATrBzQenrshllyStFPOKFb5onm7t0In6RfQfPQzq4JoyGTZz2m	\N	\N	\N	\N
277	Metropolitan Golf Club	Mouille Point	Western Cape	/api/logos/277.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.9004610	18.4083440	1	0	200.00	0	200	\N	\N	50	https://metropolitangolfclub.co.za/	\N	metropolitan_golf_club_277	$2b$08$GN6NVF9pU.0WCq4clLr/9OWyXq/9bKXFiks/pgh6pHqVEY8FmtxH6	\N	021 430 6011	\N	\N
281	Millvale Golf Course	Kosterdam	North West	/api/logos/281.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.6932910	26.9109490	1	1	250.00	0	200	\N	\N	50	https://golfcentral.co.za/directory/golf-courses/north-west/millvale-golf-estate/	\N	millvale_golf_course_281	$2b$08$kURsUCJGJaBEbLeuorVUperGfrhE1CHLs/5Cx77nFS8t1FdxwIZcm	\N	\N	\N	\N
286	Molteno Golf Course	Molteno	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-31.3991190	26.3494630	1	0	200.00	0	200	\N	\N	50	\N	\N	molteno_golf_course_286	$2b$08$g6cFKzIa9OqlyG0E8dLCRO6erk.TMTHNXAbSHozNloyhB8AgLXPHG	\N	\N	\N	\N
288	Montagu Golf Club	Montagu	Western Cape	/api/logos/288.ico	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.7700630	20.1313300	0	0	\N	0	200	\N	\N	50	https://www.montagugolfclub.co.za/contact-us/	\N	montagu_golf_club_288	$2b$08$2KnwYBcCo.7VDwSnA4r3M.DzUWF2saZsZifVRifnUvtHhsWdS63UK	\N	023 614 1860	\N	\N
292	Mooipoort Golf Club	Pretoria	Gauteng	/api/logos/292.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.6479750	28.3186360	1	0	200.00	0	200	\N	\N	50	https://mooipoortgolfclub.co.za/	\N	mooipoort_golf_club_292	$2b$08$7ito7h9N5pCLbzgQzVZGZO7CbxaJ6p0FkjP5KjSV1J.7Bb/S0k5uW	\N	\N	\N	\N
296	Mount Edgecombe Country Club ~ The Lakes (Course Two)	Mount Edgecombe	KwaZulu-Natal	/api/logos/296.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.7154820	31.0455700	1	1	250.00	0	200	\N	\N	50	\N	\N	mount_edgecombe_country_c_296	$2b$08$9d623u/x6CV07cYwHjPBWOg/Y97mVcmFVGmg8UxhXwaArhdDyUBK2	\N	\N	\N	\N
299	Mtunzini Country Club	Mtunzini	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-28.9447640	31.7603930	1	1	250.00	0	200	\N	\N	50	\N	\N	mtunzini_country_club_299	$2b$08$A1c7KTZMI4FThZZmTyOkp.eporClK3.2gkqL4TY.hgMXRZchjoWlq	\N	\N	\N	\N
300	Mupine Golf Club	Cape Town	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.9223580	18.5183320	0	0	\N	0	200	\N	\N	50	\N	\N	mupine_golf_club_300	$2b$08$ohq3bPnvSvUicqSA4dKJWuCd6OYC2aouuIdVJmTyCm7nW8Vi06GC.	\N	\N	\N	\N
302	Nelspruit Golf Club	Nelspruit	Mpumalanga	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.4838610	30.9957150	1	1	250.00	0	200	\N	\N	50	\N	\N	nelspruit_golf_club_302	$2b$08$D8deJiabB1tjZRnP0Af23eHXK8Q8cc4u5pNNBJZhgLJvD.pyqmQJ.	\N	082 333 2866	\N	\N
305	Noodsberg Country Club	Dalton	KwaZulu-Natal	/api/logos/305.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.3495010	30.6897620	1	1	250.00	0	200	\N	\N	50	https://www.noodsbergcountryclub.co.za/pages/contact	\N	noodsberg_country_club_305	$2b$08$AUDIkhqVzclV66htY8CZieWSZj/0.k7bc7CNUJ5xAXslakEamLn5y	\N	033 502 9573	\N	\N
308	Olivewood Golf Estate	East London	Eastern Cape	/api/logos/308.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-32.8393060	28.0872810	1	1	250.00	0	200	\N	\N	50	https://olivewoodestate.com/contact/	\N	olivewood_golf_estate_308	$2b$08$FmWuQtAxgzars0ywYf2q5e6niE9v9z04x2EFmMZoWHuYdiadq9JPi	\N	087 350 4310	\N	\N
313	Oubaai Golf Club	George	Western Cape	/api/logos/313.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.0461010	22.4086120	1	0	200.00	0	200	\N	\N	50	https://www.oubaaigolfclub.com/	\N	oubaai_golf_club_313	$2b$08$cPnuRMH2g5/b9MiNnrUhduy5Z.dyUCt0wsnbyjVf.t23FapdJx7om	\N	+27 44 851 1263	\N	\N
315	Paarl Golf Club ~ Boschenmeer	Paarl	Western Cape	/api/logos/315.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.7615850	18.9810430	0	0	\N	0	200	\N	\N	50	https://paarlgolfclub.co.za/contact-us/	\N	paarl_golf_club_boschenme_315	$2b$08$MAF6QP7OIhxc6kVxEhcPYOm0l/cv/gJd7cSYKx1jCMDJjGsy3cnWq	\N	+27218631140	\N	\N
319	Parkview Golf Club	Parkview	Gauteng	/api/logos/319.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.1564240	28.0229550	1	0	200.00	0	200	\N	\N	50	\N	\N	parkview_golf_club_319	$2b$08$4yaFlptIAzD11wSl4m5kdewbTjv59nJ2WOgGjokVTQ/HS.rNz6Vk6	\N	\N	\N	\N
322	Paulpietersburg Country Club	Paulpietersburg	KwaZulu-Natal	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-27.4287310	30.8222230	1	0	200.00	0	200	\N	\N	50	\N	\N	paulpietersburg_country_c_322	$2b$08$ZHSzkh7E6V46RKHglKm5vOpLiuFIGEXK7yZGeBcwOOezDo.MCP7eO	\N	\N	\N	\N
325	Pecanwood Golf & Country Club	Hartebeespoort	North West	/api/logos/325.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.7716300	27.8534750	1	0	200.00	0	200	\N	\N	50	https://pecanwood.co.za/golf-club/	\N	pecanwood_golf_country_cl_325	$2b$08$f5gihMMx86FXxju8GAcCjeHMPlKXncsZZjwNCRj.WpBWOP.T9oPNe	\N	012 244 8080	\N	\N
329	Piet Retief Country Club	Piet Retief	Mpumalanga	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-27.0109610	30.7996770	1	1	250.00	0	200	\N	\N	50	\N	\N	piet_retief_country_club_329	$2b$08$AhHyR7TIMhJ6bxe0/r9bl.5.aCA3aMOKpGst/Kj3PgXNXs9hwppQW	\N	\N	\N	\N
332	Pinnacle Point Golf Club	Mossel Bay	Western Cape	/api/logos/332.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.1955300	22.0907970	1	1	250.00	0	200	\N	\N	50	https://pinnaclepointestate.co.za/golf-club/	\N	pinnacle_point_golf_club_332	$2b$08$KRz4SJYv0nkSBoYL547Um.PnQXp3DqCpAFlES.P.B0o6QSN5IDETW	\N	044 606 5300	\N	\N
336	Pongola Golf Club	Pongola	KwaZulu-Natal	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-27.3759560	31.6174510	0	0	\N	0	200	\N	\N	50	\N	\N	pongola_golf_club_336	$2b$08$fpujSnSkB0lbOnT2XBSDs.kWHDDXFTWjVyXACOYJl8VEvD.dAI.rW	\N	\N	\N	\N
338	Port Elizabeth Golf Club	Port Elizabeth	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.9577250	25.5884520	1	1	250.00	0	200	\N	\N	50	\N	\N	port_elizabeth_golf_club_338	$2b$08$K3fD0eRTHBn2lEJUgOYuR.Mg8/TQay8/bYsMd0aWpshScv0ShqTKq	\N	\N	\N	\N
339	Port Saint Johns Golf Club	Port St Johns	Eastern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-31.6305180	29.5448970	0	0	\N	0	200	\N	\N	50	\N	\N	port_saint_johns_golf_clu_339	$2b$08$cz/8tQzxy7FRZs2hlvowJOd01ydu9XsB5l4fyxLnk3/QbIh6zr.pO	\N	\N	\N	\N
341	Porterville Golf Club	Porterville	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.0056900	19.0072940	1	1	250.00	0	200	\N	\N	50	\N	\N	porterville_golf_club_341	$2b$08$MgSnP0sxFCd.2VPdaW5QMu3HtERpGNeOXYtBTsV/nswQdnIurN1hi	\N	\N	\N	\N
344	Pretoria Golf Club	Pretoria	Gauteng	/api/logos/344.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.7389070	28.1417370	1	1	250.00	0	200	\N	\N	50	https://pretoriagolfclub.co.za/	\N	pretoria_golf_club_344	$2b$08$lu0o8A1d1ymBb5i2CgcJbeCR4eo0BeRw4nKUaT1XQtmPWKxgXKIrC	\N	012 386 6836	\N	\N
347	Prince's Grant Coastal Golf Estate	Stanger	KwaZulu-Natal	/api/logos/347.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.3368940	31.3669840	1	1	250.00	0	200	\N	\N	50	https://www.princesgrant.co.za/	\N	prince_s_grant_coastal_go_347	$2b$08$Pu96AqYgZT0i.eH1ExsWFOeVB1sDZoFsA48JHZKBhwew7.PXWbsYm	\N	\N	\N	\N
377	Sakabula Golf Club	Howick	KwaZulu-Natal	/api/logos/377.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.5302630	30.2288820	1	1	250.00	0	200	\N	\N	50	\N	\N	sakabula_golf_club_377	$2b$08$mjpb2XSb69tO/ZDukgMq1uPQGaIyeVP/.RSBXBDyszAfC.6ExHENe	\N	033 330 6751	\N	\N
389	Seasons Eco Golf Estate	Brits	North West	/api/logos/389.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.7015920	27.8498270	1	1	250.00	0	200	\N	\N	50	https://www.seasonsestate.co.za/golf.html	\N	seasons_eco_golf_estate_389	$2b$08$B12s8iPk3iDK6y.IT0LAQ.dIFXxNRCcHbUdIxCxbX03RV2/uQfaaC	\N	012 012 6068	\N	\N
415	St. Cathryn's Golf Estate	Kranskop	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-28.9807370	30.8163250	1	0	200.00	0	200	\N	\N	50	\N	\N	st_cathryn_s_golf_estate_415	$2b$08$hbfekL8czDrr5WIRv2BHp.pBJXewQXsq1t6Qu08M9hSUXW3cmulBC	\N	\N	\N	\N
416	St. Francis Links	St. Francis Bay	Eastern Cape	/api/logos/416.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.1624110	24.8151500	1	1	250.00	0	200	\N	\N	50	https://stfrancislinks.com/contact-us/	\N	st_francis_links_416	$2b$08$SbVCIZ0lpvpQFWaEHOkEFOsoWmAPJ7HI.2us7l6GOZL2BV9w46W9a	\N	042 294 0467	\N	\N
419	Steenberg Golf Club	Tokai	Western Cape	/api/logos/419.ico	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.0694620	18.4268620	1	1	250.00	0	200	\N	\N	50	https://www.steenberggolfclub.co.za/contact	\N	steenberg_golf_club_419	$2b$08$aMrbHoDYD4axY7fSToObXOoHC7AvkDDWZOrEtwnmXgjNLL2mlWoc.	\N	+27217132233	\N	\N
424	Stilfontein Golf Course	Stilfontein	North West	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.8250510	26.8232270	1	0	200.00	0	200	\N	\N	50	\N	\N	stilfontein_golf_course_424	$2b$08$9AkI4EA7Xg9HrTA01eorxO58uvOmZ4Pen/JjWzQLC2I9m7Ez9v6Zm	\N	0882203641	\N	\N
427	Sun Valley Golf Course	Eikenhof	Gauteng	/api/logos/427.jpg	18	\N	["Pro Shop", "Club Hire"]	1	1	2026-05-20 18:27:15	-26.4203010	28.0231420	1	0	200.00	0	200	\N	\N	50	\N	\N	sun_valley_golf_course_427	$2b$08$2Jr/70oeZ0CoMdSTCCheEepon6nXAzo2Yi9e/TDPi8CX4sjBXYLDG	\N	071 874 7973	\N	\N
475	Walmer Golf Club	Port Elizabeth	Eastern Cape	/api/logos/475.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-33.9749720	25.5767930	1	0	200.00	0	200	\N	\N	50	https://walmergolfestate.co.za/	\N	walmer_golf_club_475	$2b$08$ZlBeGqwskBfGK.8uolqlCOmzq3kADZeitCWc79JKOaluRFZ8N6K5K	\N	+27 41 581 1613	\N	\N
351	Randpark Golf Club ~ Firethorn Course	Randburg	Gauteng	/api/logos/351.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.1147380	27.9658250	0	0	\N	0	200	\N	\N	50	https://randpark.co.za/visitor-information/	\N	randpark_golf_club_fireth_351	$2b$08$WohwLf8SimrtAhvAx2UXWOLcarNcrEMEkw6R.Qh7ZCr8AkCL4ezYy	\N	011 215 8600	\N	\N
355	Richards Bay Country Club	Richards Bay	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-28.7672070	32.1101190	1	0	200.00	0	200	\N	\N	50	\N	\N	richards_bay_country_club_355	$2b$08$yA70MwQVFfpT8hfIXf25I.kkF43LH80WkTIjEVDN4Jqi17kXPHarW	\N	\N	\N	\N
358	Riversdale Golf Club	Riversdale	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.1118620	21.2811400	1	0	200.00	0	200	\N	\N	50	\N	\N	riversdale_golf_club_358	$2b$08$rOhBAimN5Vyh.T8..P16O.oqp7zOcGOcK1RfnJGFVgoUjjf/QkG7m	\N	\N	\N	\N
361	Riviersonderend Golf Club	Riviersonderend	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.1373090	19.9216430	1	0	200.00	0	200	\N	\N	50	\N	\N	riviersonderend_golf_club_361	$2b$08$npDQFOU.LnglQDx6qZE8P.oq36DLJ2xNDJkXEIxqzejjG2Zj7lcWi	\N	\N	\N	\N
363	Rondebosch Golf Club	Mowbray	Western Cape	/api/logos/363.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.9561260	18.4937870	0	0	\N	0	200	\N	\N	50	https://rondeboschgolfclub.com/	\N	rondebosch_golf_club_363	$2b$08$j26jzXgT/oINk7ryLsGG/eDPZ.drUlrkizh8NwlCg8jlb7E3oWKqu	\N	021 689 4176	\N	\N
393	Serengeti Golf & Wildlife Estate ~ Signature Course	Ekurhuleni	Gauteng	/api/logos/393.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.0415570	28.2898850	0	0	\N	0	200	\N	\N	50	\N	\N	serengeti_golf_wildlife_e_393	$2b$08$3dlAoQCKOoKrKdu73zVvpe2DGKZ97iutT9dTk31csliEd0Ws9E2YO	\N	+27 11 552 7200	\N	\N
397	Shark River Golf Club	Port Elizabeth	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.9849170	25.6254970	1	0	200.00	0	200	\N	\N	50	\N	\N	shark_river_golf_club_397	$2b$08$7WFp0LRn5IdqgPMVkttQJOrSA70sQcokf4qobGX.sCQp.8X31LVni	\N	041 581 6188	\N	\N
400	Simbithi Country Club	Ballito	KwaZulu-Natal	/api/logos/400.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.5111840	31.2255190	1	0	200.00	0	200	\N	\N	50	https://www.simbithi.com/	\N	simbithi_country_club_400	$2b$08$cNFr3Vc6rWh4rEWe9QMHOu8sjaVuY34w9KrQjURDRhweKqpbhm1l.	\N	073 156 1378	\N	\N
446	Tweefontein Golf Club	Coalville	Mpumalanga	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.0260320	29.1730360	1	1	250.00	0	200	\N	\N	50	\N	\N	tweefontein_golf_club_446	$2b$08$baPSq54D9lrq/aQB67da4uXRPJmkG3mM4vzGnsTAPzRMoVNR.BRWy	\N	\N	\N	\N
449	Ulco Golf Course	Ulco	Northern Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-28.3313450	24.2251120	1	1	250.00	0	200	\N	\N	50	\N	\N	ulco_golf_course_449	$2b$08$Y0l5HKBIcw9GCOfXAbr80.J0ftY7F2vFqWTI4SZrhf8wudeDjhmwW	\N	\N	\N	\N
451	Umfolozi Golf Club	Mtubatuba	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-28.4406020	32.1761260	1	0	200.00	0	200	\N	\N	50	\N	\N	umfolozi_golf_club_451	$2b$08$AGCcJZPQjWONP7eKxE0FBOzQRFKJfoX3g8Q9gwHYlpQbx3QaP0ZXi	\N	082 965 6906	\N	\N
454	Underberg Country Club	Underberg	KwaZulu-Natal	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-29.7884410	29.4930320	1	0	200.00	0	200	\N	\N	50	\N	\N	underberg_country_club_454	$2b$08$DRj4qXXRxmmrcPNoOXizjOu16nVScQV1qLPmlFkn9AKUVtJ4rwamm	\N	\N	\N	\N
455	Uniondale Golf Club	Uniondale	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-33.6550690	23.1407030	1	1	250.00	0	200	\N	\N	50	\N	\N	uniondale_golf_club_455	$2b$08$ntzYMRprUHnLmrzfRLVj3e5DKRtbHjE08C9pRHsQpASd0/AGnB9Wu	\N	\N	\N	\N
456	University of the North Golf Club	Sovenga	Limpopo	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-23.8949890	29.7388540	0	0	\N	0	200	\N	\N	50	\N	\N	university_of_the_north_g_456	$2b$08$.PPUM/DsKpn6LOwCFHa71OF4jLi/xinpkouTfTR7ItjlCTpNMW5bq	\N	\N	\N	\N
459	Vaal de Grace Golf Estate	Parys	Free State	/api/logos/459.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-26.9255310	27.4180680	0	0	\N	0	200	\N	\N	50	https://vaaldegrace.com/golf/	\N	vaal_de_grace_golf_estate_459	$2b$08$kDUu85S7ylUgHOT3U0b0suMimaQ.3Zb3zi2qoI6xkXz6hUFEuLYti	\N	+27568163080	\N	\N
461	Victoria Country Club	Pietermaritzburg	KwaZulu-Natal	/api/logos/461.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-29.5762900	30.3341960	1	1	250.00	0	200	\N	\N	50	https://www.victoria.co.za/contact-us	\N	victoria_country_club_461	$2b$08$2.SlIe2WVSzls//dpFpGUew5I1SYLc3JGOUebkB93sV80KNLnC5R.	\N	033 347 1942	\N	\N
466	Vrede Golf Club	Vrede	Free State	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-27.4383800	29.1694300	1	0	200.00	0	200	\N	\N	50	\N	\N	vrede_golf_club_466	$2b$08$tWxq7XTnrtYTbn5Nu7GbwOeBQh97bdpFRhvCq8Zozy09ktSpwC7Qa	\N	\N	\N	\N
469	Vryburg Golf Club	Vryburg	North West	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-26.9639900	24.7262330	1	0	200.00	0	200	\N	\N	50	\N	\N	vryburg_golf_club_469	$2b$08$lsA7J7RGr8FwMnYoPqey..5zuFs/ZOq5gH2YIeOR7aUzY5VEblntW	\N	018 264 3181	\N	\N
366	Royal Cape Golf Club	Wynberg	Western Cape	/api/logos/366.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.0134980	18.4850510	0	0	\N	0	200	\N	\N	50	\N	\N	royal_cape_golf_club_366	$2b$08$r.PWlPhdnA6hKG9efYtotOOafgZkt1qUw9j7PrWZTKNgK4elSfeT6	Established in 1885, Royal Cape is the oldest golf club in Africa. This historic parkland course in Wynberg blends colonial heritage with championship-grade golf, attracting players from across the globe seeking a piece of golfing history.	+27 21 761 6551	\N	\N
373	Rustenburg Golf Club	Rustenburg	North West	/api/logos/373.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.6689980	27.2286920	1	0	200.00	0	200	\N	\N	50	https://www.rtbgolfclub.com/	\N	rustenburg_golf_club_373	$2b$08$Qn3Da2RtL9CwRDtT6EUM5O8WzOeyRZCu1C7t/EM4/REw0ZkW51K4.	\N	014 592 5575	\N	\N
376	Saint Francis Bay Golf Club	St Francis Bay	Eastern Cape	/api/logos/376.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.1612290	24.8199670	1	0	200.00	0	200	\N	\N	50	https://stfrancislinks.com/contact-us/	\N	saint_francis_bay_golf_cl_376	$2b$08$HuNhXuI3tSN.jkCITTS0R.amu4A/TdRAm5qLedS0VAcRMYT9KoRqK	\N	042 294 0467	\N	\N
380	Sandonia Golf Club	Pretoria	Gauteng	/api/logos/380.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.6622210	28.3321590	1	1	250.00	0	200	\N	\N	50	\N	\N	sandonia_golf_club_380	$2b$08$lADkbYZCvKBUt7dukTvRce9uJ.nnl2nkv0YUf5Wt.wLl7QnXwTfne	\N	012 808 2560	\N	\N
383	Sannieshof Golf Course	Sannieshof	North West	/api/logos/383.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.5296470	25.8047430	1	1	250.00	0	200	\N	\N	50	\N	\N	sannieshof_golf_course_383	$2b$08$rRMssY3uBf4tZzMY9oNLpe.e0XUgPCcgrzaaz9cH21nWkW5l640Sm	\N	018 683 0048	\N	\N
387	Schweizer-Reneke Golf Club	Schweizer Reineke	North West	/api/logos/387.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-27.1847200	25.3196990	0	0	\N	0	200	\N	\N	50	\N	\N	schweizer_reneke_golf_clu_387	$2b$08$Y.a2R4XfEvLjUEAE3B6H4Ooc.Jbo6BfkmhqNi/GXMgaRatcHXDuoe	\N	\N	\N	\N
404	Skills Golf Club	Cape Town	Western Cape	\N	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.8237320	18.7052700	1	1	250.00	0	200	\N	\N	50	\N	\N	skills_golf_club_404	$2b$08$5nyJxYXK2EvDYAKiO2abSOtTNDTTGq8YvwvSlI6FEuwvlxgg9OUHq	\N	\N	\N	\N
407	Somerset East Golf Club	Somerset East	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-32.7103080	25.5626910	1	1	250.00	0	200	\N	\N	50	\N	\N	somerset_east_golf_club_407	$2b$08$HzrseK2SziXl/FtAVAkyPO.6m.PTVCjXhG8KYyWEJFyFqzaMmIMUG	\N	072 785 7079	\N	\N
409	South Downs Country Club	Mayfield Park	Gauteng	/api/logos/409.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-26.3177150	28.0186570	1	0	200.00	0	200	\N	\N	50	https://www.southdownscc.co.za/	\N	south_downs_country_club_409	$2b$08$1I2uW8yaO6gPQwXvG2u2DeVmwWH/jLmUgNBN5ZrXAyMnnwJK1XXhe	\N	0119434448	\N	\N
413	Springbok Golf Club	Springbok	Northern Cape	/api/logos/413.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-29.6871270	17.9072510	1	1	250.00	0	200	\N	\N	50	\N	\N	springbok_golf_club_413	$2b$08$Fak6/kmRfSX92do9IrJJMu/0NW4OQ0YvYSEH6n1NaFVOGwiTfcnfC	\N	\N	\N	\N
430	Swellendam Golf Course	Swellendam	Western Cape	/api/logos/430.png	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.0160780	20.4329800	1	0	200.00	0	200	\N	\N	50	\N	\N	swellendam_golf_course_430	$2b$08$iFWPvMegZetRTNMV0E0S6uL6iWfkmu4Q.jja2HGcCt6UcsAOWYOhi	\N	\N	\N	\N
433	Thatchfield Golf Academy	Thatchfield	Gauteng	/api/logos/433.jpg	9	\N	["Pro Shop", "Club Hire"]	1	1	2026-05-20 18:27:15	-25.8944800	28.1213950	1	0	200.00	0	200	\N	\N	50	\N	\N	thatchfield_golf_academy_433	$2b$08$4PT5tNGsxDMpcO.6G4RkPewDS.k1tZPZMsep7EMo8iZGs1xuHfV/q	\N	072 273 6052	\N	\N
436	The Els Club Copperleaf	Centurion	Gauteng	/api/logos/436.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-25.8801630	28.0478170	1	0	200.00	0	200	\N	\N	50	\N	\N	the_els_club_copperleaf_436	$2b$08$aZhKaNScdmAWKoGX2tWmp.HUEkECyDhJD7YHaWPRPf7e0IlkrSK2i	\N	\N	\N	\N
439	The River Club	Cape Town	Western Cape	/api/logos/439.png	9	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-33.9362310	18.4756990	1	0	200.00	0	200	\N	\N	50	https://riverclub.co.za/	\N	the_river_club_439	$2b$08$Tp23j4WwKYWmfuKyPSmBJu15a.AHIAtyPVTbbFVPiNs7WcLoBPuYO	\N	021 448 6117	\N	\N
442	Theewaterskloof Country Estate Golf Course	Villiersdorp	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:15	-34.0564030	19.2887140	1	0	200.00	0	200	\N	\N	50	\N	\N	theewaterskloof_country_e_442	$2b$08$GZTyciMvbJHdagvrhe1zKui9JnODm5w2ZHu2lkgPpzphLsYSK92De	\N	+27 31 764 1492	\N	\N
471	Vulintaba Country Estate	Newcastle	KwaZulu-Natal	/api/logos/471.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-27.7757650	29.7822360	0	0	\N	0	200	\N	\N	50	https://www.vulintaba.co.za/contact/	\N	vulintaba_country_estate_471	$2b$08$PxVPXf84uMyGqKzVLEJt6One2G/I5ouu7pe5pJv3AIrIM.NJwHLhi	\N	072 620 0520	\N	\N
479	Wedgewood Golf Course	Port Elizabeth	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-33.9144160	25.3939430	1	1	250.00	0	200	\N	\N	50	\N	\N	wedgewood_golf_course_479	$2b$08$oxV0C8KLWhIuC07eYjgH0.Eu2VlbmfEvGWaTWi3czlBa2YI25vshC	\N	\N	\N	\N
482	West Bank Golf Club	East London	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-33.0378950	27.9025620	1	1	250.00	0	200	\N	\N	50	\N	\N	west_bank_golf_club_482	$2b$08$n/KIn7V5i.OiqzmxgrOx8uo94/e/UxjEGFlEPlE0FtsCR/JUILlyG	\N	0380079412	\N	\N
484	Westlake Golf Club	Cape Town	Western Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-34.0850090	18.4448750	1	0	200.00	0	200	\N	\N	50	\N	\N	westlake_golf_club_484	$2b$08$MpHXeUsefCQSQ2s80JFSu.A0yzuTR4wSIjiGfGMYLyGcZtBo582Uy	Nestled at the foot of the Constantiaberg mountains, Westlake is one of Cape Town's most scenic parkland courses. Tree-lined fairways, lightning-fast greens, and mountain backdrops make it a favourite among Western Cape golfers.	021 788 2020	\N	\N
490	Willowmore Golf Club	Willowmore	Eastern Cape	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-33.2965840	23.5023660	1	0	200.00	0	200	\N	\N	50	\N	\N	willowmore_golf_club_490	$2b$08$fVctMLGhOxKqf8PTT744K.fWkoF8vpHGp9E8XO.NEq7VnKoqzt5Fu	\N	044 923 1007	\N	\N
494	Wolmeransstad Country Club	Wolmaransstad	North West	\N	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-27.2108820	25.9837820	1	1	250.00	0	200	\N	\N	50	\N	\N	wolmeransstad_country_clu_494	$2b$08$DUw6afdXXEU2l82zHyGtWuSsiyGu1AJIoDbG1fL0zd/5v4keyEsuG	\N	\N	\N	\N
496	Worcester Golf Club	Worcester	Western Cape	/api/logos/496.jpg	18	\N	["Pro Shop", "Club Hire"]	0	1	2026-05-20 18:27:16	-33.6185050	19.4470650	1	0	200.00	0	200	\N	\N	50	https://worcestergolfclub.co.za/	\N	worcester_golf_club_496	$2b$08$iWaPzLUwp7iNVlrzjTRHneLmy/QFOEJTtalYJQSF4c1ThreSNObWC	\N	0685772991	\N	\N
\.


--
-- Data for Name: conversation_members; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.conversation_members (id, conversation_id, user_id, joined_at) FROM stdin;
1	18	2	2026-05-19 09:31:52
2	18	6	2026-05-19 09:31:52
3	19	2	2026-05-19 09:31:53
4	19	6	2026-05-19 09:31:53
5	20	2	2026-05-19 09:33:46
6	20	6	2026-05-19 09:33:46
7	20	4	2026-05-19 09:33:46
8	20	3	2026-05-19 09:33:47
9	21	6	2026-05-19 09:46:48
10	21	3	2026-05-19 09:46:48
11	22	2	2026-05-19 10:05:16
12	22	4	2026-05-19 10:05:17
13	23	2	2026-05-19 10:55:20
14	23	3	2026-05-19 10:55:21
15	24	2	2026-05-19 10:56:30
16	24	4	2026-05-19 10:56:30
17	24	6	2026-05-19 10:56:30
18	25	2	2026-05-25 13:18:30
19	25	6	2026-05-25 13:18:30
20	25	4	2026-05-25 13:18:30
21	25	3	2026-05-25 13:18:30
22	26	2	2026-05-25 13:19:21
23	26	6	2026-05-25 13:19:22
24	26	4	2026-05-25 13:19:22
25	26	3	2026-05-25 13:19:22
26	27	2	2026-05-25 14:20:57
27	27	10	2026-05-25 14:20:58
28	28	2	2026-05-25 14:21:20
29	28	10	2026-05-25 14:21:21
30	28	6	2026-05-25 14:21:21
31	28	4	2026-05-25 14:21:21
32	29	11	2026-05-26 09:51:40
33	29	1	2026-05-26 09:51:40
34	30	12	2026-05-26 10:13:05
35	30	11	2026-05-26 10:13:06
36	31	2	2026-05-26 15:42:05
37	31	10	2026-05-26 15:42:05
38	31	6	2026-05-26 15:42:06
39	31	4	2026-05-26 15:42:06
\.


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.conversations (id, name, is_group, created_by, created_at, group_picture) FROM stdin;
1	\N	0	2	2026-05-19 09:24:15	\N
2	\N	0	2	2026-05-19 09:24:16	\N
3	\N	0	2	2026-05-19 09:24:17	\N
4	\N	0	2	2026-05-19 09:24:18	\N
5	\N	0	2	2026-05-19 09:24:18	\N
6	\N	0	2	2026-05-19 09:24:24	\N
7	\N	0	2	2026-05-19 09:26:54	\N
8	\N	0	2	2026-05-19 09:26:55	\N
9	\N	0	2	2026-05-19 09:26:55	\N
10	\N	0	2	2026-05-19 09:27:05	\N
11	\N	0	2	2026-05-19 09:27:08	\N
12	Regular 4 Ball	1	2	2026-05-19 09:27:28	\N
13	\N	0	2	2026-05-19 09:27:35	\N
14	\N	0	2	2026-05-19 09:27:48	\N
15	\N	0	2	2026-05-19 09:27:48	\N
16	\N	0	2	2026-05-19 09:27:49	\N
17	\N	0	2	2026-05-19 09:27:59	\N
18	\N	0	2	2026-05-19 09:31:52	\N
19	\N	0	2	2026-05-19 09:31:52	\N
20	Regular 4 ball	1	2	2026-05-19 09:33:45	data:image/jpeg;base64,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
21	\N	0	6	2026-05-19 09:46:47	\N
22	\N	0	2	2026-05-19 10:05:16	\N
23	\N	0	2	2026-05-19 10:55:20	\N
24	Weeklikse 3bal groep	1	2	2026-05-19 10:56:30	\N
25	Group Chat	1	2	2026-05-25 13:18:29	\N
26	Partytime	1	2	2026-05-25 13:19:21	\N
27	\N	0	2	2026-05-25 14:20:57	\N
28	Group Chat	1	2	2026-05-25 14:21:20	\N
29	\N	0	11	2026-05-26 09:51:39	\N
30	\N	0	12	2026-05-26 10:13:05	\N
31	Group Chat	1	2	2026-05-26 15:42:05	\N
\.


--
-- Data for Name: event_registrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_registrations (id, event_id, user_id, status, registered_at) FROM stdin;
\.


--
-- Data for Name: friendships; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.friendships (id, requester_id, addressee_id, status, created_at) FROM stdin;
1	2	3	accepted	2026-05-18 14:04:23
2	2	4	accepted	2026-05-18 14:04:23
3	2	5	pending	2026-05-18 14:04:23
4	3	6	accepted	2026-05-18 14:04:23
5	4	7	accepted	2026-05-18 14:04:23
6	6	2	accepted	2026-05-18 14:04:23
7	2	7	pending	2026-05-18 14:22:05
8	10	2	accepted	2026-05-25 12:57:18
9	1	11	accepted	2026-05-26 09:49:58
10	11	12	accepted	2026-05-26 10:12:53
\.


--
-- Data for Name: golf_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.golf_events (id, club_id, name, description, event_date, start_time, end_time, event_type, restriction, entry_fee, max_participants, status, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.messages (id, conversation_id, sender_id, content, created_at) FROM stdin;
1	18	2	Do you want to play at PCC on Friday?	2026-05-19 09:32:29
2	20	2	Can everyone play Saturday?	2026-05-19 09:34:21
3	18	2	Answer please!	2026-05-19 09:35:20
4	20	6	I'm in	2026-05-19 09:40:02
5	18	6	Nee ek haat golf!	2026-05-19 09:40:25
6	21	6	Wat se jy bulla?	2026-05-19 09:46:58
7	21	6	Putt jy nogsteeds soos n olifant?	2026-05-19 09:47:42
8	22	2	Wat se jy tjom	2026-05-19 10:05:26
9	21	6	Jy moet betaal vir Westlake. Hoekom is jy so stadig?	2026-05-19 10:12:11
10	23	2	Jy moet betaal vir Westlake ou perd!	2026-05-19 10:55:40
11	24	2	Kan julle volgende week speel?	2026-05-19 10:56:47
12	24	2	sjoe ek weet nie	2026-05-19 13:09:35
13	23	2	hello	2026-05-19 20:02:14
14	18	6	test	2026-05-20 21:36:43
15	18	2	[GIF]:https://media.tenor.com/LExRuFJBzJ4AAAAC/cat-typing-cat-typing-fire.gif	2026-05-21 10:33:43
16	22	2	[GIF]:https://media.tenor.com/LExRuFJBzJ4AAAAC/cat-typing-cat-typing-fire.gif	2026-05-21 10:34:22
17	18	2	Test again	2026-05-23 12:42:03
18	18	6	👍	2026-05-24 13:29:12
19	23	2	Hi Sipho, are you ready for Friday?	2026-05-25 13:17:03
20	24	2	Ek sal kan	2026-05-25 13:17:34
21	25	2	[GIF]:https://media.tenor.com/acQ8fk3Q_xcAAAAC/bruno-hat-tip-bruno-fernandes.gif	2026-05-25 13:18:53
22	18	2	[GIF]:https://media.tenor.com/vUSLkSOA7QMAAAAC/happy-sunday.gif	2026-05-25 13:22:30
23	18	2	Test	2026-05-25 13:23:53
24	27	2	test	2026-05-25 14:21:06
25	29	11	test.	2026-05-26 09:51:55
26	29	1	golf more pebble rock?	2026-05-26 09:53:35
27	29	11	ja-wat, ek moet eintlik werk, maar jy hou so fkn aan!	2026-05-26 09:57:13
28	29	11	[GIF]:https://media.tenor.com/rGUvdMBlXZEAAAAC/stickergiant-out-of-the-office.gif	2026-05-26 09:58:27
29	30	12	Meet Clifford3000, a chrome-plated clown,The glitchiest robot to ever hit town.I said, "Make the bed," so he threw it outside,Then washed all my dishes in laundry tide.He brewed up my coffee with engine oil grease,And called the police for a pant-leg crease.He’s totally useless and breaks every plate,But raps in old Greek so I think he is great!	2026-05-26 10:13:38
30	22	2	test	2026-05-28 11:22:02.825908
\.


--
-- Data for Name: password_reset_otps; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.password_reset_otps (id, user_id, email, phone, otp_hash, reset_token, expires_at, used_at, created_at) FROM stdin;
1	9	cliff@tapingolf.co.za	\N	ffd0e4631fd76c55f2f0fe9c2babf6b49e11a9b09f83f27562943592fae25810	0049fea87b70508f3bc62df99eb51884dd8371c5fede3ff2b51a6c9627a4be44	2026-05-25 15:36:01	\N	2026-05-25 15:35:37
\.


--
-- Data for Name: payment_methods; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment_methods (id, user_id, type, label, card_last4, card_brand, card_expiry, is_default, created_at) FROM stdin;
1	2	card	James	1111	\N	01/20	1	2026-05-25 14:09:51
\.


--
-- Data for Name: pending_invitations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pending_invitations (id, inviter_id, invitee_email, created_at) FROM stdin;
\.


--
-- Data for Name: platform_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.platform_settings (id, setting_key, setting_value, updated_at) FROM stdin;
1	platform_fee_pct	5	2026-05-19 13:46:07
\.


--
-- Data for Name: portal_slot_bookings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.portal_slot_bookings (id, slot_id, player_name, player_email, player_phone, created_at) FROM stdin;
\.


--
-- Data for Name: portal_tee_slots; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.portal_tee_slots (id, club_id, date, tee_time, session_type, tee_start_type, max_players, weekday_rate_code, weekend_rate_code, is_active, notes, player_count, created_at) FROM stdin;
120585	1	2026-05-28	07:00	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:16.320337
120587	1	2026-05-28	07:08	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:16.961924
120589	1	2026-05-28	07:16	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:17.260101
120591	1	2026-05-28	07:24	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:17.634606
120592	1	2026-05-28	07:32	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:17.636198
120595	1	2026-05-28	07:48	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:17.919735
120596	1	2026-05-28	07:56	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:17.921847
120597	1	2026-05-28	07:40	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:17.928919
120600	1	2026-05-28	11:00	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:18.214751
120602	1	2026-05-28	08:04	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:18.22386
120605	1	2026-05-28	11:08	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:18.506755
120606	1	2026-05-28	11:24	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:18.507553
120608	1	2026-05-28	11:16	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:18.52374
120611	1	2026-05-28	11:40	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:18.814312
120612	1	2026-05-28	11:32	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:18.822694
120615	1	2026-05-28	11:48	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:19.097988
120617	1	2026-05-28	11:56	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:19.115767
120619	1	2026-05-28	12:04	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:19.118028
120620	1	2026-05-28	12:12	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:19.398297
120621	1	2026-05-28	12:20	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:19.399151
120625	1	2026-05-28	12:28	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:19.741308
120626	1	2026-05-28	12:36	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:19.753202
120627	1	2026-05-28	12:44	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:19.754151
120631	1	2026-05-28	17:00	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:20.034086
120632	1	2026-05-28	17:08	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:20.038006
120635	1	2026-05-28	17:16	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:20.31808
120636	1	2026-05-28	17:24	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-28 11:09:20.325763
120640	1	2026-05-29	07:00	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:07.50162
120642	1	2026-05-29	07:16	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:07.513069
120643	1	2026-05-29	07:08	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:07.513088
120644	1	2026-05-29	07:24	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:08.09337
120647	1	2026-05-29	07:32	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:08.109887
120649	1	2026-05-29	07:40	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:08.372111
120650	1	2026-05-29	07:48	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:08.373807
120653	1	2026-05-29	07:56	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:08.389219
120654	1	2026-05-29	08:04	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:08.649235
120656	1	2026-05-29	11:00	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:08.651543
120659	1	2026-05-29	11:08	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:08.921239
120660	1	2026-05-29	11:16	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:08.922171
120663	1	2026-05-29	11:24	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:08.935886
120665	1	2026-05-29	11:40	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:09.204358
120667	1	2026-05-29	11:32	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:09.214958
120669	1	2026-05-29	11:56	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:09.473158
120670	1	2026-05-29	12:04	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:09.47416
120672	1	2026-05-29	11:48	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:09.487073
120674	1	2026-05-29	12:12	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:09.77721
120676	1	2026-05-29	12:20	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:09.780501
120679	1	2026-05-29	12:28	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:10.053175
120681	1	2026-05-29	12:36	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:10.067808
120683	1	2026-05-29	12:44	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:10.069193
120685	1	2026-05-29	17:00	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:10.342742
120687	1	2026-05-29	17:08	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:10.356879
120689	1	2026-05-29	17:16	AM	1st Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:10.626339
120691	1	2026-05-29	17:24	AM	10th Tee	4	\N	\N	1	\N	0	2026-05-29 06:01:10.63281
\.


--
-- Data for Name: reviews; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reviews (id, club_id, user_id, rating, comment, created_at) FROM stdin;
1	142	1	5	Fantastic fairways, well-maintained greens. The caddy service is exceptional.	2026-05-20 18:28:50
2	142	1	4	Great club, enjoyed the driving range before our round. Pro shop well stocked.	2026-05-20 18:28:50
3	142	1	5	One of the best in Gauteng. Challenging 18 holes with beautiful scenery.	2026-05-20 18:28:50
4	484	1	5	Mountain views are absolutely stunning. One of Cape Town's hidden gems.	2026-05-20 18:28:51
5	484	1	5	Immaculate course, the greens are lightning fast. Will be back!	2026-05-20 18:28:51
6	484	1	4	Lovely course with a great vibe. The bar after golf is perfect.	2026-05-20 18:28:51
7	366	1	5	Historic course with beautiful trees and a classic layout. A must-play.	2026-05-20 18:28:52
8	366	1	4	Prestigious club with amazing service. Caddy really helped with club selection.	2026-05-20 18:28:52
9	366	1	5	Royal Cape lives up to its name. Pristine fairways, perfect greens.	2026-05-20 18:28:52
10	104	1	5	Coastal breeze makes every hole an adventure. The pool after is perfect.	2026-05-20 18:28:53
11	104	1	5	World-class facility in a stunning setting. The restaurant is top tier.	2026-05-20 18:28:53
12	104	1	4	Challenging layout but very enjoyable. The par 3s over the water are memorable.	2026-05-20 18:28:53
13	113	2	5	gret golf club	2026-05-22 10:59:04
14	427	1	1	kak	2026-05-22 12:22:30
\.


--
-- Data for Name: tee_time_reminders_sent; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tee_time_reminders_sent (booking_id, user_id, sent_at) FROM stdin;
12	2	2026-05-26 04:56:07
14	2	2026-05-28 09:56:41
\.


--
-- Data for Name: tee_time_schedule_configs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tee_time_schedule_configs (id, club_id, name, config_type, config_data, created_at, updated_at) FROM stdin;
1	1	Winter Tee Times	A	{"midday": {"end": "12:44", "start": "11:00", "interval": 8, "tee_start_type": "two_tee", "crossover_enabled": false}, "morning": {"end": "08:04", "start": "07:00", "interval": 8, "tee_start_type": "two_tee", "crossover_enabled": false}, "twilight": {"end": "17:24", "start": "17:00", "interval": 8, "tee_start_type": "two_tee", "crossover_enabled": false}, "crossoverGapMin": 176, "fieldResetGapMin": 256}	2026-05-28 09:33:19	2026-05-28 09:33:19
\.


--
-- Data for Name: user_ad_removal; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_ad_removal (id, user_id, purchased_at, expires_at, price_paid, period_days, payment_ref, status) FROM stdin;
1	2	2026-05-25 11:44:18	2026-06-24 11:44:18	29.99	30	\N	pending
2	10	2026-05-25 13:08:46	2026-06-24 13:08:46	29.99	30	\N	pending
\.


--
-- Data for Name: user_blocks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_blocks (id, user_id, blocked_user_id, created_at) FROM stdin;
\.


--
-- Data for Name: user_notification_prefs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_notification_prefs (id, user_id, notif_bookings, notif_messages, notif_friend_requests, notif_payments, notif_club_news, notif_promotions, updated_at) FROM stdin;
1	2	1	1	1	1	1	1	2026-05-25 11:44:48
26	10	1	1	1	1	1	1	2026-05-25 13:08:39
29	9	1	1	1	1	1	0	2026-05-25 14:38:20
\.


--
-- Data for Name: user_notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_notifications (id, user_id, type, title, body, data, is_read, created_at) FROM stdin;
3	2	booking_invited	You've Been Added to a Round! ⛳	Megan Olivier added you to a round at Wingate Park Country Club on 2026-05-29 at 07:30. Tap to pay your share.	{"booking_id": 13}	1	2026-05-23 12:51:54
5	3	booking_invited	You've Been Added to a Round! ⛳	James van der Berg added you to a round at Arabella Golf Club on 2026-05-28 at 12:00. Tap to pay your share.	{"booking_id": 14}	0	2026-05-23 12:56:09
6	2	booking_confirmed	Booking Confirmed! ⛳	Your tee time at Arabella Golf Club on 2026-05-28 at 12:00 is confirmed.	{"booking_id": 14}	1	2026-05-23 12:56:09
11	2	new_message	Megan Olivier	👍	{"conversation_id": 18}	1	2026-05-24 13:29:14
12	10	booking_confirmed	Booking Confirmed! ⛳	Your tee time at Pretoria Country Club on 2026-05-29 at 07:00 is confirmed.	{"booking_id": 19}	1	2026-05-25 12:52:55
13	2	friend_request	New Friend Request 🤝	Marie Steyn wants to connect with you on TapIn Golf.	{}	1	2026-05-25 12:57:19
14	10	booking_confirmed	Booking Confirmed! ⛳	Your tee time at Wingate Park Country Club on 2026-05-29 at 07:30 is confirmed.	{"booking_id": 20}	1	2026-05-25 13:05:39
15	3	new_message	James van der Berg	Hi Sipho, are you ready for Friday?	{"conversation_id": 23}	0	2026-05-25 13:17:05
18	3	new_message	James van der Berg in Group Chat	[GIF]:https://media.tenor.com/acQ8fk3Q_xcAAAAC/bruno-hat-tip-bruno-fernandes.gif	{"conversation_id": 25}	0	2026-05-25 13:18:55
23	2	booking_confirmed	Booking Confirmed! ⛳	Your tee time at Woodhill Country Club on 2026-05-29 at 08:30 is confirmed.	{"booking_id": 21}	1	2026-05-25 13:31:47
25	10	friend_accepted	Friend Request Accepted! 🎉	James van der Berg accepted your friend request. You can now add them to a round.	{}	0	2026-05-25 14:15:57
26	10	new_message	James van der Berg	test	{"conversation_id": 27}	0	2026-05-25 14:21:08
27	2	tee_time_reminder	⛳ Tee time in 2 hours	Your round at Waterkloof Golf Club is at 07:00:00. Get ready!	{"club_name": "Waterkloof Golf Club", "booking_id": 12}	1	2026-05-26 04:56:06
28	11	friend_request	New Friend Request 🤝	Admin User wants to connect with you on TapIn Golf.	{}	1	2026-05-26 09:49:59
29	1	friend_accepted	Friend Request Accepted! 🎉	Marco Steyn accepted your friend request. You can now add them to a round.	{}	0	2026-05-26 09:51:29
30	1	new_message	Marco Steyn	test.	{"conversation_id": 29}	1	2026-05-26 09:51:57
31	11	new_message	Admin User	golf more pebble rock?	{"conversation_id": 29}	1	2026-05-26 09:53:37
32	1	new_message	Marco Steyn	ja-wat, ek moet eintlik werk, maar jy hou so fkn aan!	{"conversation_id": 29}	1	2026-05-26 09:57:15
33	1	new_message	Marco Steyn	[GIF]:https://media.tenor.com/rGUvdMBlXZEAAAAC/stickergiant-out-of-the-office.gi…	{"conversation_id": 29}	0	2026-05-26 09:58:29
34	11	new_message	cliff	Meet Clifford3000, a chrome-plated clown,The glitchiest robot to ever hit town.I…	{"conversation_id": 30}	1	2026-05-26 10:13:40
35	2	booking_confirmed	Booking Confirmed! ⛳	Your tee time at Pretoria Country Club on 2026-05-29 at 07:00 is confirmed.	{"booking_id": 22}	1	2026-05-26 15:41:15
37	2	booking_confirmed	Booking Confirmed! ⛳	Your tee time at Aberdeen Golf Club on 2026-05-28 at 07:00 is confirmed.	{"booking_id": 23}	1	2026-05-28 09:53:46
38	10	booking_invited	You've Been Added to a Round! ⛳	James van der Berg added you to a round at Aberdeen Golf Club on 2026-05-28 at 07:00. Tap to pay your share.	{"booking_id": 23}	0	2026-05-28 09:53:47
40	2	tee_time_reminder	⛳ Tee time in 2 hours	Your round at Arabella Golf Club is at 12:00:00. Get ready!	{"club_name": "Arabella Golf Club", "booking_id": 14}	1	2026-05-28 09:56:41
1	6	new_message	James van der Berg	Test again	{"conversation_id": 18}	1	2026-05-23 12:42:05
2	6	booking_confirmed	Booking Confirmed! ⛳	Your tee time at Wingate Park Country Club on 2026-05-29 at 07:30 is confirmed.	{"booking_id": 13}	1	2026-05-23 12:51:54
17	6	new_message	James van der Berg in Weeklikse 3bal groep	Ek sal kan	{"conversation_id": 24}	1	2026-05-25 13:17:37
4	4	booking_invited	You've Been Added to a Round! ⛳	James van der Berg added you to a round at Arabella Golf Club on 2026-05-28 at 12:00. Tap to pay your share.	{"booking_id": 14}	1	2026-05-23 12:56:09
16	4	new_message	James van der Berg in Weeklikse 3bal groep	Ek sal kan	{"conversation_id": 24}	1	2026-05-25 13:17:36
20	4	new_message	James van der Berg in Group Chat	[GIF]:https://media.tenor.com/acQ8fk3Q_xcAAAAC/bruno-hat-tip-bruno-fernandes.gif	{"conversation_id": 25}	1	2026-05-25 13:18:55
24	4	booking_invited	You've Been Added to a Round! ⛳	James van der Berg added you to a round at Woodhill Country Club on 2026-05-29 at 08:30. Tap to pay your share.	{"booking_id": 21}	1	2026-05-25 13:31:47
36	4	booking_invited	You've Been Added to a Round! ⛳	James van der Berg added you to a round at Aberdeen Golf Club on 2026-05-28 at 07:00. Tap to pay your share.	{"booking_id": 23}	1	2026-05-28 09:53:46
41	4	new_message	James van der Berg	test	{"conversation_id": 22}	1	2026-05-28 11:22:02.864303
7	6	booking_confirmed	Booking Confirmed! ⛳	Your tee time at Avion Park Golf Club on 2026-05-24 at 08:00 is confirmed.	{"booking_id": 15}	1	2026-05-24 12:52:37
8	6	booking_confirmed	Booking Confirmed! ⛳	Your tee time at Benoni Country Club on 2026-05-24 at 11:00 is confirmed.	{"booking_id": 16}	1	2026-05-24 12:53:14
9	6	booking_confirmed	Booking Confirmed! ⛳	Your tee time at Benoni Country Club on 2026-05-24 at 11:00 is confirmed.	{"booking_id": 17}	1	2026-05-24 12:53:25
10	6	booking_confirmed	Booking Confirmed! ⛳	Your tee time at Benoni Country Club on 2026-05-24 at 09:30 is confirmed.	{"booking_id": 18}	1	2026-05-24 12:54:05
19	6	new_message	James van der Berg in Group Chat	[GIF]:https://media.tenor.com/acQ8fk3Q_xcAAAAC/bruno-hat-tip-bruno-fernandes.gif	{"conversation_id": 25}	1	2026-05-25 13:18:55
21	6	new_message	James van der Berg	[GIF]:https://media.tenor.com/vUSLkSOA7QMAAAAC/happy-sunday.gif	{"conversation_id": 18}	1	2026-05-25 13:22:30
22	6	new_message	James van der Berg	Test	{"conversation_id": 18}	1	2026-05-25 13:23:54
39	6	booking_invited	You've Been Added to a Round! ⛳	James van der Berg added you to a round at Aberdeen Golf Club on 2026-05-28 at 07:00. Tap to pay your share.	{"booking_id": 23}	1	2026-05-28 09:53:47
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, name, email, password_hash, phone, handicap, role, created_at, profile_picture, push_token, club_id, gender, date_of_birth, home_province, hna_number, student_number, is_private, analytics_consent, is_super_user, hna_locked, student_number_locked) FROM stdin;
1	Admin User	admin@tapingolf.co.za	$2b$10$MNyC.0Wg/nAwd9j38C717OxG5by6GXtVkfzspigD3sXG9Fbm4vxB6	+27 11 000 0001	\N	club_admin	2026-05-18 14:04:22	\N	\N	\N	\N	\N	\N	\N	\N	0	1	0	0	0
5	Ayanda Dlamini	ayanda@gmail.com	$2b$10$MNyC.0Wg/nAwd9j38C717OxG5by6GXtVkfzspigD3sXG9Fbm4vxB6	+27 61 456 7890	24.5	golfer	2026-05-18 14:04:22	\N	\N	\N	\N	\N	\N	\N	\N	0	1	0	0	0
7	Dylan Fourie	dylan@gmail.com	$2b$10$MNyC.0Wg/nAwd9j38C717OxG5by6GXtVkfzspigD3sXG9Fbm4vxB6	+27 84 678 9012	6.7	golfer	2026-05-18 14:04:22	\N	\N	\N	\N	\N	\N	\N	\N	0	1	0	0	0
8	Advertiser Co	ads@tapingolf.co.za	$2b$10$MNyC.0Wg/nAwd9j38C717OxG5by6GXtVkfzspigD3sXG9Fbm4vxB6	+27 11 999 0000	\N	advertiser	2026-05-18 14:04:22	\N	\N	\N	\N	\N	\N	\N	\N	0	1	0	0	0
10	Marie Steyn	mariedgrobler@gmail.com	$2b$10$juUbGmokLnb4EZh7kmwBdOvbiwEhWEwYlezaUpJDIpy0g65520cum	0813702329	0.0	golfer	2026-05-25 12:51:09	\N	\N	\N	female	1987-01-05	Gauteng	\N	\N	0	1	0	0	0
12	cliff	clifford3000@gmail.com	$2b$10$HAnAHS.MZO9QXwJNf04yPOVHpcTdXvNWWPTOIzKEwufcDx/nA7sHG	0692180090	\N	golfer	2026-05-26 10:12:52	\N	\N	\N	\N	\N	\N	\N	\N	0	1	0	0	0
2	James van der Berg	james@tapingolf.co.za	$2b$10$MNyC.0Wg/nAwd9j38C717OxG5by6GXtVkfzspigD3sXG9Fbm4vxB6	+27 82 123 4567	12.4	golfer	2026-05-18 14:04:22	data:image/jpeg;base64,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	\N	\N	\N	1988-01-28	Gauteng	\N	\N	0	1	0	0	0
4	Ruan Pretorius	ruan@gmail.com	$2b$10$MNyC.0Wg/nAwd9j38C717OxG5by6GXtVkfzspigD3sXG9Fbm4vxB6	+27 83 345 6789	18.0	golfer	2026-05-18 14:04:22	\N	\N	\N	male	2010-11-29	Western Cape	\N	\N	0	1	0	0	0
3	Sipho Ndlovu	sipho@gmail.com	$2b$10$MNyC.0Wg/nAwd9j38C717OxG5by6GXtVkfzspigD3sXG9Fbm4vxB6	+27 72 234 5678	8.1	golfer	2026-05-18 14:04:22	\N	\N	\N	male	1958-03-19	KwaZulu-Natal	\N	\N	0	1	0	0	0
6	Megan Olivier	megan@gmail.com	$2b$10$MNyC.0Wg/nAwd9j38C717OxG5by6GXtVkfzspigD3sXG9Fbm4vxB6	+27 79 567 8901	15.3	golfer	2026-05-18 14:04:22	data:image/jpeg;base64,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	\N	\N	female	2004-07-10	Limpopo	2700111111	UNISA123	0	1	0	0	0
9	Clifford Fredrickson	cliff@tapingolf.co.za	$2b$10$6uD6drRqOkTZ3Z5tBkx6ZOEziDONhQDIEs6IPERrLrHphdQJLtDJ6	0692180090	\N	golfer	2026-05-18 15:01:42	\N	\N	\N	\N	\N	\N	\N	\N	0	1	1	0	0
11	Marco Steyn	marco@tapingolf.co.za	$2b$10$9njS7n0d4vpX44ITX.lfj.8r4iERKt01u1uB/mt3ItzmbcNzzbhuO	0662496393	\N	golfer	2026-05-25 14:19:08	\N	\N	\N	\N	\N	\N	\N	\N	0	1	1	0	0
\.


--
-- Data for Name: vouchers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vouchers (id, code, discount_type, discount_value, club_id, min_amount, max_uses, uses_count, active, expires_at, created_at) FROM stdin;
1	TAPIN10	percentage	10.00	\N	0.00	\N	1	1	\N	2026-05-19 12:09:44
2	GOLF50	fixed	50.00	\N	200.00	\N	0	1	\N	2026-05-19 12:09:45
3	WELCOME20	percentage	20.00	\N	0.00	\N	0	1	\N	2026-05-19 12:09:45
361	WALLET100	wallet_credit	100.00	\N	0.00	\N	1	1	\N	2026-05-25 14:08:13
362	TAPIN25	wallet_credit	25.00	\N	0.00	\N	0	1	\N	2026-05-25 14:08:13
363	GOLF200	wallet_credit	200.00	\N	0.00	\N	0	1	\N	2026-05-25 14:08:14
\.


--
-- Data for Name: wallet_topups; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.wallet_topups (id, user_id, amount, status, created_at) FROM stdin;
1	2	500.00	pending	2026-05-28 09:25:25.073438
2	2	500.00	pending	2026-05-28 09:27:36.655559
\.


--
-- Data for Name: wallets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.wallets (id, user_id, balance, updated_at) FROM stdin;
1	2	1100.00	2026-05-25 14:08:59
2	10	500.00	2026-05-25 13:10:55
\.


--
-- Name: ad_removal_config_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ad_removal_config_id_seq', 1, true);


--
-- Name: ads_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ads_id_seq', 5, true);


--
-- Name: booking_players_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.booking_players_id_seq', 39, true);


--
-- Name: bookings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.bookings_id_seq', 23, true);


--
-- Name: club_images_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.club_images_id_seq', 5, true);


--
-- Name: club_members_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.club_members_id_seq', 1, true);


--
-- Name: club_memberships_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.club_memberships_id_seq', 1, false);


--
-- Name: club_notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.club_notifications_id_seq', 1, false);


--
-- Name: club_password_reset_otps_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.club_password_reset_otps_id_seq', 1, false);


--
-- Name: club_pricing_tiers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.club_pricing_tiers_id_seq', 15, true);


--
-- Name: clubs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.clubs_id_seq', 506, true);


--
-- Name: conversation_members_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.conversation_members_id_seq', 39, true);


--
-- Name: conversations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.conversations_id_seq', 31, true);


--
-- Name: event_registrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.event_registrations_id_seq', 1, false);


--
-- Name: friendships_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.friendships_id_seq', 10, true);


--
-- Name: golf_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.golf_events_id_seq', 1, false);


--
-- Name: messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.messages_id_seq', 30, true);


--
-- Name: password_reset_otps_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.password_reset_otps_id_seq', 1, true);


--
-- Name: payment_methods_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payment_methods_id_seq', 1, true);


--
-- Name: pending_invitations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pending_invitations_id_seq', 1, false);


--
-- Name: platform_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.platform_settings_id_seq', 30, true);


--
-- Name: portal_slot_bookings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.portal_slot_bookings_id_seq', 2, true);


--
-- Name: portal_tee_slots_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.portal_tee_slots_id_seq', 120692, true);


--
-- Name: reviews_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reviews_id_seq', 14, true);


--
-- Name: tee_time_schedule_configs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tee_time_schedule_configs_id_seq', 1, true);


--
-- Name: user_ad_removal_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_ad_removal_id_seq', 2, true);


--
-- Name: user_blocks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_blocks_id_seq', 1, false);


--
-- Name: user_notification_prefs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_notification_prefs_id_seq', 30, true);


--
-- Name: user_notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_notifications_id_seq', 41, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 12, true);


--
-- Name: vouchers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.vouchers_id_seq', 537, true);


--
-- Name: wallet_topups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.wallet_topups_id_seq', 2, true);


--
-- Name: wallets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.wallets_id_seq', 2, true);


--
-- Name: ad_removal_config ad_removal_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_removal_config
    ADD CONSTRAINT ad_removal_config_pkey PRIMARY KEY (id);


--
-- Name: ads ads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ads
    ADD CONSTRAINT ads_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: booking_players booking_players_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_players
    ADD CONSTRAINT booking_players_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_booking_ref_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_booking_ref_key UNIQUE (booking_ref);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: club_images club_images_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_images
    ADD CONSTRAINT club_images_pkey PRIMARY KEY (id);


--
-- Name: club_members club_members_club_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_members
    ADD CONSTRAINT club_members_club_id_user_id_key UNIQUE (club_id, user_id);


--
-- Name: club_members club_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_members
    ADD CONSTRAINT club_members_pkey PRIMARY KEY (id);


--
-- Name: club_memberships club_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_memberships
    ADD CONSTRAINT club_memberships_pkey PRIMARY KEY (id);


--
-- Name: club_notifications club_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_notifications
    ADD CONSTRAINT club_notifications_pkey PRIMARY KEY (id);


--
-- Name: club_password_reset_otps club_password_reset_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_password_reset_otps
    ADD CONSTRAINT club_password_reset_otps_pkey PRIMARY KEY (id);


--
-- Name: club_pricing_tiers club_pricing_tiers_club_id_tier_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_pricing_tiers
    ADD CONSTRAINT club_pricing_tiers_club_id_tier_type_key UNIQUE (club_id, tier_type);


--
-- Name: club_pricing_tiers club_pricing_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_pricing_tiers
    ADD CONSTRAINT club_pricing_tiers_pkey PRIMARY KEY (id);


--
-- Name: clubs clubs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_pkey PRIMARY KEY (id);


--
-- Name: clubs clubs_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_username_key UNIQUE (username);


--
-- Name: conversation_members conversation_members_conversation_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversation_members
    ADD CONSTRAINT conversation_members_conversation_id_user_id_key UNIQUE (conversation_id, user_id);


--
-- Name: conversation_members conversation_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversation_members
    ADD CONSTRAINT conversation_members_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: event_registrations event_registrations_event_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_event_id_user_id_key UNIQUE (event_id, user_id);


--
-- Name: event_registrations event_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_requester_id_addressee_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_requester_id_addressee_id_key UNIQUE (requester_id, addressee_id);


--
-- Name: golf_events golf_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.golf_events
    ADD CONSTRAINT golf_events_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: password_reset_otps password_reset_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_otps
    ADD CONSTRAINT password_reset_otps_pkey PRIMARY KEY (id);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: pending_invitations pending_invitations_inviter_id_invitee_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_invitations
    ADD CONSTRAINT pending_invitations_inviter_id_invitee_email_key UNIQUE (inviter_id, invitee_email);


--
-- Name: pending_invitations pending_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_invitations
    ADD CONSTRAINT pending_invitations_pkey PRIMARY KEY (id);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);


--
-- Name: platform_settings platform_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: portal_slot_bookings portal_slot_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.portal_slot_bookings
    ADD CONSTRAINT portal_slot_bookings_pkey PRIMARY KEY (id);


--
-- Name: portal_tee_slots portal_tee_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.portal_tee_slots
    ADD CONSTRAINT portal_tee_slots_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: tee_time_reminders_sent tee_time_reminders_sent_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tee_time_reminders_sent
    ADD CONSTRAINT tee_time_reminders_sent_pkey PRIMARY KEY (booking_id, user_id);


--
-- Name: tee_time_schedule_configs tee_time_schedule_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tee_time_schedule_configs
    ADD CONSTRAINT tee_time_schedule_configs_pkey PRIMARY KEY (id);


--
-- Name: user_ad_removal user_ad_removal_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_ad_removal
    ADD CONSTRAINT user_ad_removal_pkey PRIMARY KEY (id);


--
-- Name: user_blocks user_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (id);


--
-- Name: user_blocks user_blocks_user_id_blocked_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_user_id_blocked_user_id_key UNIQUE (user_id, blocked_user_id);


--
-- Name: user_notification_prefs user_notification_prefs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_notification_prefs
    ADD CONSTRAINT user_notification_prefs_pkey PRIMARY KEY (id);


--
-- Name: user_notification_prefs user_notification_prefs_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_notification_prefs
    ADD CONSTRAINT user_notification_prefs_user_id_key UNIQUE (user_id);


--
-- Name: user_notifications user_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vouchers vouchers_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_code_key UNIQUE (code);


--
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


--
-- Name: wallet_topups wallet_topups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_topups
    ADD CONSTRAINT wallet_topups_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_key UNIQUE (user_id);


--
-- Name: idx_ads_placement; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ads_placement ON public.ads USING btree (placement, active, priority);


--
-- Name: idx_bookings_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_created ON public.bookings USING btree (created_at);


--
-- Name: idx_bookings_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);


--
-- Name: idx_bookings_tee_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_tee_time ON public.bookings USING btree (tee_time_id);


--
-- Name: idx_bookings_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_user ON public.bookings USING btree (user_id);


--
-- Name: idx_bookings_user_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_user_status ON public.bookings USING btree (user_id, status);


--
-- Name: idx_bp_booking; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bp_booking ON public.booking_players USING btree (booking_id);


--
-- Name: idx_bp_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bp_user ON public.booking_players USING btree (user_id);


--
-- Name: idx_club_images_club; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_club_images_club ON public.club_images USING btree (club_id);


--
-- Name: idx_club_members_club; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_club_members_club ON public.club_members USING btree (club_id);


--
-- Name: idx_club_members_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_club_members_user ON public.club_members USING btree (user_id);


--
-- Name: idx_club_notif_club; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_club_notif_club ON public.club_notifications USING btree (club_id);


--
-- Name: idx_club_notif_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_club_notif_date ON public.club_notifications USING btree (affected_date);


--
-- Name: idx_clubs_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clubs_active ON public.clubs USING btree (active);


--
-- Name: idx_clubs_featured; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clubs_featured ON public.clubs USING btree (featured, active);


--
-- Name: idx_clubs_geo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clubs_geo ON public.clubs USING btree (latitude, longitude);


--
-- Name: idx_clubs_province; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clubs_province ON public.clubs USING btree (province);


--
-- Name: idx_conv_members_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conv_members_user ON public.conversation_members USING btree (user_id);


--
-- Name: idx_cprot_club; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cprot_club ON public.club_password_reset_otps USING btree (club_id);


--
-- Name: idx_cprot_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cprot_email ON public.club_password_reset_otps USING btree (email);


--
-- Name: idx_cprot_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cprot_token ON public.club_password_reset_otps USING btree (reset_token);


--
-- Name: idx_event_reg_event; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_reg_event ON public.event_registrations USING btree (event_id);


--
-- Name: idx_event_reg_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_reg_user ON public.event_registrations USING btree (user_id);


--
-- Name: idx_fr_addressee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fr_addressee ON public.friendships USING btree (addressee_id, status);


--
-- Name: idx_fr_requester; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fr_requester ON public.friendships USING btree (requester_id, status);


--
-- Name: idx_golf_events_club; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_golf_events_club ON public.golf_events USING btree (club_id);


--
-- Name: idx_golf_events_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_golf_events_date ON public.golf_events USING btree (event_date);


--
-- Name: idx_messages_conv_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_conv_time ON public.messages USING btree (conversation_id, created_at);


--
-- Name: idx_pi_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pi_email ON public.pending_invitations USING btree (invitee_email);


--
-- Name: idx_prot_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_prot_email ON public.password_reset_otps USING btree (email);


--
-- Name: idx_prot_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_prot_phone ON public.password_reset_otps USING btree (phone);


--
-- Name: idx_prot_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_prot_token ON public.password_reset_otps USING btree (reset_token);


--
-- Name: idx_prot_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_prot_user ON public.password_reset_otps USING btree (user_id);


--
-- Name: idx_psb_slot; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_psb_slot ON public.portal_slot_bookings USING btree (slot_id);


--
-- Name: idx_pts_club_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pts_club_date ON public.portal_tee_slots USING btree (club_id, date);


--
-- Name: idx_reviews_club; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reviews_club ON public.reviews USING btree (club_id);


--
-- Name: idx_reviews_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reviews_user ON public.reviews USING btree (user_id);


--
-- Name: idx_uar_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_uar_expires ON public.user_ad_removal USING btree (expires_at);


--
-- Name: idx_uar_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_uar_user ON public.user_ad_removal USING btree (user_id);


--
-- Name: idx_user_notif_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_notif_unread ON public.user_notifications USING btree (user_id, is_read);


--
-- Name: idx_user_notif_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_notif_user ON public.user_notifications USING btree (user_id);


--
-- Name: idx_users_club_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_club_id ON public.users USING btree (club_id);


--
-- Name: idx_users_push_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_push_token ON public.users USING btree (push_token);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_vouchers_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vouchers_active ON public.vouchers USING btree (active, expires_at);


--
-- Name: uq_pts_club_date_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_pts_club_date_time ON public.portal_tee_slots USING btree (club_id, date, tee_time);


--
-- Name: ad_removal_config trg_ad_removal_config_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_ad_removal_config_updated_at BEFORE UPDATE ON public.ad_removal_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: app_settings trg_app_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: platform_settings trg_platform_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_platform_settings_updated_at BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tee_time_schedule_configs trg_tee_time_schedule_configs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_tee_time_schedule_configs_updated_at BEFORE UPDATE ON public.tee_time_schedule_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_notification_prefs trg_user_notification_prefs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_user_notification_prefs_updated_at BEFORE UPDATE ON public.user_notification_prefs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: wallets trg_wallets_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: booking_players booking_players_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_players
    ADD CONSTRAINT booking_players_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_players booking_players_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_players
    ADD CONSTRAINT booking_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: bookings bookings_portal_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_portal_slot_id_fkey FOREIGN KEY (portal_slot_id) REFERENCES public.portal_tee_slots(id);


--
-- Name: bookings bookings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: club_images club_images_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_images
    ADD CONSTRAINT club_images_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;


--
-- Name: club_memberships club_memberships_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_memberships
    ADD CONSTRAINT club_memberships_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;


--
-- Name: club_memberships club_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_memberships
    ADD CONSTRAINT club_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: club_pricing_tiers club_pricing_tiers_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.club_pricing_tiers
    ADD CONSTRAINT club_pricing_tiers_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;


--
-- Name: conversation_members conversation_members_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversation_members
    ADD CONSTRAINT conversation_members_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_members conversation_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversation_members
    ADD CONSTRAINT conversation_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_addressee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_addressee_id_fkey FOREIGN KEY (addressee_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payment_methods payment_methods_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pending_invitations pending_invitations_inviter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_invitations
    ADD CONSTRAINT pending_invitations_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: portal_slot_bookings portal_slot_bookings_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.portal_slot_bookings
    ADD CONSTRAINT portal_slot_bookings_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.portal_tee_slots(id) ON DELETE CASCADE;


--
-- Name: portal_tee_slots portal_tee_slots_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.portal_tee_slots
    ADD CONSTRAINT portal_tee_slots_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: tee_time_schedule_configs tee_time_schedule_configs_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tee_time_schedule_configs
    ADD CONSTRAINT tee_time_schedule_configs_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;


--
-- Name: user_ad_removal user_ad_removal_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_ad_removal
    ADD CONSTRAINT user_ad_removal_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocked_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocked_user_id_fkey FOREIGN KEY (blocked_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_notification_prefs user_notification_prefs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_notification_prefs
    ADD CONSTRAINT user_notification_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: vouchers vouchers_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;


--
-- Name: wallet_topups wallet_topups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_topups
    ADD CONSTRAINT wallet_topups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: wallets wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict jnC6lGENp7ZIlGWadXEH1gLqb2Zwwesyk49SmJKywMdgIYvYoFEaKaEH0d7QGDP

