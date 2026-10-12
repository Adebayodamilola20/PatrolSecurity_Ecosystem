/**
 * Sample data for the finance screens while they are UI-only.
 *
 * Every figure here is invented to show the layout. None of it is read from or
 * written to the backend. When a screen is wired up, its import from this file
 * is replaced by a real query and the data here is deleted.
 */

export const SPLIT = { hq: 0.08, vat: 0.075, partner: 0.345, salary: 0.5 } as const

export function splitOf(amount: number) {
  const hq = Math.round(amount * SPLIT.hq)
  const vat = Math.round(amount * SPLIT.vat)
  const partner = Math.round(amount * SPLIT.partner)
  // Any rounding remainder goes to salary, so the four always add up exactly.
  return { hq, vat, partner, salary: amount - hq - vat - partner }
}

export const MONTH = 'October 2026'

export type Branch = {
  id: string
  name: string
  isHq?: boolean
  partner: string
  clients: number
  guards: number
  collected: number
  outstanding: number
  held?: boolean
}

export const BRANCHES: Branch[] = [
  { id: 'jos', name: 'Jos', isHq: true, partner: 'Head Office', clients: 14, guards: 182, collected: 12_480_000, outstanding: 2_150_000 },
  { id: 'abuja', name: 'Abuja', partner: 'Ibrahim Danladi', clients: 11, guards: 146, collected: 10_920_000, outstanding: 1_760_000 },
  { id: 'lagos', name: 'Lagos', partner: 'Chidinma Okafor', clients: 9, guards: 121, collected: 9_640_000, outstanding: 3_410_000 },
  { id: 'ph', name: 'Port Harcourt', partner: 'Tamuno Briggs', clients: 7, guards: 88, collected: 6_200_000, outstanding: 940_000, held: true },
  { id: 'owerri', name: 'Owerri', partner: 'Emeka Nwosu', clients: 5, guards: 54, collected: 3_780_000, outstanding: 620_000 },
  { id: 'yola', name: 'Yola', partner: 'Aisha Bello', clients: 4, guards: 41, collected: 2_860_000, outstanding: 0 },
  { id: 'lafia', name: 'Lafia', partner: 'Musa Agbo', clients: 3, guards: 30, collected: 2_100_000, outstanding: 450_000 },
]

export type Partner = {
  name: string
  branch: string
  bank: string
  account: string
  paidThisMonth: number
  status: 'active' | 'pending_approval'
  since: string
}

export const PARTNERS: Partner[] = [
  { name: 'Ibrahim Danladi', branch: 'Abuja', bank: 'Zenith Bank', account: '2081 •••• 41', paidThisMonth: 3_767_400, status: 'active', since: 'Mar 2024' },
  { name: 'Chidinma Okafor', branch: 'Lagos', bank: 'GTBank', account: '0174 •••• 08', paidThisMonth: 3_325_800, status: 'active', since: 'Jan 2023' },
  { name: 'Tamuno Briggs', branch: 'Port Harcourt', bank: 'Access Bank', account: '0692 •••• 77', paidThisMonth: 2_139_000, status: 'active', since: 'Aug 2024' },
  { name: 'Emeka Nwosu', branch: 'Owerri', bank: 'First Bank', account: '3045 •••• 19', paidThisMonth: 1_304_100, status: 'active', since: 'Feb 2025' },
  { name: 'Aisha Bello', branch: 'Yola', bank: 'UBA', account: '1023 •••• 56', paidThisMonth: 986_700, status: 'active', since: 'Jun 2025' },
  { name: 'Musa Agbo', branch: 'Lafia', bank: 'Fidelity Bank', account: '6310 •••• 82', paidThisMonth: 724_500, status: 'pending_approval', since: 'Sep 2026' },
]

export type Client = {
  name: string
  branch: string
  bankName: string
  accountNumber: string
  guards: number
  monthlyValue: number
  balance: number
  status: 'active' | 'held' | 'ending'
  contractEnds: string
}

export const CLIENTS: Client[] = [
  { name: 'Rayfield Estate', branch: 'Jos', bankName: 'Moniepoint MFB', accountNumber: '6012 4489 01', guards: 24, monthlyValue: 1_680_000, balance: 0, status: 'active', contractEnds: 'Dec 2027' },
  { name: 'Plateau Grand Mall', branch: 'Jos', bankName: 'Wema Bank', accountNumber: '7810 2235 64', guards: 18, monthlyValue: 1_260_000, balance: 1_260_000, status: 'active', contractEnds: 'Mar 2027' },
  { name: 'Maitama Court Apartments', branch: 'Abuja', bankName: 'Moniepoint MFB', accountNumber: '6012 4490 77', guards: 16, monthlyValue: 1_440_000, balance: 0, status: 'active', contractEnds: 'Jul 2027' },
  { name: 'Lekki Phase 1 Residents', branch: 'Lagos', bankName: 'Wema Bank', accountNumber: '7810 2241 19', guards: 30, monthlyValue: 2_700_000, balance: 1_350_000, status: 'active', contractEnds: 'Jan 2028' },
  { name: 'Trans-Amadi Depot', branch: 'Port Harcourt', bankName: 'Moniepoint MFB', accountNumber: '6012 4502 38', guards: 12, monthlyValue: 1_020_000, balance: 0, status: 'held', contractEnds: 'Nov 2026' },
  { name: 'Ikenegbu Hotel', branch: 'Owerri', bankName: 'Wema Bank', accountNumber: '7810 2250 93', guards: 8, monthlyValue: 640_000, balance: 640_000, status: 'active', contractEnds: 'Oct 2026' },
  { name: 'Jimeta Market Traders', branch: 'Yola', bankName: 'Moniepoint MFB', accountNumber: '6012 4511 64', guards: 10, monthlyValue: 700_000, balance: 0, status: 'active', contractEnds: 'Aug 2027' },
  { name: 'Lafia Teaching Hospital', branch: 'Lafia', bankName: 'Wema Bank', accountNumber: '7810 2263 50', guards: 9, monthlyValue: 630_000, balance: 450_000, status: 'ending', contractEnds: 'Nov 2026' },
]

export type InvoiceStatus = 'draft' | 'sent' | 'part_paid' | 'paid' | 'overdue'

export type Invoice = {
  number: string
  client: string
  branch: string
  period: string
  subtotal: number
  paid: number
  status: InvoiceStatus
  due: string
}

export const INVOICES: Invoice[] = [
  { number: 'TSL-2026-0412', client: 'Lekki Phase 1 Residents', branch: 'Lagos', period: 'Oct 2026', subtotal: 2_700_000, paid: 1_451_250, status: 'part_paid', due: '31 Oct' },
  { number: 'TSL-2026-0411', client: 'Plateau Grand Mall', branch: 'Jos', period: 'Oct 2026', subtotal: 1_260_000, paid: 0, status: 'sent', due: '31 Oct' },
  { number: 'TSL-2026-0410', client: 'Rayfield Estate', branch: 'Jos', period: 'Oct 2026', subtotal: 1_680_000, paid: 1_806_000, status: 'paid', due: '31 Oct' },
  { number: 'TSL-2026-0409', client: 'Maitama Court Apartments', branch: 'Abuja', period: 'Oct 2026', subtotal: 1_440_000, paid: 1_548_000, status: 'paid', due: '31 Oct' },
  { number: 'TSL-2026-0408', client: 'Ikenegbu Hotel', branch: 'Owerri', period: 'Sep 2026', subtotal: 640_000, paid: 0, status: 'overdue', due: '30 Sep' },
  { number: 'TSL-2026-0407', client: 'Lafia Teaching Hospital', branch: 'Lafia', period: 'Sep 2026', subtotal: 630_000, paid: 225_750, status: 'overdue', due: '30 Sep' },
  { number: 'TSL-2026-0413', client: 'Jimeta Market Traders', branch: 'Yola', period: 'Nov 2026', subtotal: 700_000, paid: 0, status: 'draft', due: '30 Nov' },
  { number: 'TSL-2026-0406', client: 'Trans-Amadi Depot', branch: 'Port Harcourt', period: 'Oct 2026', subtotal: 1_020_000, paid: 1_096_500, status: 'paid', due: '31 Oct' },
]

export const VAT_RATE = 0.075
export const invoiceTotal = (inv: Invoice) => Math.round(inv.subtotal * (1 + VAT_RATE))

export type Payment = {
  ref: string
  client: string
  branch: string
  amount: number
  receivedAt: string
  state: 'split' | 'held'
}

export const PAYMENTS: Payment[] = [
  { ref: 'MNFY|8812|041', client: 'Lekki Phase 1 Residents', branch: 'Lagos', amount: 1_451_250, receivedAt: 'Today, 10:42', state: 'split' },
  { ref: 'MNFY|8811|977', client: 'Rayfield Estate', branch: 'Jos', amount: 1_806_000, receivedAt: 'Today, 09:15', state: 'split' },
  { ref: 'MNFY|8807|203', client: 'Trans-Amadi Depot', branch: 'Port Harcourt', amount: 1_096_500, receivedAt: 'Yesterday, 16:30', state: 'held' },
  { ref: 'MNFY|8802|660', client: 'Maitama Court Apartments', branch: 'Abuja', amount: 1_548_000, receivedAt: '9 Oct, 11:02', state: 'split' },
  { ref: 'MNFY|8798|114', client: 'Lafia Teaching Hospital', branch: 'Lafia', amount: 225_750, receivedAt: '7 Oct, 14:48', state: 'split' },
  { ref: 'MNFY|8790|582', client: 'Jimeta Market Traders', branch: 'Yola', amount: 752_500, receivedAt: '3 Oct, 08:20', state: 'split' },
]

export type Stage = 'applied' | 'screening' | 'interview' | 'training' | 'hired'

export const STAGES: { key: Stage; label: string }[] = [
  { key: 'applied', label: 'Applied' },
  { key: 'screening', label: 'Screening' },
  { key: 'interview', label: 'Interview' },
  { key: 'training', label: 'Training' },
  { key: 'hired', label: 'Hired' },
]

export type Applicant = {
  name: string
  branch: string
  stage: Stage
  applied: string
  guarantor: 'verified' | 'pending' | 'missing'
}

export const APPLICANTS: Applicant[] = [
  { name: 'Yakubu Dauda', branch: 'Jos', stage: 'applied', applied: '10 Oct', guarantor: 'missing' },
  { name: 'Blessing Udoh', branch: 'Lagos', stage: 'applied', applied: '9 Oct', guarantor: 'missing' },
  { name: 'Samuel Gyang', branch: 'Jos', stage: 'screening', applied: '6 Oct', guarantor: 'pending' },
  { name: 'Hauwa Sani', branch: 'Abuja', stage: 'screening', applied: '5 Oct', guarantor: 'pending' },
  { name: 'Kelechi Eze', branch: 'Owerri', stage: 'interview', applied: '2 Oct', guarantor: 'verified' },
  { name: 'Tunde Ajayi', branch: 'Lagos', stage: 'interview', applied: '1 Oct', guarantor: 'pending' },
  { name: 'Grace Pam', branch: 'Jos', stage: 'training', applied: '22 Sep', guarantor: 'verified' },
  { name: 'Abdullahi Musa', branch: 'Yola', stage: 'training', applied: '20 Sep', guarantor: 'verified' },
  { name: 'Joy Amadi', branch: 'Port Harcourt', stage: 'hired', applied: '12 Sep', guarantor: 'verified' },
]

export type StaffMember = {
  name: string
  staffId: string
  branch: string
  role: 'Guard' | 'Supervisor' | 'Admin'
  site: string
  status: 'active' | 'leave' | 'suspended'
  guarantor: 'verified' | 'pending'
  basic: number
}

export const STAFF: StaffMember[] = [
  { name: 'Musa Ibrahim', staffId: 'TSL-0142', branch: 'Jos', role: 'Guard', site: 'Rayfield Estate', status: 'active', guarantor: 'verified', basic: 85_000 },
  { name: 'Ngozi Eze', staffId: 'TSL-0151', branch: 'Jos', role: 'Supervisor', site: 'Plateau Grand Mall', status: 'active', guarantor: 'verified', basic: 140_000 },
  { name: 'Danjuma Pam', staffId: 'TSL-0163', branch: 'Jos', role: 'Guard', site: 'Plateau Grand Mall', status: 'leave', guarantor: 'verified', basic: 85_000 },
  { name: 'Femi Adeyemi', staffId: 'TSL-0207', branch: 'Lagos', role: 'Guard', site: 'Lekki Phase 1 Residents', status: 'active', guarantor: 'verified', basic: 95_000 },
  { name: 'Usman Garba', staffId: 'TSL-0219', branch: 'Abuja', role: 'Guard', site: 'Maitama Court Apartments', status: 'active', guarantor: 'pending', basic: 90_000 },
  { name: 'Ifeanyi Obi', staffId: 'TSL-0231', branch: 'Owerri', role: 'Guard', site: 'Ikenegbu Hotel', status: 'suspended', guarantor: 'verified', basic: 80_000 },
  { name: 'Amina Yusuf', staffId: 'TSL-0244', branch: 'Yola', role: 'Admin', site: 'Branch office', status: 'active', guarantor: 'verified', basic: 120_000 },
  { name: 'Peter Okon', staffId: 'TSL-0258', branch: 'Port Harcourt', role: 'Guard', site: 'Trans-Amadi Depot', status: 'active', guarantor: 'verified', basic: 90_000 },
]

export type Shift = 'D' | 'N' | 'O'
export const DAYS = ['Mon 13', 'Tue 14', 'Wed 15', 'Thu 16', 'Fri 17', 'Sat 18', 'Sun 19']

export const ROSTER: { name: string; site: string; week: Shift[] }[] = [
  { name: 'Musa Ibrahim', site: 'Rayfield Estate', week: ['D', 'D', 'D', 'O', 'N', 'N', 'O'] },
  { name: 'Grace Pam', site: 'Rayfield Estate', week: ['N', 'N', 'O', 'D', 'D', 'D', 'O'] },
  { name: 'Yusuf Bala', site: 'Rayfield Estate', week: ['O', 'D', 'D', 'N', 'N', 'O', 'D'] },
  { name: 'Ngozi Eze', site: 'Plateau Grand Mall', week: ['D', 'D', 'D', 'D', 'D', 'O', 'O'] },
  { name: 'Danjuma Pam', site: 'Plateau Grand Mall', week: ['O', 'O', 'O', 'O', 'O', 'O', 'O'] },
  { name: 'Samuel Choji', site: 'Plateau Grand Mall', week: ['N', 'N', 'N', 'O', 'D', 'D', 'N'] },
]

export const POSTS = [
  { site: 'Rayfield Estate', contracted: 24, filled: 24 },
  { site: 'Plateau Grand Mall', contracted: 18, filled: 16 },
  { site: 'Hill Station Hotel', contracted: 10, filled: 10 },
]

/** One payroll line. Pension 8% of basic; PAYE is an illustrative figure. */
export function payLine(basic: number, allowances: number, paye: number) {
  const gross = basic + allowances
  const pension = Math.round(basic * 0.08)
  return { gross, pension, paye, net: gross - pension - paye }
}

export const PAYROLL = [
  { name: 'Musa Ibrahim', role: 'Guard', basic: 85_000, allowances: 15_000, paye: 0 },
  { name: 'Ngozi Eze', role: 'Supervisor', basic: 140_000, allowances: 25_000, paye: 3_850 },
  { name: 'Grace Pam', role: 'Guard', basic: 85_000, allowances: 15_000, paye: 0 },
  { name: 'Danjuma Pam', role: 'Guard', basic: 85_000, allowances: 6_000, paye: 0 },
  { name: 'Yusuf Bala', role: 'Guard', basic: 85_000, allowances: 18_500, paye: 0 },
  { name: 'Samuel Choji', role: 'Guard', basic: 85_000, allowances: 21_000, paye: 0 },
].map((r) => ({ ...r, ...payLine(r.basic, r.allowances, r.paye) }))
