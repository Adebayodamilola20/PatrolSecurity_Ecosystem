import { finance } from '../../services/finance'
import { dateTimeLabel, naira } from './format'
import { Empty, Failed, Loading, Page, Panel, Status } from './ui'
import { useData } from './hooks'

/** Every share that has left the Head Office account, newest first. */
export default function MoneyHistory() {
  const { data, error, loading, reload } = useData(() => finance.payouts())
  const total = data?.sent.reduce((s, x) => s + x.amountKobo, 0) ?? 0
  return (
    <Page title="History" help="Every payment sent from the Head Office account to a branch, newest first.">
      {loading && !data && <Loading />}
      {error && <Failed message={error} onRetry={reload} />}
      {data && (
        <Panel title={data.sent.length ? `${data.sent.length} sent · ${naira(total)}` : 'Sent'}>
          {data.sent.length === 0 ? (
            <Empty title="Nothing sent yet" text="Money shows here once it has reached a branch's bank account." />
          ) : (
            <div className="divide-y divide-border">
              {data.sent.map((x) => (
                <div key={x.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <div className="font-semibold">{x.toName ?? x.shareLabel}</div>
                    <div className="mt-0.5 text-[15px] text-muted-foreground">
                      {x.sentAt ? dateTimeLabel(x.sentAt) : ''} · {x.bankName} {x.accountNumber} · {x.accountName} · from {x.clientName}'s payment · ref {x.reference}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-semibold tabular-nums">{naira(x.amountKobo)}</span>
                    <Status tone="good">Sent</Status>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </Page>
  )
}
