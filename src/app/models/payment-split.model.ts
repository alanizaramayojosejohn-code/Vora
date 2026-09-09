import { PaymentMethod } from './order.model';

// Una línea de un cobro. Un pago simple es una sola línea; uno dividido, varias
// (RF-10).
export interface PaymentLine {
  method: PaymentMethod;
  amount: number;
}

export interface PaymentSplitCheck {
  valid: boolean;
  // Lo que suman las líneas y lo que falta (positivo) o sobra (negativo) para
  // llegar al total. La UI los muestra mientras el cajero reparte el monto.
  sum: number;
  difference: number;
  error: string | null;
}

// Todo se compara en centavos enteros. Sumar 0.1 + 0.2 en coma flotante da
// 0.30000000000000004, y una validación de "tiene que dar exacto" que rechaza
// un reparto correcto es peor que no validar nada.
function toCents(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

function formatBob(cents: number): string {
  return (cents / 100).toFixed(2);
}

// RF-11: la suma de las líneas tiene que ser exactamente el total del pedido.
export function validatePaymentSplit(lines: PaymentLine[], total: number): PaymentSplitCheck {
  const totalCents = toCents(total);
  const sumCents = lines.reduce((acc, line) => acc + toCents(line.amount), 0);
  const differenceCents = totalCents - sumCents;

  const base = {
    sum: sumCents / 100,
    difference: differenceCents / 100,
  };

  if (lines.some((line) => toCents(line.amount) <= 0)) {
    return { ...base, valid: false, error: 'Cada línea de pago debe tener un monto mayor a cero.' };
  }

  if (lines.length === 0 && totalCents > 0) {
    return { ...base, valid: false, error: 'Agrega al menos una línea de pago.' };
  }

  if (differenceCents > 0) {
    return { ...base, valid: false, error: `Faltan Bs ${formatBob(differenceCents)} por asignar.` };
  }

  if (differenceCents < 0) {
    return { ...base, valid: false, error: `Te pasaste por Bs ${formatBob(-differenceCents)}.` };
  }

  return { ...base, valid: true, error: null };
}

// Monto sugerido para una línea nueva: lo que falta para completar el total.
// Con esto, el caso más común —dos líneas, una de ellas por el resto— se
// resuelve sin que el cajero saque la cuenta.
export function remainingAmount(lines: PaymentLine[], total: number): number {
  const remaining = toCents(total) - lines.reduce((acc, line) => acc + toCents(line.amount), 0);
  return remaining > 0 ? remaining / 100 : 0;
}
