import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { finance, type MoneyCheck } from '../../services/finance'
import { useAuthStore } from '../../stores/useAuthStore'
import { cx, dateTimeLabel, naira, thisPeriod } from './format'
import {
  Btn, Empty, Failed, Hero, HeroFigure, Loading, Page, Panel, Row, Rows, SplitBar, Status, Steps,
} from './ui'
import { useData, useSave } from './hooks'

function greeting() {
  const hour = new Date(Date.now() + 60 * 60 * 1000).getUTCHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

function today() {
  return new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' })
}

export default function FinanceOverview() {
  const navigate = useNavigate()
  const name = useAuthStore((s) => s.user?.name?.split(' ')[0])
  const { data, error, loading, reload } = useData(async () => {
    const [overview, payments, payouts, balance] = await Promise.all([
      finance.overview(),
      finance.payments(thisPeriod()),
      finance.payouts().catch(() => null),
      finance.balance().catch(() => null),
    ])
    return { ...overview, split: payments.sharedSplit, payouts, balance }
  })
  const s = data?.split

  return (
    <Page
      title={`${greeting()}${name ? `, ${name}` : ''}`}
      help={today()}
      action={<Btn onClick={() => navigate('/finance/payments')}>Record a payment</Btn>}
    >
      {loading && !data && <Loading />}
      {error && <Failed message={error} onRetry={reload} />}
      {data && s && (
        <>
          <Hero
            label="Head Office balance (Monnify)"
            value={data.balance?.available ? naira(data.balance.availableKobo) : '—'}
            sub={
              data.balance?.available
                ? `Right now · ${naira(data.receivedKobo)} came in during ${data.periodLabel.split(' ')[0]}${data.owedKobo ? ` · ${naira(data.owedKobo)} still owed by clients` : ''}`
                : `${data.balance?.reason ?? 'Balance not available'} · ${naira(data.receivedKobo)} came in during ${data.periodLabel.split(' ')[0]}`
            }
            side={
              data.payouts ? (
                <>
                  <HeroFigure label="Sent to banks" value={naira(data.payouts.sentThisMonthKobo)} />
                  <HeroFigure
                    label="Waiting to send"
                    value={naira(data.payouts.waitingKobo + data.payouts.readyKobo)}
                    tone={data.payouts.waitingKobo + data.payouts.readyKobo ? 'warn' : undefined}
                  />
                  {data.heldKobo > 0 && <HeroFigure label="On hold" value={naira(data.heldKobo)} tone="warn" />}
                </>
              ) : undefined
            }
          >
            <SplitBar
              parts={[
                { key: 'hq', label: 'Head Office keeps', amount: naira(s.hq), weight: s.hq },
                { key: 'vat', label: 'VAT', amount: naira(s.vat), weight: s.vat },
                { key: 'partner', label: 'Branch partners', amount: naira(s.partner), weight: s.partner },
                { key: 'salary', label: 'Sent to branches', amount: naira(s.salary), weight: s.salary },
              ]}
            />
          </Hero>

          <Steps
            title="How the money moves"
            steps={[
              { title: 'A client pays', text: 'into their own account number, printed on every invoice.' },
              { title: 'It lands at Head Office', text: "in Head Office's Monnify account — the balance above. The invoice is marked paid." },
              { title: 'Each branch gets its share', text: "by the percentages set for that branch, sent to its salary account (and partner, if it has one)." },
            ]}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Needs you today">
              {data.todo.length === 0 ? (
                <Empty title="All done" text="Nothing needs your attention right now." />
              ) : (
                <Rows>
                  {data.todo.map((t, i) => (
                    <Row
                      key={i}
                      title={<span className="whitespace-normal">{t.text}</span>}
                      sub={t.detail || undefined}
                      status={t.urgent ? <Status tone="bad">Urgent</Status> : undefined}
                      onClick={() => navigate(t.to)}
                    />
                  ))}
                </Rows>
              )}
            </Panel>
            <CheckPanel check={data.check} onRan={reload} />
          </div>

          <Panel title="Latest payments" action={<Btn variant="quiet" onClick={() => navigate('/finance/payments')}>See all</Btn>}>
            {data.latest.length === 0 ? (
              <Empty title="No payments yet this month" />
            ) : (
              <Rows>
                {data.latest.map((p) => (
                  <Row
                    key={p.id}
                    title={p.clientName}
                    sub={dateTimeLabel(p.receivedAt)}
                    right={naira(p.amountKobo)}
                    status={p.state === 'held' ? <Status tone="wait">On hold</Status> : <Status tone="good">Shared</Status>}
                  />
                ))}
              </Rows>
            )}
          </Panel>
        </>
      )}
    </Page>
  )
}

function CheckPanel({ check, onRan }: { check: MoneyCheck | null; onRan: () => void }) {
  const run = useSave()
  const [ran, setRan] = useState<MoneyCheck | null>(null)
  const c = ran ?? check
  const bad = c?.lines.some((l) => l.tone === 'bad')
  const warn = c?.lines.some((l) => l.tone === 'warn')
  return (
    <Panel title="Morning money check" action={c && <span className="text-sm text-muted-foreground">{dateTimeLabel(c.ranAt)}</span>}>
      <div className="space-y-4 px-6 py-5">
        {!c ? (
          <p className="text-[15px] text-muted-foreground">Every morning at 7am the system compares Monnify's records with ours and lists anything that needs a person. It has not run yet.</p>
        ) : (
          <>
            <div
              className={cx(
                'flex items-center gap-3 rounded-xl px-4 py-3.5 font-medium',
                bad ? 'bg-red-50 text-red-800 dark:bg-red-500/15 dark:text-red-200'
                  : warn ? 'bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200'
                    : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200',
              )}
            >
              {bad || warn ? <AlertCircle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
              {bad ? 'Something needs fixing' : warn ? 'Mostly fine — a few things to look at' : 'Monnify and our records match'}
            </div>
            <ul className="space-y-2.5 text-[15px]">
              {c.lines.map((l, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className={cx('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', l.tone === 'bad' ? 'bg-red-600' : l.tone === 'warn' ? 'bg-amber-500' : 'bg-emerald-600')} />
                  {l.text}
                </li>
              ))}
            </ul>
          </>
        )}
        {run.error && <p className="text-[15px] text-destructive">{run.error}</p>}
        <Btn
          variant="secondary"
          busy={run.busy}
          onClick={() =>
            run.run(async () => {
              const result = await finance.runCheck()
              if (result) setRan(result)
              onRan()
            })
          }
        >
          Check now
        </Btn>
      </div>
    </Panel>
  )
}
