/**
 * Choosing a bank account the way an elder would at a bank counter: pick the
 * bank, type the number, and the bank tells you whose account it is before
 * anything is saved. The server checks again when saving.
 */
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { finance, type Bank, type CheckedAccount } from '../../services/finance'
import { Btn, Field, SelectInput, TextInput } from './ui'

// The banks most staff and partners use, shown first. Codes as Monnify lists them.
const COMMON = ['044', '050', '070', '011', '214', '058', '082', '50515', '076', '101', '221', '232', '032', '033', '215', '035', '057']

let bankCache: Promise<Bank[]> | null = null
function loadBanks() {
  bankCache ??= finance.banks().catch((err) => {
    bankCache = null
    throw err
  })
  return bankCache
}

export type BankChoice = {
  bankCode: string
  accountNumber: string
  checked: CheckedAccount | null
  /** Typed by hand — only where `allowTyped` and Monnify is not connected. */
  bankName?: string
}

// eslint-disable-next-line react-refresh/only-export-components
export const emptyBankChoice = (a?: { bankCode?: string | null; accountNumber?: string | null; bankName?: string | null } | null): BankChoice => ({
  bankCode: a?.bankCode ?? '',
  accountNumber: a?.accountNumber ?? '',
  bankName: a?.bankName ?? '',
  checked: null,
})

/**
 * Bank + account number. As soon as the 10th digit is typed the bank is asked
 * whose account it is and the name appears underneath, as in banking apps.
 * `value.checked` is filled only for exactly this bank and number.
 */
export function BankAccountFields({
  value,
  onChange,
  numberLabel = 'Account number',
  whose,
  allowTyped,
}: {
  value: BankChoice
  onChange: (v: BankChoice) => void
  numberLabel?: string
  /** Without Monnify, let the bank and number be typed (staff only; money is never sent there). */
  allowTyped?: boolean
  /** e.g. "the Abuja partner" — used in the sentence under the name. */
  whose?: string
}) {
  const [banks, setBanks] = useState<Bank[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    loadBanks()
      .then((b) => live && setBanks(b))
      .catch((err) => live && setLoadError(err instanceof Error ? err.message : 'Could not load the banks'))
    return () => {
      live = false
    }
  }, [])

  const common = (banks ?? []).filter((b) => COMMON.includes(b.code))
  const options = [
    ...common.map((b) => ({ value: b.code, label: b.name })),
    ...(banks ?? []).filter((b) => !COMMON.includes(b.code)).map((b) => ({ value: b.code, label: b.name })),
  ]
  const digits = value.accountNumber.replace(/\D/g, '')
  const canCheck = !!value.bankCode && digits.length === 10

  // Always call the latest onChange/value from the async check below.
  const latest = useRef({ value, onChange })
  useEffect(() => {
    latest.current = { value, onChange }
  })
  const asked = useRef('')

  const check = async (key: string) => {
    asked.current = key
    setChecking(true)
    setError(null)
    try {
      const checked = await finance.checkAccount(value.bankCode, digits)
      if (asked.current !== key) return // the number changed while we waited
      latest.current.onChange({ ...latest.current.value, accountNumber: digits, checked })
    } catch (err) {
      if (asked.current !== key) return
      setError(err instanceof Error ? err.message : 'Account not found')
    } finally {
      if (asked.current === key) setChecking(false)
    }
  }

  // Ask the bank by itself once a bank is chosen and all 10 digits are in.
  const key = canCheck ? `${value.bankCode}:${digits}` : ''
  useEffect(() => {
    if (!key || value.checked || asked.current === key) return
    const t = window.setTimeout(() => void check(key), 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value.checked])

  if ((loadError || (banks && banks.length === 0)) && allowTyped) {
    return (
      <div className="space-y-4">
        <Field label="Bank"><TextInput value={value.bankName ?? ''} onChange={(e) => onChange({ ...value, bankName: e.target.value })} placeholder="e.g. First Bank" /></Field>
        <Field label={numberLabel} hint="10 digits. It will be checked with the bank once Monnify is connected.">
          <TextInput value={value.accountNumber} inputMode="numeric" onChange={(e) => onChange({ ...value, accountNumber: e.target.value.replace(/[^\d ]/g, '') })} />
        </Field>
      </div>
    )
  }

  if (loadError || (banks && banks.length === 0)) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        Bank accounts can be added once Monnify is connected, so the bank can confirm whose account it is.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Field label="Bank">
        <SelectInput
          value={value.bankCode}
          onChange={(bankCode) => {
            setError(null)
            setChecking(false)
            asked.current = ''
            onChange({ ...value, bankCode, bankName: '', checked: null })
          }}
          options={options}
          placeholder={banks ? 'Choose the bank' : 'Loading banks…'}
          required
        />
      </Field>
      <Field label={numberLabel} hint="10 digits. The name appears by itself once all 10 are typed.">
        <TextInput
          value={value.accountNumber}
          inputMode="numeric"
          maxLength={13}
          required
          className="text-lg tracking-wider"
          onChange={(e) => {
            setError(null)
            setChecking(false)
            asked.current = ''
            onChange({ ...value, accountNumber: e.target.value.replace(/[^\d ]/g, ''), bankName: '', checked: null })
          }}
        />
      </Field>

      {value.checked ? (
        <div className="flex gap-3.5 rounded-2xl bg-emerald-50 px-5 py-4 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" role="status">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
          <div>
            <div className="text-[15px]">{value.checked.bankName} says this account belongs to</div>
            <div className="mt-1 text-[22px] font-semibold tracking-wide text-emerald-950 dark:text-white">{value.checked.accountName}</div>
            <div className="mt-1.5 text-[15px]">If this is not {whose ?? 'the right person'}, change the number before saving.</div>
          </div>
        </div>
      ) : error ? (
        <div className="flex gap-3.5 rounded-2xl bg-red-50 px-5 py-4 text-red-800 dark:bg-red-500/15 dark:text-red-200" role="alert">
          <AlertCircle className="mt-0.5 h-6 w-6 shrink-0" />
          <div>
            <div className="text-lg font-semibold">{/not found/i.test(error) ? 'Account not found' : 'Could not check'}</div>
            <div className="mt-0.5 text-[15px]">{error.replace(/^Account not found\.\s*/i, '')} Nothing has been saved.</div>
          </div>
        </div>
      ) : null}

      {checking && !value.checked && (
        <div className="flex items-center gap-2.5 text-[15px] text-muted-foreground" role="status">
          <Loader2 className="h-5 w-5 animate-spin" /> Asking the bank whose account this is…
        </div>
      )}
      {error && !checking && (
        <Btn variant="secondary" onClick={() => void check(key)} disabled={!canCheck}>
          Try again
        </Btn>
      )}
    </div>
  )
}
