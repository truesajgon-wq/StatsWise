import { createContext, useContext } from 'react'

export const LANGUAGES = [{ code: 'en', label: 'English', flag: 'EN' }]

const EN = {
  lang: 'en',
  loading: 'Loading...',
  retry: 'Retry',
  refresh: 'Refresh',
  welcome: 'Welcome,',
  login: 'Login',
  login_sub: 'or create account',
  matches: 'matches',
  search_team: 'Search team...',
  no_matches: 'No matches on this day',
  clear_filters: 'Clear filters',
  filter_all: 'All',
  venue: 'Venue',

  nav_mecze: 'Schedule',
  nav_ligi: 'Leagues',
  nav_btts: 'Both Teams To Score',
  nav_goals: 'Total Goals',
  nav_corners: 'Total Corners',
  nav_fouls: 'Total Fouls',
  nav_cards: 'Total Cards',
  nav_teamGoals: 'Team Goals',
  nav_lamaki: 'Comeback Bets',
  nav_player_stats: 'Player Statistics',
  nav_correct_score: 'Correct Score',

  demo_title: 'Demo mode',
  demo_desc: 'showing sample data. Add your API key in the',
  demo_desc2: 'file to see live matches.',

  md_loading: 'Loading match details...',
  md_full_time: 'Full time',
  md_get_premium: 'Get Premium',
  md_premium_title: 'Premium required',
  md_premium_desc: 'Unlock full match insights, history and player analysis.',
  md_all_matches: 'All Matches',
  md_home_away: 'Home / Away',
  md_stat_type: 'Stat Type',
  md_alt_line: 'ALT Line',
  md_over: 'Over',
  md_under: 'Under',
  md_avg: 'Average',
  md_history_wait: 'History data will appear shortly.',
  md_team_fallback: 'Team',
  md_opponent_fallback: 'Opponent',
  md_yes: 'Yes',
  md_no: 'No',
  md_vs: 'vs',
  md_score: 'Score',

  pred_min_confidence: 'Minimum confidence',
  pred_no_results: 'No predictions match this filter',
  pred_try_lower: 'Try lowering the confidence threshold',
  pred_hits: 'hits',

  stat: 'Stats',
  stat_no_fixtures: 'No fixtures found',
  stat_try_other_day: 'Try a different day',
  stat_fixtures_analysed: 'Fixtures analysed',
  stat_qualifying_bets: 'Qualifying bets',
  stat_top_confidence: 'Top confidence',
  stat_avg_hit_rate: 'Average hit rate',
  stat_streak: 'Streak',
  stat_streak_both: 'Both teams streak',
  stat_lower_to_50: 'Lower to 50%',
  stat_unknown: 'Unknown',
  stat_algo_note_pre: 'Model based on recent form and historical splits.',
  stat_algo_note_post: 'Use as guidance, not certainty.',

  correct_score: 'Correct Score',
  cs_disclaimer: 'This is a statistical projection, not a guaranteed result.',

  lamaki_title: 'Comeback Bets',
  lamaki_subtitle: 'Fixtures with historical comeback patterns',
  lamaki_none: 'No comeback patterns for today',
  lamaki_none_sub: 'No strong historical comeback signals found.',
  lamaki_strong: 'Strong pattern',
  lamaki_moderate: 'Moderate pattern',
  lamaki_weak: 'Weak pattern',
  lamaki_home: 'Home comeback',
  lamaki_away: 'Away comeback',
  lamaki_both: 'Mutual comeback',
  lamaki_prob: 'probability',
  lamaki_ht_lead: 'Led at HT, lost FT',
  lamaki_comeback: 'Comeback wins',
  lamaki_triangle: 'Pattern triangle',
  lamaki_same_day_year: 'Same day, last year',
  lamaki_same_month: 'Same month',
  lamaki_exact_date: 'Exact date -2 years',

  sub_back: 'Back',
  sub_header: 'StatsWise Plans',
  sub_logged_as: 'Logged in as:',
  sub_free: 'Free',
  sub_monthly: 'Premium Monthly',
  sub_yearly: 'Premium Yearly',
  sub_cta_free: 'Current plan',
  sub_cta_monthly: 'Get Premium',
  sub_cta_yearly: 'Get Yearly',
  sub_activating: 'Activating...',
  sub_cancel: 'Cancel subscription',
  sub_cancel_anytime: 'Cancel anytime',
  sub_cancel_confirm: 'Are you sure you want to cancel?',
  sub_cancelled: 'Subscription cancelled.',
  sub_trial_ended: 'Trial ended.',
  sub_trial_choose: 'Choose a plan to continue.',
  sub_paid_active: 'Active Premium subscription',
  sub_paid_plan_monthly: 'Monthly plan',
  sub_paid_plan_yearly: 'Yearly plan',
  sub_paid_thanks: 'Thank you!',
  sub_payment_methods: 'Payment methods',
  sub_secure_payments: 'Secure payments',
  sub_secure_payments_desc: 'All payments are securely processed.',
  sub_feat_schedule: 'Match schedule',
  sub_feat_basic_stats: 'Basic statistics',
  sub_feat_btts_goals: 'BTTS and goals stats',
  sub_feat_corners_cards: 'Corners and cards stats',
  sub_feat_last10: 'Last 10 matches data',
  sub_feat_high_prob: 'High-probability tips',
  sub_feat_all_stats: 'All stat modules',
  sub_feat_all_stats_full: 'Extended historical data',
  sub_feat_alt: 'ALT line controls',
  sub_feat_filters: 'League filters and views',
  sub_feat_priority: 'Priority support',
  sub_feat_all_monthly: 'Everything in monthly plan',
  sub_feat_priority_updates: 'Priority feature updates',
  sub_feat_early_access: 'Early access to features',
  sub_faq_title: 'FAQ',
  sub_faq_cancel_q: 'Can I cancel anytime?',
  sub_faq_cancel_a: 'Yes, you can cancel at any time.',
  sub_faq_data_q: 'Is my data safe?',
  sub_faq_data_a: 'Yes. We do not store card details.',
  sub_faq_lamaki_q: 'What are comeback bets?',
  sub_faq_lamaki_a: 'They are fixtures with strong comeback patterns.',
  sub_save_badge: 'Save 25%',
  sub_per_month: '/ month',
  sub_per_month_yearly: '/ month, billed yearly',
  sub_success_monthly: 'Monthly subscription activated!',
  sub_success_yearly: 'Yearly subscription activated!',

  dash_plan: 'Subscription',
  dash_profile: 'Profile',
  dash_password: 'Change password',
  dash_logout: 'Log out',
  dash_support_email: 'Support',
  dash_current_plan: 'CURRENT PLAN',
  dash_upgrade: 'Upgrade',
  dash_trial_time: 'Trial time',
  dash_plan_label: 'Plan',
  dash_expires: 'Expires',
  dash_no_data: 'No data',
  dash_free_trial_title: '7-day free trial',
  dash_free_trial_desc: 'Try all premium features for free.',
  dash_start_trial: 'Start trial',
  dash_cancel_confirm_click: 'Click again to confirm cancellation',
  dash_cancel_done: 'Subscription will be cancelled at period end.',
  dash_tier_free: 'Free',
  dash_tier_trial: 'Trial ({n} days)',
  dash_tier_paid_monthly: 'Premium Monthly',
  dash_tier_paid_yearly: 'Premium Yearly',
  dash_yearly: 'Yearly',
  dash_monthly: 'Monthly',
  dash_change_pw: 'CHANGE PASSWORD',
  dash_old_pw: 'Current password',
  dash_new_pw: 'New password',
  dash_confirm_pw: 'Confirm new password',
  dash_save_pw: 'Save password',
  dash_saving: 'Saving...',
  dash_pw_min: 'Password must have at least 8 characters.',
  dash_pw_mismatch: 'Passwords do not match.',
  dash_pw_empty: 'Current password is required.',
  dash_pw_success: 'Password changed successfully.',
  dash_pw_error: 'Could not change password.',
  dash_country: 'Country',
  dash_currency_auto: 'Currency auto-detected by country',
  dash_save: 'Save',
  dash_saved: 'Saved',
}

const LangContext = createContext(null)

export function LangProvider({ children }) {
  const lang = 'en'

  function setLang() {
    // Single language mode.
  }

  function t(key) {
    return EN[key] || key
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t, LANGUAGES }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside LangProvider')
  return ctx
}

