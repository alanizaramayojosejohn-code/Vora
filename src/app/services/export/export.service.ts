import { inject, Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AuthService } from '../auth/auth.service';
import { OrderStatus, paymentMethodsLabel, PaymentMethod } from '../../models/order.model';
import { ClientSalesSummary, daysSinceLastPurchase } from '../../models/client-sales.model';
import { PayrollPayment, PayrollStatusRow } from '../../models/payroll.model';

export interface SalesReportPaymentLine {
  method: PaymentMethod;
  amount: number;
}

export interface SalesReportRow {
  id: string;
  created_at: string;
  user_name: string | null;
  products_summary: string;
  // Una venta puede haberse cobrado con más de un método (pago dividido), así
  // que el reporte lleva las líneas y no un método único.
  payments: SalesReportPaymentLine[];
  payment_methods: PaymentMethod[];
  total_amount: number;
  // Costo congelado por línea, sumado (spec 002, RF-1, RF-19).
  cost: number;
  profit: number;
  item_count: number;
  // Un pendiente aparece en el listado para no perderlo de vista, pero no
  // cuenta como venta realizada: buildSummary() lo excluye de los totales,
  // igual que income_daily/monthly_income (spec 001 RF-20, spec 002 RF-8).
  status: OrderStatus;
}

export interface SalesSummary {
  total: number;
  cost: number;
  profit: number;
  transactions: number;
  avgTicket: number;
  byMethod: Record<PaymentMethod, number>;
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly auth = inject(AuthService);

  exportSalesToExcel(rows: SalesReportRow[], summary: SalesSummary, dateRange: string): void {
    const businessName = this.auth.businessName() ?? 'Negocio';
    const filename = `ventas_${businessName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const summaryRows = [
      ['Reporte de Ventas — ' + businessName],
      ['Período: ' + dateRange],
      [],
      ['RESUMEN'],
      ['Total ingresos', summary.total],
      ['Costo', summary.cost],
      ['Ganancia bruta', summary.profit],
      ['Transacciones', summary.transactions],
      ['Ticket promedio', summary.avgTicket],
      ['Efectivo', summary.byMethod.cash],
      ['Tarjeta', summary.byMethod.card],
      ['QR', summary.byMethod.qr],
      [],
      ['DETALLE — el resumen de arriba solo cuenta lo cobrado; los pendientes aparecen abajo sin sumar al total'],
      ['Fecha', 'Hora', 'Usuario', 'Productos', 'Estado', 'Método de pago', 'Ítems', 'Total (Bs.)', 'Costo (Bs.)', 'Ganancia (Bs.)'],
    ];

    const detailRows = rows.map((r) => {
      const d = new Date(r.created_at);
      return [
        d.toLocaleDateString('es-BO'),
        d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }),
        r.user_name ?? '—',
        r.products_summary,
        r.status === 'pending' ? 'Pendiente' : 'Cobrada',
        paymentMethodsLabel(r.payment_methods),
        r.item_count,
        r.total_amount,
        r.cost,
        r.profit,
      ];
    });

    const wsData = [...summaryRows, ...detailRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Ancho de columnas
    ws['!cols'] = [
      { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 40 }, { wch: 12 }, { wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
    XLSX.writeFile(wb, filename);
  }

  exportSalesToPdf(rows: SalesReportRow[], summary: SalesSummary, dateRange: string): void {
    const businessName = this.auth.businessName() ?? 'Negocio';
    const filename = `ventas_${businessName}_${new Date().toISOString().slice(0, 10)}.pdf`;

    const doc = new jsPDF({ orientation: 'landscape' });

    // Encabezado
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Reporte de Ventas', 14, 18);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(businessName, 14, 26);
    doc.text('Período: ' + dateRange, 14, 32);

    // Tarjetas de resumen
    const summaryY = 42;
    const cards = [
      { label: 'Total ingresos', value: 'Bs. ' + summary.total.toFixed(2) },
      { label: 'Costo', value: 'Bs. ' + summary.cost.toFixed(2) },
      { label: 'Ganancia bruta', value: 'Bs. ' + summary.profit.toFixed(2) },
      { label: 'Transacciones', value: String(summary.transactions) },
      { label: 'Ticket promedio', value: 'Bs. ' + summary.avgTicket.toFixed(2) },
      { label: 'Efectivo', value: 'Bs. ' + summary.byMethod.cash.toFixed(2) },
      { label: 'Tarjeta', value: 'Bs. ' + summary.byMethod.card.toFixed(2) },
      { label: 'QR', value: 'Bs. ' + summary.byMethod.qr.toFixed(2) },
    ];

    const cardW = 34;
    const cardH = 14;
    const cardGap = 3;
    cards.forEach((card, i) => {
      const x = 14 + i * (cardW + cardGap);
      doc.setFillColor(245, 245, 247);
      doc.roundedRect(x, summaryY, cardW, cardH, 2, 2, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(card.label, x + 3, summaryY + 5);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30);
      doc.text(card.value, x + 3, summaryY + 11.5);
    });

    // Tabla. Los pendientes aparecen para no perderlos de vista, pero las
    // tarjetas de resumen de arriba solo cuentan lo cobrado (buildSummary).
    autoTable(doc, {
      startY: summaryY + cardH + 8,
      head: [['Fecha', 'Hora', 'Usuario', 'Productos', 'Estado', 'Pago', 'Ítems', 'Total (Bs.)', 'Costo (Bs.)', 'Ganancia (Bs.)']],
      body: rows.map((r) => {
        const d = new Date(r.created_at);
        return [
          d.toLocaleDateString('es-BO'),
          d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }),
          r.user_name ?? '—',
          r.products_summary,
          r.status === 'pending' ? 'Pendiente' : 'Cobrada',
          paymentMethodsLabel(r.payment_methods),
          r.item_count,
          r.total_amount.toFixed(2),
          r.cost.toFixed(2),
          r.profit.toFixed(2),
        ];
      }),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 250] },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 13 },
        2: { cellWidth: 22 },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 16 },
        5: { cellWidth: 18 },
        6: { cellWidth: 11, halign: 'center' },
        7: { cellWidth: 18, halign: 'right' },
        8: { cellWidth: 18, halign: 'right' },
        9: { cellWidth: 20, halign: 'right' },
      },
    });

    // Pie de página
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(160);
      doc.text(
        `Página ${i} de ${pageCount} · Generado ${new Date().toLocaleString('es-BO')}`,
        14,
        doc.internal.pageSize.height - 6,
      );
    }

    doc.save(filename);
  }

  // ── Clientes ────────────────────────────────────────────────────────────

  exportClientsToExcel(rows: ClientSalesSummary[], viewLabel: string): void {
    const businessName = this.auth.businessName() ?? 'Negocio';
    const filename = `clientes_${businessName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const header = [
      ['Reporte de Clientes — ' + businessName],
      [viewLabel],
      [],
      ['Cliente', 'NIT', 'CI', 'Teléfono', 'Compras', 'Total gastado (Bs.)', 'Ticket promedio (Bs.)', 'Última compra', 'Días sin comprar'],
    ];

    const body = rows.map((r) => {
      const days = daysSinceLastPurchase(r);
      return [
        r.name,
        r.nit ?? '—',
        r.ci ?? '—',
        r.phone ?? '—',
        r.orders_count,
        r.total_spent,
        r.avg_ticket,
        r.last_purchase_at ? new Date(r.last_purchase_at).toLocaleDateString('es-BO') : 'Nunca',
        days ?? '—',
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([...header, ...body]);
    ws['!cols'] = [
      { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, filename);
  }

  exportClientsToPdf(rows: ClientSalesSummary[], viewLabel: string): void {
    const businessName = this.auth.businessName() ?? 'Negocio';
    const filename = `clientes_${businessName}_${new Date().toISOString().slice(0, 10)}.pdf`;

    const doc = new jsPDF();
    this.pdfHeader(doc, 'Reporte de Clientes', businessName, viewLabel);

    autoTable(doc, {
      startY: 42,
      head: [['Cliente', 'NIT / CI', 'Compras', 'Total (Bs.)', 'Ticket (Bs.)', 'Última compra']],
      body: rows.map((r) => [
        r.name,
        r.nit ?? r.ci ?? '—',
        r.orders_count,
        r.total_spent.toFixed(2),
        r.avg_ticket.toFixed(2),
        r.last_purchase_at ? new Date(r.last_purchase_at).toLocaleDateString('es-BO') : 'Nunca',
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 250] },
      columnStyles: {
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    });

    this.pdfFooter(doc);
    doc.save(filename);
  }

  // ── Planilla ────────────────────────────────────────────────────────────

  exportPayrollToExcel(
    status: PayrollStatusRow[],
    payments: PayrollPayment[],
    periodLabel: string,
  ): void {
    const businessName = this.auth.businessName() ?? 'Negocio';
    const filename = `planilla_${businessName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const totalExpected = status.reduce((s, r) => s + r.expected, 0);
    const totalPaid = status.reduce((s, r) => s + r.paid, 0);
    const totalPending = status.reduce((s, r) => s + r.pending, 0);

    const statusSheet = [
      ['Planilla — ' + businessName],
      ['Período: ' + periodLabel],
      [],
      ['RESUMEN'],
      ['Total esperado', totalExpected],
      ['Total pagado', totalPaid],
      ['Total pendiente', totalPending],
      [],
      ['Empleado', 'Cargo', 'Sueldo (Bs.)', 'Pagado (Bs.)', 'Pendiente (Bs.)', 'Estado'],
      ...status.map((r) => [
        r.employee.name,
        r.employee.position,
        r.expected,
        r.paid,
        r.pending,
        r.isPaid ? 'Pagado' : r.paid > 0 ? 'Parcial' : 'Sin pagar',
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(statusSheet);
    ws['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 12 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planilla');

    // El detalle va en su propia hoja: mezclar el estado por empleado con los
    // pagos sueltos en una sola tabla haría ilegibles a las dos.
    if (payments.length > 0) {
      const detail = [
        ['Fecha', 'Empleado', 'Cargo', 'Monto (Bs.)', 'Nota'],
        ...payments.map((p) => [
          new Date(p.paid_at).toLocaleDateString('es-BO'),
          p.employee_name,
          p.employee_position,
          Number(p.amount),
          p.notes ?? '',
        ]),
      ];
      const wsDetail = XLSX.utils.aoa_to_sheet(detail);
      wsDetail['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Pagos');
    }

    XLSX.writeFile(wb, filename);
  }

  exportPayrollToPdf(
    status: PayrollStatusRow[],
    payments: PayrollPayment[],
    periodLabel: string,
  ): void {
    const businessName = this.auth.businessName() ?? 'Negocio';
    const filename = `planilla_${businessName}_${new Date().toISOString().slice(0, 10)}.pdf`;

    const doc = new jsPDF();
    this.pdfHeader(doc, 'Planilla', businessName, 'Período: ' + periodLabel);

    autoTable(doc, {
      startY: 42,
      head: [['Empleado', 'Cargo', 'Sueldo', 'Pagado', 'Pendiente', 'Estado']],
      body: status.map((r) => [
        r.employee.name,
        r.employee.position,
        r.expected.toFixed(2),
        r.paid.toFixed(2),
        r.pending.toFixed(2),
        r.isPaid ? 'Pagado' : r.paid > 0 ? 'Parcial' : 'Sin pagar',
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 250] },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    });

    if (payments.length > 0) {
      autoTable(doc, {
        head: [['Fecha', 'Empleado', 'Monto', 'Nota']],
        body: payments.map((p) => [
          new Date(p.paid_at).toLocaleDateString('es-BO'),
          p.employee_name,
          Number(p.amount).toFixed(2),
          p.notes ?? '—',
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [70, 70, 70], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 250] },
        columnStyles: { 2: { halign: 'right' } },
      });
    }

    this.pdfFooter(doc);
    doc.save(filename);
  }

  // ── Piezas compartidas de los PDF ───────────────────────────────────────

  private pdfHeader(doc: jsPDF, title: string, businessName: string, subtitle: string): void {
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, 18);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(businessName, 14, 26);
    doc.text(subtitle, 14, 32);
  }

  private pdfFooter(doc: jsPDF): void {
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(160);
      doc.text(
        `Página ${i} de ${pageCount} · Generado ${new Date().toLocaleString('es-BO')}`,
        14,
        doc.internal.pageSize.height - 6,
      );
    }
  }
}
