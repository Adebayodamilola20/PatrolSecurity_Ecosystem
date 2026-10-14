/**
 * Finance package API (Tarmac). Money is always integer kobo here; the screens
 * convert to naira only for display and input.
 */
import { apiRequest } from './api'

const get = <T>(path: string) => apiRequest<T>(`/finance/${path}`)
const post = <T = { ok: true }>(path: string, body: unknown = {}) =>
  apiRequest<T>(`/finance/${path}`, { method: 'POST', body: JSON.stringify(body) })

export type Split = { hq: number; vat: number; partner: number; salary: number }

export type Branch = {
  id: string
  name: string
  isHq: boolean
  onHold: boolean
  holdNote: string | null
  holdReleaseOn: string | null
  splitBps: Split
  salaryBankName: string | null
  salaryAccountNumber: string | null
  salaryAccountName: string | null
  partner: { id: string; name: string } | null
  partnerWaiting: { id: string; name: string } | null
  clients: number
  staff: number
  collectedKobo: number
  owedKobo: number
}

export type Partner = {
  id: string
  name: string
  phone: string
  email: string | null
  branchId: string
  branchName: string
  bankName: string
  bankCode: string | null
  accountNumber: string
  accountName: string
  status: 'pending' | 'active'
  paidThisMonthKobo: number
}

export type Client = {
  id: string
  name: string
  branchId: string
  branchName: string
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  monthlyFeeKobo: number
  guards: number
  contractEnd: string | null
  status: 'active' | 'ended'
  payBankName: string | null
  payAccountNumber: string | null
  payAccountName: string | null
  payProvider: 'monnify' | 'manual' | null
  owedKobo: number
}

export type InvoiceStatus = 'draft' | 'sent' | 'part_paid' | 'paid' | 'cancelled'
export type InvoiceLine = { description: string; quantity: number; unitKobo: number }

export type Invoice = {
  id: string
  number: string
  clientId: string
  clientName: string
  branchName: string
  period: string
  periodLabel: string
  lines: InvoiceLine[]
  subtotalKobo: number
  vatKobo: number
  totalKobo: number
  paidKobo: number
  balanceKobo: number
  status: InvoiceStatus
  overdue: boolean
  dueDate: string
  notes: string | null
}

export type InvoiceDetail = Invoice & {
  client: {
    name: string
    contactName: string | null
    address: string | null
    phone: string | null
    email: string | null
    payBankName: string | null
    payAccountNumber: string | null
    payAccountName: string | null
  } | null
}

export type ClientDetail = Client & {
  invoices: { id: string; number: string; period: string; totalKobo: number; paidKobo: number; status: InvoiceStatus; dueDate: string }[]
  payments: { id: string; amountKobo: number; receivedAt: number; reference: string; state: 'held' | 'shared' }[]
}

export type Payment = {
  id: string
  clientId: string
  clientName: string
  branchId: string
  branchName: string
  amountKobo: number
  receivedAt: number
  reference: string
  source: 'manual' | 'monnify'
  method: string | null
  note: string | null
  state: 'held' | 'shared'
  split: Split
  partnerName: string | null
  unallocatedKobo: number
  payouts: { share: Share; status: PayoutStatus; amountKobo: number; toName: string | null; waitingFor: string | null }[]
}

export type Share = 'hq' | 'vat' | 'partner' | 'salary'
export type PayoutStatus = 'waiting' | 'ready' | 'sending' | 'needs_code' | 'sent' | 'failed'

export type Payout = {
  id: string
  share: Share
  shareLabel: string
  amountKobo: number
  status: PayoutStatus
  toName: string | null
  waitingFor: string | null
  bankName: string | null
  accountNumber: string | null
  accountName: string | null
  reference: string | null
  error: string | null
  branchName: string
  clientName: string
  createdAt: number
  sentAt: number | null
}

export type Payouts = {
  autoSend: boolean
  ready: boolean
  counts: { waiting: number; ready: number; sending: number; needsCode: number; failed: number }
  readyKobo: number
  waitingKobo: number
  sentThisMonthKobo: number
  open: Payout[]
  sent: Payout[]
}

export type Bank = { code: string; name: string }
export type CheckedAccount = { bankCode: string; bankName: string; accountNumber: string; accountName: string }

export type MoneySettings = {
  autoSend: boolean
  sendDay: number | null
  vatOnInvoices: boolean
  walletAccountNumber: string | null
  hq: CheckedAccount | null
  vat: CheckedAccount | null
}

export type MoneyCheck = {
  day: string
  ranAt: number
  ok: boolean
  lines: { tone: 'good' | 'warn' | 'bad'; text: string }[]
  recovered: number
}

export type StaffRole = 'guard' | 'supervisor' | 'office'
export type StaffStatus = 'active' | 'leave' | 'suspended' | 'left'

export type Staff = {
  id: string
  name: string
  staffNo: string
  phone: string | null
  branchId: string
  branchName: string
  role: StaffRole
  post: string | null
  status: StaffStatus
  startDate: string | null
  basicKobo: number
  allowancesKobo: number
  nhf: boolean
  bankName: string | null
  accountNumber: string | null
  accountName: string | null
  bankChecked: boolean
  photoUrl: string | null
  pensionPin: string | null
  guarantorName: string | null
  guarantorPhone: string | null
  guarantorVerified: boolean
}

export type ApplicantStage = 'applied' | 'screening' | 'interview' | 'training' | 'hired' | 'rejected'

export type Applicant = {
  id: string
  name: string
  phone: string | null
  branchId: string
  branchName: string
  stage: ApplicantStage
  appliedOn: string
  guarantorName: string | null
  guarantorPhone: string | null
  guarantorVerified: boolean
  notes: string | null
}

export type Shift = 'day' | 'night' | 'off'

export type RosterWeek = {
  days: string[]
  people: { staffId: string; name: string; post: string | null; status: StaffStatus; shifts: (Shift | null)[] }[]
}

export type PayrollLine = {
  staffId: string
  name: string
  staffNo: string
  role: string
  bankName?: string
  accountNumber?: string
  basic: number
  allowances: number
  gross: number
  pension: number
  nhf: number
  paye: number
  net: number
  employerPension: number
  cost: number
}

export type Payroll = {
  branchName: string
  period: string
  periodLabel: string
  runId: string | null
  status: 'none' | 'draft' | 'approved' | 'paid'
  lines: PayrollLine[]
  totals: { gross: number; pension: number; nhf: number; paye: number; net: number; employerPension: number; cost: number }
  salaryAvailableKobo: number
  missingBank: string[]
  salaryBankName: string | null
  salaryAccountNumber: string | null
}

export type Overview = {
  period: string
  periodLabel: string
  receivedKobo: number
  owedKobo: number
  overdueKobo: number
  heldKobo: number
  todo: { kind: string; text: string; detail: string; to: string; urgent: boolean }[]
  latest: { id: string; clientName: string; amountKobo: number; receivedAt: number; state: 'held' | 'shared' }[]
  counts: { branches: number; clients: number }
  check: MoneyCheck | null
}

export type Reports = {
  period: string
  periodLabel: string
  byBranch: { branchName: string; payments: number; receivedKobo: number; heldKobo: number; split: Split }[]
  owed: { number: string; clientName: string; branchName: string; dueDate: string; balanceKobo: number; daysLate: number }[]
  payroll: { branchName: string; status: string; people: number; totals: Payroll['totals'] }[]
}

export const finance = {
  status: () => get<{ monnifyConnected: boolean; monnifyMode: 'test' | 'live' | null }>('status'),
  overview: () => get<Overview>('overview'),
  reports: (period: string) => get<Reports>(`reports?period=${period}`),

  branches: () => get<Branch[]>('branches'),
  createBranch: (b: { name: string; isHq: boolean; splitBps: Split; bankCode?: string; accountNumber?: string }) => post('branches/create', b),
  updateBranch: (b: { branchId: string; name?: string; bankCode?: string; accountNumber?: string; removeSalaryAccount?: boolean }) => post('branches/update', b),
  setHold: (branchId: string, onHold: boolean, note?: string, releaseOn?: string) => post('branches/hold', { branchId, onHold, note, releaseOn }),
  setSplit: (branchId: string, splitBps: Split) => post('branches/split', { branchId, splitBps }),
  removeBranch: (branchId: string) => post('branches/remove', { branchId }),

  banks: () => get<Bank[]>('banks'),
  checkAccount: (bankCode: string, accountNumber: string) => post<CheckedAccount>('banks/check', { bankCode, accountNumber }),
  settings: () => get<MoneySettings>('settings'),
  balance: () => get<{ available: true; availableKobo: number; ledgerKobo: number; at: number } | { available: false; reason: string }>('balance'),
  setMoneyAccount: (which: 'hq' | 'vat', a: { bankCode?: string; accountNumber?: string; remove?: boolean }) => post('settings/account', { which, ...a }),
  setWallet: (walletAccountNumber: string) => post('settings/wallet', { walletAccountNumber }),
  setAutoSend: (autoSend: boolean) => post('settings/auto-send', { autoSend }),
  setSendDay: (sendDay: number | null) => post('settings/send-day', { sendDay }),
  setVat: (on: boolean) => post('settings/vat', { on }),
  payouts: () => get<Payouts>('payouts'),
  sendNow: () => post<{ sent: number; waiting: number; failed: number; reason?: string }>('payouts/send-now'),
  enterCode: (payoutId: string, code: string) => post<{ state: string }>('payouts/code', { payoutId, code }),
  retryPayout: (payoutId: string) => post('payouts/retry', { payoutId }),
  lastCheck: () => get<MoneyCheck | null>('check'),
  runCheck: () => post<MoneyCheck | null>('check/run'),

  partners: () => get<Partner[]>('partners'),
  createPartner: (p: Record<string, unknown>) => post('partners/create', p),
  updatePartner: (p: Record<string, unknown>) => post('partners/update', p),
  approvePartner: (partnerId: string) => post('partners/approve', { partnerId }),
  removePartner: (partnerId: string) => post('partners/remove', { partnerId }),

  clients: () => get<Client[]>('clients'),
  client: (id: string) => get<ClientDetail | null>(`clients/get?id=${id}`),
  createClient: (c: Record<string, unknown>) => post<string>('clients/create', c),
  updateClient: (c: Record<string, unknown>) => post('clients/update', c),
  setClientAccount: (a: { clientId: string; bankName: string; accountNumber: string; accountName?: string }) => post('clients/account', a),
  createClientAccount: (clientId: string) => post<{ bankName: string; accountNumber: string }>('clients/create-account', { clientId }),
  setClientStatus: (clientId: string, status: 'active' | 'ended') => post('clients/status', { clientId, status }),

  invoices: () => get<Invoice[]>('invoices'),
  invoice: (id: string) => get<InvoiceDetail | null>(`invoices/get?id=${id}`),
  createInvoice: (i: { clientId: string; period: string; lines?: InvoiceLine[]; dueDate?: string; notes?: string }) =>
    post<{ id: string; number: string }>('invoices/create', i),
  billMonth: (period: string) => post<{ created: number; skipped: number }>('invoices/monthly', { period }),
  updateInvoice: (i: { invoiceId: string; lines: InvoiceLine[]; dueDate: string; notes?: string }) => post('invoices/update', i),
  markSent: (invoiceId: string) => post('invoices/send', { invoiceId }),
  cancelInvoice: (invoiceId: string) => post('invoices/cancel', { invoiceId }),

  payments: (period: string) =>
    get<{ period: string; payments: Payment[]; held: Payment[]; receivedKobo: number; sharedSplit: Split }>(`payments?period=${period}`),
  recordPayment: (p: { clientId: string; amountKobo: number; receivedAt: number; method?: string; reference?: string; note?: string }) =>
    post<string>('payments/record', p),
  releasePayment: (paymentId: string) => post('payments/release', { paymentId }),
  undoPayment: (paymentId: string) => post('payments/undo', { paymentId }),

  staff: () => get<Staff[]>('staff'),
  createStaff: (s: Record<string, unknown>) => post<{ id: string; staffNo: string }>('staff/create', s),
  updateStaff: (s: Record<string, unknown>) => post('staff/update', s),
  setStaffStatus: (staffId: string, status: StaffStatus) => post('staff/status', { staffId, status }),
  /** Uploads straight to storage, then attaches the file to the staff record. */
  uploadStaffPhoto: async (staffId: string, file: File) => {
    const { uploadUrl } = await post<{ uploadUrl: string }>('staff/photo-upload')
    const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type || 'image/jpeg' }, body: file })
    if (!res.ok) throw new Error('The photo did not upload. Try again.')
    const { storageId } = (await res.json()) as { storageId: string }
    return post('staff/photo', { staffId, storageId })
  },

  applicants: () => get<Applicant[]>('applicants'),
  createApplicant: (a: Record<string, unknown>) => post('applicants/create', a),
  updateApplicant: (a: Record<string, unknown>) => post('applicants/update', a),
  hireApplicant: (a: Record<string, unknown>) => post<{ staffId: string; staffNo: string }>('applicants/hire', a),

  roster: (branchId: string, day?: string) => get<RosterWeek>(`roster?branchId=${branchId}${day ? `&day=${day}` : ''}`),
  setShift: (staffId: string, date: string, shift: Shift | null) => post('roster/set', { staffId, date, shift }),

  payroll: (branchId: string, period: string) => get<Payroll>(`payroll?branchId=${branchId}&period=${period}`),
  preparePayroll: (branchId: string, period: string) => post<string>('payroll/generate', { branchId, period }),
  approvePayroll: (runId: string) => post('payroll/approve', { runId }),
  markPayrollPaid: (runId: string) => post('payroll/paid', { runId }),
}
