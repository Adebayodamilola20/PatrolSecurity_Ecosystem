import { PageHeader } from '../../components/ui/PageHeader'

/** Placeholder for a finance-package page that is not built yet. */
export default function FinancePage({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={eyebrow} title={title} />
    </div>
  )
}
