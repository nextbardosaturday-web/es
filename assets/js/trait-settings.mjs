// Increase to 10 or 20 when enough matches have accumulated.
// This setting controls visibility only; individual trait event requirements remain separate.
export const TRAIT_MIN_POSITION_MATCHES = 5;
export function traitAppearanceCount(rows){return rows.reduce((n,r)=>n+(r.appearanceCount??1),0);}
