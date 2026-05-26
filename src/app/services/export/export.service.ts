import { inject, Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AuthService } from '../auth/auth.service';
import { PAYMENT_METHOD_LABEL, PaymentMethod } from '../../models/order.model';

export interface SalesReportRow {
  id: string;
  created_at: string;
  user_name: string | null;
  products_summary: string;
  payment_method: PaymentMethod;
  total_amount: number;
  item_count: number;
}

export interface SalesSummary {
  total: number;
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
      ['Transacciones', summary.transactions],
      ['Ticket promedio', summary.avgTicket],
      ['Efectivo', summary.byMethod.cash],
      ['Tarjeta', summary.byMethod.card],
      ['QR', summary.byMethod.qr],
      [],
      ['DETALLE'],
      ['Fecha', 'Hora', 'Usuario', 'Productos', 'Método de pago', 'Ítems', 'Total (Bs.)'],
    ];

    const detailRows = rows.map((r) => {
      const d = new Date(r.created_at);
      return [
        d.toLocaleDateString('es-BO'),
        d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }),
        r.user_name ?? '—',
        r.products_summary,
        PAYMENT_METHOD_LABEL[r.payment_method],
        r.item_count,
        r.total_amount,
      ];
    });

    const wsData = [...summaryRows, ...detailRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Ancho de columnas
    ws['!cols'] = [
      { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 40 }, { wch: 16 }, { wch: 8 }, { wch: 14 },
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
      { label: 'Transacciones', value: String(summary.transactions) },
      { label: 'Ticket promedio', value: 'Bs. ' + summary.avgTicket.toFixed(2) },
      { label: 'Efectivo', value: 'Bs. ' + summary.byMethod.cash.toFixed(2) },
      { label: 'Tarjeta', value: 'Bs. ' + summary.byMethod.card.toFixed(2) },
      { label: 'QR', value: 'Bs. ' + summary.byMethod.qr.toFixed(2) },
    ];

    const cardW = 44;
    const cardH = 14;
    const cardGap = 4;
    cards.forEach((card, i) => {
      const x = 14 + i * (cardW + cardGap);
      doc.setFillColor(245, 245, 247);
      doc.roundedRect(x, summaryY, cardW, cardH, 2, 2, 'F');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(card.label, x + 3, summaryY + 5);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30);
      doc.text(card.value, x + 3, summaryY + 11.5);
    });

    // Tabla
    autoTable(doc, {
      startY: summaryY + cardH + 8,
      head: [['Fecha', 'Hora', 'Usuario', 'Productos', 'Pago', 'Ítems', 'Total (Bs.)']],
      body: rows.map((r) => {
        const d = new Date(r.created_at);
        return [
          d.toLocaleDateString('es-BO'),
          d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }),
          r.user_name ?? '—',
          r.products_summary,
          PAYMENT_METHOD_LABEL[r.payment_method],
          r.item_count,
          r.total_amount.toFixed(2),
        ];
      }),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 250] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 16 },
        2: { cellWidth: 30 },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 22 },
        5: { cellWidth: 14, halign: 'center' },
        6: { cellWidth: 24, halign: 'right' },
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
}
