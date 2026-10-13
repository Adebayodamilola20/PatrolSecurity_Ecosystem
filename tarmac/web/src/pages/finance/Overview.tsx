import { useNavigate } from 'react-router-dom'
import { finance } from '../../services/finance'
import { useAuthStore } from '../../stores/useAuthStore'
import { dateTimeLabel, naira } from './format'
import {
  Empty, Failed, Loading, Page, Panel, Row, Rows, Stats, Status,
} from './ui'
import { useData } from './hooks'

function greeting() {
  const hour = new Date(Date.now() + 60 * 60 * 1000).getUTCHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

export default function FinanceOverview() {
  const navigate = useNavigate()
  const name = useAuthStore((s) => s.user?.name?.split(' ')[0])
  const { data, error, loading, reload } = useData(() => finance.overview())

  return (
    <Page title={`${greeting()}${name ? `, ${name}` : ''}`} help={data ? `Here is where Tarmac's money stands for ${data.periodLabel}.` : undefined}>
      {loading && !data && <Loading />}
      {error && <Failed message={error} onRetry={reload} />}
      {data && (
        <>
          <Stats
            items={[
              { label: 'Received this month', value: naira(data.receivedKobo) },
              {
                label: 'Owed by clients',
                value: naira(data.owedKobo),
                note: data.overdueKobo ? `${naira(data.overdueKobo)} of it is late` : 'Nothing is late',
                tone: data.overdueKobo ? 'bad' : undefined,
              },
              { label: 'On hold', value: naira(data.heldKobo), note: data.heldKobo ? 'Waiting to be released' : 'Nothing on hold', tone: data.heldKobo ? 'warn' : undefined },
            ]}
          />

          <Panel title="Things to do">
            {data.todo.length === 0 ? (
              <Empty title="All done" text="Nothing needs your attention right now." />
            ) : (
              <Rows>
                {data.todo.map((t, i) => (
                  <Row
                    key={i}
                    title={t.text}
                    sub={t.detail || undefined}
                    status={t.urgent ? <Status tone="bad">Urgent</Status> : undefined}
                    onClick={() => navigate(t.to)}
                  />
                ))}
              </Rows>
            )}
          </Panel>

          <Panel title="Latest payments">
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
