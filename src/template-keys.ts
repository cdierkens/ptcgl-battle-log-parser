/**
 * The load-bearing `blog_loc_*` template keys.
 *
 * Which keys the parser gives meaning to used to be discoverable only by
 * reading every module — the phase headers in parse-battle-log, the
 * opening-hand reveal in detect-players, the summary rules — and each one
 * typed the raw string, as did the tests. This module names the set once, so
 * a consumer states its intent instead of a string, and a typo in a key is a
 * compile error rather than a silent no-match.
 *
 * The keys are the game client's, not this project's. They move when the game
 * moves, which is exactly why this list is not exported from the package
 * entry point.
 */

export const templateKeys = {
  drawOpeningHand: "blog_loc_draw_opening_hand",
  drawnCardsGridHeader: "blog_loc_drawn_cards_grid_header",
  endGame: "blog_loc_end_game",
  knockout: "blog_loc_knockout",
  phaseCheckup: "blog_loc_phase_checkup",
  phaseSetup: "blog_loc_phase_setup",
  phaseTurn: "blog_loc_phase_turn",
  tookPrizeCards: "blog_loc_took_prize_cards",
  tookSinglePrizeCard: "blog_loc_took_single_prize_card",
} as const;