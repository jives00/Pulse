// Dashboard type scale — the single source of font sizes for the dashboard page,
// its goal cards, and its editor chrome.
//
// Before this existed each widget picked its own pixel value, so the same role
// (a stat label, a legend, a KPI) rendered at anywhere from 8px to 15px depending
// on which component drew it. Pick the token that matches the *role*; don't add a
// new size without adding a token for it here.
export const T = {
  /** Uppercase micro labels sitting above a stat ("30-day avg", "Best day"). */
  label: 11,
  /** Mono meta, chart legends, table headers, secondary rows. */
  small: 13,
  /** Default reading size inside a panel — names, list rows, table cells. */
  body: 15,
  /** Panel / goal-card headings ("Weekly averages"). Same size as body but
   *  distinguished by the uppercase `.micro` treatment. */
  cardTitle: 15,
  /** Band headings and inline section titles. */
  title: 20,
  /** Secondary KPI numbers that sit beside a primary one (TDEE, calories in). */
  sub: 22,
  /** The primary number in a panel. */
  kpi: 26,
  /** The single largest number on the page (net vs TDEE). */
  hero: 42,
} as const;
