// Single source of truth for the platform's tool taxonomy.
// Used by both the HomePage cards and the sidebar accordion so they stay in sync.

export interface NavTool {
  to?: string          // route; omitted for in-development features
  label: string        // display name
  short: string        // mobile bottom-bar label
  glyph: string        // emoji/glyph icon
  desc: string         // card blurb + nav tooltip
  dev?: boolean        // in development (non-clickable)
}

export interface NavSection {
  heading: string
  glyph: string        // section icon (sidebar + homepage)
  caption: string      // section subtitle on the homepage
  tools: NavTool[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Research & Data',
    glyph: '📊',
    caption: 'Unified FEC (federal) + MEC (Missouri) campaign-finance intelligence.',
    tools: [
      { to: '/candidates',   label: 'Federal Candidates', short: 'FED',    glyph: '🏛', desc: 'Browse and search Missouri federal candidates — party, office sought, and money raised.' },
      { to: '/mo-candidates', label: 'MO Candidates',      short: 'MO',     glyph: '🗳', desc: 'State-level candidates & committees from MEC filings, with financials and top donors.' },
      { to: '/committees',    label: 'Committees',         short: 'CMTE',   glyph: '🏦', desc: 'PACs, party and campaign committees — affiliation, treasurer info, and total receipts.' },
      { to: '/donors',        label: 'Donors',             short: 'DONORS', glyph: '💵', desc: 'Search contribution records by name, employer, ZIP, or radius. Filter and export to CSV.' },
    ],
  },
  {
    heading: 'Fundraising Tools',
    glyph: '💰',
    caption: 'Turn the data into ranked call targets, branded outreach, and a working pipeline.',
    tools: [
      { to: '/prospects',     label: 'Prospects',     short: 'PROS',  glyph: '🎯', desc: 'Score & rank donors for your candidate — RFM, capacity, and party/district/industry/issue fit.' },
      { to: '/fundraising-lists', label: 'Fundraising Lists', short: 'LISTS', glyph: '📋', desc: 'Ready-made donor lists: look-alikes of a committee’s donors, lapsed donors to win back, and sustainer-conversion targets.' },
      { to: '/contacts',      label: 'Contacts',      short: 'CONT',  glyph: '📇', desc: 'Paste names + contact info; auto-match to donor profiles so it auto-fills on call sheets.' },
      { to: '/rolodex-admin', label: 'Call Time App',  short: 'ROLO',  glyph: '📱', desc: 'Hand a candidate or caller a phone app that matches their contacts to donor profiles — partisan lean, recommended ask, and who to call today. Manage clients, install links, and see usage.' },
      { to: '/contacts-without-names', label: 'Contacts Without Names', short: 'NONAME', glyph: '🕵', desc: 'Emails from mailing lists with no name attached — couldn’t match to a donor. Review the guessed names and attribute them.' },
      { to: '/email-harvester', label: 'Email Harvester', short: 'HARV', glyph: '📧', desc: 'Find publicly-published emails for a region & niche, verify them, and auto-cross-match each to a donor profile. Runs nightly too.' },
      { to: '/watchlist',     label: 'Watchlist',     short: 'WATCH', glyph: '☆', desc: 'Tag and move donors through stages — Prospect → Contacted → Warm → Committed — with notes.' },
      { to: '/email-builder', label: 'Email Builder', short: 'MAIL',  glyph: '✉', desc: 'Compose Mailchimp-ready fundraising blasts, auto-branded from a candidate website.' },
    ],
  },
  {
    heading: 'Info. & Analysis',
    glyph: '🔗',
    caption: 'See the relationships and follow the money.',
    tools: [
      { to: '/network',     label: 'Network',     short: 'NET',  glyph: '🕸', desc: 'Map donor-to-PAC relationships; compare committees to find shared donors.' },
      { to: '/flow',        label: 'Money Flow',  short: 'FLOW', glyph: '💸', desc: 'Trace money from donors through a committee to its expenditure categories.' },
      { to: '/legislature', label: 'Legislature', short: 'LEG',  glyph: '⚖', desc: 'Missouri House members, bills, and committees correlated with MEC finance data.' },
      { to: '/dpi-map',     label: 'DPI Map',     short: 'MAP',  glyph: '🗺', desc: 'Interactive Missouri map — partisan lean (DPI), turnout, and population projections by county, district, precinct, township, and school district.' },
      { to: '/verifications', label: 'Verifications', short: 'VERIFY', glyph: '✓', desc: 'Cross-check donors against authoritative public records (voter files, etc.). Confirmed matches get a green ✓ badge; review name-only matches here to approve or reject.' },
    ],
  },
  {
    heading: 'In Development',
    glyph: '🚧',
    caption: 'The editorial analytical layer plus new planning tools — shipping soon.',
    tools: [
      { label: 'Campaign Math',   short: 'CALC', glyph: '🧮', dev: true, desc: 'Plug in your district and turnout to get your win number, then the budget, call-time, and voter-contact math to hit it — wired to our DPI and donor data.' },
      { label: 'Bill Brief',      short: 'BILL', glyph: '📄', dev: true, desc: 'A four-panel dossier per bill: donor industries behind the sponsor, timing, lobbyist overlap, and vote alignment.' },
      { label: 'Career Timeline', short: 'CRER', glyph: '📈', dev: true, desc: 'A per-legislator temporal view of how their donor portfolio shifts across cycles.' },
      { label: 'Anomaly Index',   short: 'ANOM', glyph: '⚠', dev: true, desc: 'Front-door scoring that surfaces the bills and legislators where the money looks unusual.' },
    ],
  },
]

// Flat list of clickable tools (for the mobile bottom bar).
export const NAV_TOOLS_FLAT: NavTool[] = NAV_SECTIONS.flatMap(s => s.tools).filter(t => t.to && !t.dev)
