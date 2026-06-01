import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ChangeOrder, ChangeOrderItem, Firm, Project } from "@prisma/client";

type CostCodeLite = { code: string; name: string } | null;

type ItemWithCode = ChangeOrderItem & { costCode: CostCodeLite };

export type COForPdf = ChangeOrder & {
  firm: Pick<Firm, "name" | "legalName">;
  project: Pick<Project, "title" | "address">;
  items: ItemWithCode[];
  requestedBy: { name: string | null };
};

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  header: { marginBottom: 18 },
  firmName: { fontSize: 14, fontWeight: 700 },
  legal: { fontSize: 9, color: "#64748b", marginTop: 2 },
  docTitle: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: 700,
    textAlign: "center",
  },
  meta: { marginTop: 14, fontSize: 10 },
  metaRow: { flexDirection: "row", marginBottom: 4 },
  metaLabel: { width: 120, color: "#64748b" },
  metaValue: { flex: 1 },
  section: { marginTop: 12, fontSize: 11, fontWeight: 700 },
  paragraph: { marginTop: 6, lineHeight: 1.45 },
  table: { marginTop: 10, borderTop: "1px solid #cbd5e1" },
  row: {
    flexDirection: "row",
    borderBottom: "1px solid #e2e8f0",
    paddingVertical: 6,
  },
  th: { fontWeight: 700, backgroundColor: "#f1f5f9" },
  cellNo: { width: 24, paddingLeft: 4 },
  cellCode: { width: 60 },
  cellDesc: { flex: 1, paddingRight: 4 },
  cellUnit: { width: 40 },
  cellQty: { width: 50, textAlign: "right" },
  cellPrice: { width: 70, textAlign: "right" },
  cellSum: { width: 80, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    marginTop: 8,
    paddingVertical: 6,
    borderTop: "1px solid #0f172a",
  },
  totalLabel: { flex: 1, textAlign: "right", fontWeight: 700, paddingRight: 8 },
  totalValue: { width: 100, textAlign: "right", fontWeight: 700 },
  signatures: { flexDirection: "row", marginTop: 36 },
  sigBlock: { flex: 1, paddingRight: 16 },
  sigLabel: { fontSize: 9, color: "#64748b", marginBottom: 24 },
  sigLine: { borderTop: "1px solid #0f172a", paddingTop: 4 },
});

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const TYPE_LABEL: Record<string, string> = {
  ADD: "Додавання обсягу",
  REMOVE: "Зменшення обсягу",
  SWAP: "Заміна обсягу",
};

function ChangeOrderDocument({ co }: { co: COForPdf }) {
  const total = co.items.reduce(
    (acc, item) => acc + Number(item.totalPrice),
    0,
  );
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.firmName}>{co.firm.name}</Text>
          {co.firm.legalName && (
            <Text style={styles.legal}>{co.firm.legalName}</Text>
          )}
        </View>
        <Text style={styles.docTitle}>Додаткова угода {co.number}</Text>
        <View style={styles.meta}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Обʼєкт:</Text>
            <Text style={styles.metaValue}>
              {co.project.title}
              {co.project.address ? ` · ${co.project.address}` : ""}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Тип зміни:</Text>
            <Text style={styles.metaValue}>
              {TYPE_LABEL[co.type] ?? co.type}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Зміна терміну:</Text>
            <Text style={styles.metaValue}>
              {co.scheduleImpactDays > 0 ? "+" : ""}
              {co.scheduleImpactDays} днів
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Сформовано:</Text>
            <Text style={styles.metaValue}>
              {formatDate(co.requestedAt)} · {co.requestedBy.name ?? "—"}
            </Text>
          </View>
        </View>
        <Text style={styles.section}>Суть зміни</Text>
        <Text style={styles.paragraph}>{co.title}</Text>
        {co.description && (
          <Text style={styles.paragraph}>{co.description}</Text>
        )}
        {co.reasonFromClient && (
          <View>
            <Text style={styles.section}>Обґрунтування замовника</Text>
            <Text style={styles.paragraph}>{co.reasonFromClient}</Text>
          </View>
        )}
        <Text style={styles.section}>Зміни до кошторису</Text>
        <View style={styles.table}>
          <View style={[styles.row, styles.th]}>
            <Text style={styles.cellNo}>№</Text>
            <Text style={styles.cellCode}>Шифр</Text>
            <Text style={styles.cellDesc}>Опис</Text>
            <Text style={styles.cellUnit}>Од.</Text>
            <Text style={styles.cellQty}>Кількість</Text>
            <Text style={styles.cellPrice}>Ціна</Text>
            <Text style={styles.cellSum}>Сума</Text>
          </View>
          {co.items.map((item, idx) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.cellNo}>{idx + 1}</Text>
              <Text style={styles.cellCode}>{item.costCode?.code ?? "—"}</Text>
              <Text style={styles.cellDesc}>{item.description}</Text>
              <Text style={styles.cellUnit}>{item.unit}</Text>
              <Text style={styles.cellQty}>
                {item.sign < 0 ? "-" : ""}
                {Number(item.qty)}
              </Text>
              <Text style={styles.cellPrice}>
                {formatMoney(Number(item.unitPrice))}
              </Text>
              <Text style={styles.cellSum}>
                {formatMoney(Number(item.totalPrice))}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Разом, грн:</Text>
          <Text style={styles.totalValue}>{formatMoney(total)}</Text>
        </View>
        <View style={styles.signatures}>
          <View style={styles.sigBlock}>
            <Text style={styles.sigLabel}>Підрядник: {co.firm.name}</Text>
            <Text style={styles.sigLine}>Підпис, дата</Text>
          </View>
          <View style={styles.sigBlock}>
            <Text style={styles.sigLabel}>Замовник</Text>
            <Text style={styles.sigLine}>Підпис, дата</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generateChangeOrderPdf(co: COForPdf): Promise<Buffer> {
  return renderToBuffer(<ChangeOrderDocument co={co} />);
}
