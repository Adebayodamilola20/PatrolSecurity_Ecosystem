import { Navigate } from 'react-router-dom'

/** Partners are now managed on each branch (Money out page). Old links land there. */
export default function FinancePartners() {
  return <Navigate to="/finance/money-out" replace />
}
