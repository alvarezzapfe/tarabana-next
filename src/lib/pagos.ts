/**
 * Centralized payment method definitions.
 * Must match the check constraint on pagos.metodo in the DB.
 */
export const METODOS_PAGO = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'efectivo',      label: 'Efectivo' },
  { value: 'deposito',      label: 'Deposito' },
  { value: 'cheque',        label: 'Cheque' },
  { value: 'tarjeta',       label: 'Tarjeta' },
  { value: 'otro',          label: 'Otro' },
] as const
