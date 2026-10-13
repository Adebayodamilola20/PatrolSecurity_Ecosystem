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
  splitBps: Split
  salaryBankName: string | null
  salaryAccountNumber: string | null
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
  addTarmacBranches: () => post('branches/add-tarmac'),
  createBranch: (name: string) => post('branches/create', { name }),
  updateBranch: (b: { branchId: string; name?: string; salaryBankName?: string; salaryAccountNumber?: string }) => post('branches/update', b),
  setHold: (branchId: string, onHold: boolean, note?: string) => post('branches/hold', { branchId, onHold, note }),
  setSplit: (branchId: string, splitBps: Split) => post('branches/split', { branchId, splitBps }),

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
