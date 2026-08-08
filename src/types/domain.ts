// Домены значений (CHECK-констрейнты) из supabase/migrations/20260808120000_initial_schema.sql.
// В БД это TEXT + CHECK, а не enum-типы, поэтому `supabase gen types` отдаёт `string`.
// Литеральные юнионы ниже нужны прикладному коду (Zod-схемы, switch по статусу);
// держать их в синхроне с CHECK'ами миграции обязательно при каждом изменении схемы.

export const LEAD_SOURCES = ['test', 'club_page', 'waitlist', 'direct', 'import'] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export const TEST_SESSION_STATUSES = ['in_progress', 'completed', 'abandoned'] as const
export type TestSessionStatus = (typeof TEST_SESSION_STATUSES)[number]

export const SOCIAL_TRIADS = ['assertive', 'compliant', 'withdrawn'] as const
export type SocialTriad = (typeof SOCIAL_TRIADS)[number]

export const HARMONIC_TRIADS = ['positive', 'competency', 'reactive'] as const
export type HarmonicTriad = (typeof HARMONIC_TRIADS)[number]

export const CENTERS = ['gut', 'heart', 'head'] as const
export type Center = (typeof CENTERS)[number]

export const SUBSCRIPTION_STATUSES = ['active', 'past_due', 'canceled', 'expired'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export const PRODUCT_TYPES = ['club', 'deposit'] as const
export type ProductType = (typeof PRODUCT_TYPES)[number]

export const PAYMENT_PROVIDERS = ['prodamus', 'yookassa'] as const
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number]

export const PAYMENT_STATUSES = ['pending', 'succeeded', 'canceled', 'refunded'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const WAITLIST_TIERS = ['self', 'guided', 'practitioner'] as const
export type WaitlistTier = (typeof WAITLIST_TIERS)[number]

export const DEPOSIT_STATUSES = ['none', 'pending', 'paid', 'refunded'] as const
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number]

export const ACCESS_GRANT_STATUSES = ['pending', 'granted', 'revoked'] as const
export type AccessGrantStatus = (typeof ACCESS_GRANT_STATUSES)[number]

export const EVENT_TYPES = [
  'test_started',
  'test_completed',
  'result_viewed',
  'lead_captured',
  'telegram_cta_clicked',
  'club_start_clicked',
  'subscriber_created',
  'club_paid',
  'access_granted',
  'subscription_renewed',
  'subscription_past_due',
  'subscription_churned',
  'access_revoked',
  'waitlist_joined',
  'waitlist_deposit_paid',
] as const
export type EventType = (typeof EVENT_TYPES)[number]

// События, которые приходят из вебхука Salebot (подмножество EVENT_TYPES).
export const SALEBOT_EVENT_TYPES = [
  'subscriber_created',
  'club_paid',
  'access_granted',
  'subscription_renewed',
  'subscription_past_due',
  'subscription_churned',
  'access_revoked',
] as const
export type SalebotEventType = (typeof SALEBOT_EVENT_TYPES)[number]
