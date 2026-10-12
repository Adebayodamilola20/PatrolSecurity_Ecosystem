import { Download, Plus } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { STAFF } from './sample'
import { Button, Figures, Initials, Pill, SampleBanner, SearchBox, Section, Select, Table, Td } from './ui'
import { naira } from './format'

const STATUS = {
  active: <Pill tone="green">Active</Pill>,
  leave: <Pill tone="blue">On leave</Pill>,
  suspended: <Pill tone="amber">Suspended</Pill>,
}

export default function FinanceStaff() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="People"
        title="Staff Records"
        blurb="Every guard, supervisor and office staff member: where they work, their documents, and their pay details."
        actions={
          <>
            <Button variant="outline"><Download className="h-4 w-4" /> Import list</Button>
            <Button><Plus className="h-4 w-4" /> Add staff</Button>
          </>
        }
      />
      <SampleBanner />

      <Figures
        items={[
          { label: 'Staff', value: '662', note: 'All branches' },
          { label: 'Guards', value: '598' },
          { label: 'On leave', value: '14' },
          { label: 'Guarantor not verified', value: '9', tone: 'amber' },
        ]}
      />

      <Section
        title="Staff"
        action={<Select options={['All branches', 'Jos', 'Abuja', 'Lagos', 'Port Harcourt', 'Owerri', 'Yola', 'Lafia']} />}
      >
        <div className="border-b border-border p-3 sm:px-5">
          <SearchBox placeholder="Name or staff ID" />
        </div>
        <Table
          head={[
            { label: 'Name' },
            { label: 'Role' },
            { label: 'Branch and post' },
            { label: 'Basic pay', align: 'right' },
            { label: 'Guarantor' },
            { label: 'Status' },
          ]}
        >
          {STAFF.map((s) => (
            <tr key={s.staffId} className="hover:bg-muted/40">
              <Td>
                <div className="flex items-center gap-3">
                  <Initials name={s.name} />
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{s.staffId}</div>
                  </div>
                </div>
              </Td>
              <Td>{s.role}</Td>
              <Td>
                <div>{s.site}</div>
                <div className="text-xs text-muted-foreground">{s.branch}</div>
              </Td>
              <Td align="right">{naira(s.basic)}</Td>
              <Td>{s.guarantor === 'verified' ? <Pill tone="green">Verified</Pill> : <Pill tone="amber">Pending</Pill>}</Td>
              <Td>{STATUS[s.status]}</Td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  )
}
