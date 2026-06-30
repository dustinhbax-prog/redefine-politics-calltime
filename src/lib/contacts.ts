// Pull contacts off the device. Two paths, auto-detected:
//  • Android Chrome exposes the Contact Picker API (navigator.contacts.select) —
//    a native permission sheet where the user multi-selects who to share.
//  • Everywhere else (notably iOS Safari, which has NO contacts API) the user
//    exports a vCard (.vcf) from their phone and we parse it in the browser.
import type { RawContact } from '../api/rolodex'
import { Capacitor } from '@capacitor/core'

// ── Native (Capacitor) contacts ───────────────────────────────────────────────
// On the native iOS/Android app this is the primary path: a real OS permission
// prompt + the full address book, no manual export. On the web it's never used
// (isNativePlatform() is false) and the @capacitor-community/contacts module is
// only dynamically imported inside the native branch, so it never ships to web.
export function nativeContactsAvailable(): boolean {
  return Capacitor.isNativePlatform()
}

export async function getNativeContacts(): Promise<RawContact[]> {
  const { Contacts } = await import('@capacitor-community/contacts')
  const perm = await Contacts.requestPermissions()
  if (perm.contacts !== 'granted') {
    throw new Error('Contacts permission was not granted.')
  }
  const res = await Contacts.getContacts({
    projection: { name: true, phones: true, emails: true, postalAddresses: true },
  })
  return res.contacts
    .map((c): RawContact => {
      const a = c.postalAddresses?.[0]
      const name = c.name?.display ||
        [c.name?.given, c.name?.family].filter(Boolean).join(' ')
      return {
        name,
        phone: c.phones?.[0]?.number || '',
        email: c.emails?.[0]?.address || '',
        street: a?.street || '',
        city: a?.city || '',
        state: a?.region || '',
        zip: a?.postcode || '',
      }
    })
    .filter(c => (c.name || '').trim().length > 0)
}

export function contactPickerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window
}

export async function pickContacts(): Promise<RawContact[]> {
  // @ts-expect-error — experimental API
  const supported: string[] = await navigator.contacts.getProperties?.() ?? ['name', 'tel', 'email', 'address']
  const props = ['name', 'tel', 'email', 'address'].filter(p => supported.includes(p))
  // @ts-expect-error — experimental API
  const picked = await navigator.contacts.select(props, { multiple: true })
  return picked.map((c: any): RawContact => {
    const addr = Array.isArray(c.address) && c.address[0] ? c.address[0] : null
    return {
      name: Array.isArray(c.name) ? c.name[0] : c.name,
      phone: Array.isArray(c.tel) ? c.tel[0] : c.tel,
      email: Array.isArray(c.email) ? c.email[0] : c.email,
      street: addr ? (addr.addressLine?.join(' ') || '') : '',
      city: addr?.city || '',
      state: addr?.region || '',
      zip: addr?.postalCode || '',
    }
  })
}

// ── vCard (.vcf) parser ─────────────────────────────────────────────────────
// Handles the common shape iOS/Google export: FN, TEL, EMAIL, ADR (with TYPE
// params and folded continuation lines). Good enough for matching — we only need
// name + a contact method + maybe an address.
export function parseVCard(text: string): RawContact[] {
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
  const blocks = unfolded.split(/BEGIN:VCARD/i).slice(1)
  const out: RawContact[] = []
  for (const block of blocks) {
    const lines = block.split(/\r?\n/)
    const c: RawContact = {}
    for (const line of lines) {
      const idx = line.indexOf(':')
      if (idx < 0) continue
      const rawKey = line.slice(0, idx)
      const value = line.slice(idx + 1).trim()
      const key = rawKey.split(';')[0].toUpperCase()
      if (!value) continue
      if (key === 'FN' && !c.name) c.name = value
      else if (key === 'N' && !c.name) {
        // N: Last;First;Middle;Prefix;Suffix
        const [last, first] = value.split(';')
        c.name = `${(first || '').trim()} ${(last || '').trim()}`.trim()
      } else if (key === 'TEL' && !c.phone) c.phone = value
      else if (key === 'EMAIL' && !c.email) c.email = value
      else if (key === 'ADR' && !c.street) {
        // ADR: POBox;Ext;Street;City;Region;Postal;Country
        const parts = value.split(';')
        c.street = (parts[2] || '').trim()
        c.city = (parts[3] || '').trim()
        c.state = (parts[4] || '').trim()
        c.zip = (parts[5] || '').trim()
      }
    }
    if (c.name || c.phone || c.email) out.push(c)
  }
  return out
}

// Normalize a US state name/abbr to a 2-letter code (Contact Picker / vCard often
// return full names). Returns the input upper-cased if not recognized.
const STATE_TO_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA',
  washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
}

export function normalizeState(s?: string): string {
  const v = (s || '').trim()
  if (!v) return ''
  if (v.length === 2) return v.toUpperCase()
  return STATE_TO_ABBR[v.toLowerCase()] || v.toUpperCase()
}
