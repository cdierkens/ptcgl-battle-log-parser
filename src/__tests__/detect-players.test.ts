/**
 * Player-identification tests.
 *
 * The whole of `detectPlayers` hangs off one inference: the opening-hand
 * reveal is the only point the game discloses which side is local. These
 * tests pin that inference and, just as importantly, pin the three ways it
 * can fail — callers need to distinguish "no data" from "ambiguous" to
 * decide whether to prompt for a name.
 */

import { describe, expect, it } from "vitest";

import { detectPlayers } from "../detect-players.js";
import { PlayerDetectionError, unwrap } from "../errors.js";
import { parseBattleLog } from "../parse-battle-log.js";
import { isErr, isOk } from "../result.js";

/** Local player went second: mulligans reveal the local hand. */
const REVEAL_LOG = `Setup
Izunzun chose tails for the opening coin flip.
cdierkens won the coin toss.
cdierkens decided to go first.
Izunzun drew 7 cards for the opening hand.
- 7 drawn cards.
cdierkens drew 7 cards for the opening hand.
- 7 drawn cards.
   • Dipplin, Applin, Ultra Ball, Boss's Orders, Festival Grounds, Buddy-Buddy Poffin
Izunzun took a mulligan.
- Cards revealed from Mulligan 1
   • Poké Pad, Buddy-Buddy Poffin, Rare Candy, Special Red Card
cdierkens drew 1 more card because Izunzun took at least 1 mulligan.
- cdierkens drew Secret Box.
Izunzun played Munkidori to the Active Spot.
cdierkens played Applin to the Active Spot.

cdierkens's Turn
cdierkens drew a card.
cdierkens ended their turn.

Izunzun's Turn
Izunzun drew a card.
Izunzun ended their turn.
`;

/** Both players present, but no opening hand was revealed — inference fails. */
const NO_REVEAL_LOG = `Setup
Izunzun chose tails for the opening coin flip.
cdierkens won the coin toss.
cdierkens decided to go first.
Izunzun drew 7 cards for the opening hand.
- 7 drawn cards.
cdierkens drew 7 cards for the opening hand.
- 7 drawn cards.
Izunzun played Munkidori to the Active Spot.
cdierkens played Applin to the Active Spot.

cdierkens's Turn
cdierkens drew a card.
cdierkens ended their turn.
`;

const SINGLE_PLAYER_LOG = `Setup
cdierkens chose tails for the opening coin flip.
cdierkens decided to go first.
cdierkens drew 7 cards for the opening hand.
- 7 drawn cards.
   • Dipplin, Applin, Ultra Ball, Boss's Orders
cdierkens played Applin to the Active Spot.

cdierkens's Turn
cdierkens drew Lillie's Determination.
cdierkens ended their turn.
`;

describe("detectPlayers", () => {
  it("identifies the local player from the opening-hand reveal", () => {
    const result = detectPlayers(unwrap(parseBattleLog(REVEAL_LOG)));
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual({
      playerName: "cdierkens",
      opponentName: "Izunzun",
    });
  });

  it("returns ambiguous when two players are present but no local hand is revealed", () => {
    const result = detectPlayers(unwrap(parseBattleLog(NO_REVEAL_LOG)));
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(PlayerDetectionError);
    expect(result.error._tag).toBe("PlayerDetectionError");
    expect(result.error.reason).toBe("ambiguous");
  });

  it("returns single-player when only one name appears", () => {
    const result = detectPlayers(unwrap(parseBattleLog(SINGLE_PLAYER_LOG)));
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.reason).toBe("single-player");
  });

  it("returns no-players-found for an empty parsed log", () => {
    const result = detectPlayers({ phases: [] });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.reason).toBe("no-players-found");
  });

  it("ignores an opening draw whose sub-entry has no sub-string", () => {
    // The grid header alone is printed for every opening draw. Only the
    // card list underneath marks an actual reveal — treating the header as
    // a reveal would make every player a candidate.
    const result = detectPlayers(unwrap(parseBattleLog(NO_REVEAL_LOG)));
    if (!isErr(result)) throw new Error("expected failure");
    expect(result.error.reason).toBe("ambiguous");
  });

  it("carries a usable message on the error", () => {
    const result = detectPlayers({ phases: [] });
    if (!isErr(result)) throw new Error("expected failure");
    expect(result.error.message).toContain("no-players-found");
    expect(result.error.name).toBe("PlayerDetectionError");
  });
});
